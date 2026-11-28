package main

import (
	"context"
	"errors"
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5"
)

const backupBodyLimit = 32 << 20
const backupRecordLimit = 10000

type backupTask struct {
	task
	Done *bool `json:"done"`
}

type jospatBackup struct {
	Format  string `json:"format"`
	Version int    `json:"version"`
	Data    struct {
		Events    []eventInput `json:"events"`
		Tasks     []backupTask `json:"tasks"`
		TaskOrder string       `json:"taskOrder"`
	} `json:"data"`
}

type backupIssue struct {
	Code     string `json:"error"`
	Section  string `json:"section,omitempty"`
	Position int    `json:"position,omitempty"`
	ID       string `json:"id,omitempty"`
	ParentID string `json:"parentId,omitempty"`
}

func (b *jospatBackup) validate() *backupIssue {
	if b.Format != "jospat-backup" || b.Version != 1 || b.Data.Events == nil || b.Data.Tasks == nil {
		return &backupIssue{Code: "unsupported_backup"}
	}
	if len(b.Data.Events)+len(b.Data.Tasks) > backupRecordLimit {
		return &backupIssue{Code: "too_many_backup_records"}
	}
	if b.Data.TaskOrder != "" && !validTaskOrder(b.Data.TaskOrder) {
		return &backupIssue{Code: "invalid_backup_task_order", Section: "taskOrder"}
	}
	eventIDs := make(map[string]struct{}, len(b.Data.Events))
	for i := range b.Data.Events {
		item := &b.Data.Events[i]
		if item.ID == "" || !item.validate() {
			return &backupIssue{Code: "invalid_backup_event", Section: "events", Position: i + 1}
		}
		if _, exists := eventIDs[item.ID]; exists {
			return &backupIssue{Code: "duplicate_backup_event_id", Section: "events", Position: i + 1, ID: item.ID}
		}
		eventIDs[item.ID] = struct{}{}
	}
	taskIDs := make(map[string]struct{}, len(b.Data.Tasks))
	for i := range b.Data.Tasks {
		item := &b.Data.Tasks[i]
		if !recordID.MatchString(item.ID) || item.Done == nil || !item.taskDetails.validate(true) ||
			(item.ParentID != "" && !recordID.MatchString(item.ParentID)) ||
			(item.CopiedFrom != "" && (!recordID.MatchString(item.CopiedFrom) || item.CopiedFrom == item.ID)) ||
			(item.DoneLate && !*item.Done) ||
			(item.ManualOrder != nil && (*item.ManualOrder < 0 || *item.ManualOrder > 9007199254740991)) {
			return &backupIssue{Code: "invalid_backup_task", Section: "tasks", Position: i + 1}
		}
		if _, exists := taskIDs[item.ID]; exists {
			return &backupIssue{Code: "duplicate_backup_task_id", Section: "tasks", Position: i + 1, ID: item.ID}
		}
		taskIDs[item.ID] = struct{}{}
		item.task.Done = *item.Done
		item.Version = 0
	}
	return nil
}

type importCount struct {
	Created int `json:"created"`
	Skipped int `json:"skipped"`
}

type importResult struct {
	Events            importCount `json:"events"`
	Tasks             importCount `json:"tasks"`
	Subtasks          importCount `json:"subtasks"`
	FeaturedConflicts int         `json:"featuredConflicts"`
	TaskOrderImported bool        `json:"taskOrderImported"`
}

func (app *application) importBackup(w http.ResponseWriter, r *http.Request, account user) {
	var backup jospatBackup
	if !readJSONBody(w, r, &backup, backupBodyLimit, false) {
		return
	}
	if issue := backup.validate(); issue != nil {
		respond(w, http.StatusUnprocessableEntity, issue)
		return
	}
	ctx := r.Context()
	tx, err := app.db.Begin(ctx)
	if err != nil {
		databaseError(w, "begin backup import", err)
		return
	}
	defer tx.Rollback(ctx)
	if err := lockPlanner(ctx, tx, account.ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, http.StatusUnauthorized, "authentication_required")
		} else {
			databaseError(w, "lock planner for import", err)
		}
		return
	}
	result, issue, err := importPlannerBackup(ctx, tx, account.ID, backup)
	if err != nil {
		databaseError(w, "import backup", err)
		return
	}
	if issue != nil {
		respond(w, http.StatusUnprocessableEntity, issue)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		databaseError(w, "commit backup import", err)
		return
	}
	respond(w, http.StatusOK, result)
}

type importedIDs struct {
	events map[string]bool
	tasks  map[string]bool
}

func loadImportedIDs(ctx context.Context, tx pgx.Tx, userID string) (importedIDs, error) {
	ids := importedIDs{events: make(map[string]bool), tasks: make(map[string]bool)}
	rows, err := tx.Query(ctx, `SELECT record_kind,legacy_id FROM imported_planner_records WHERE user_id=$1::text::uuid`, userID)
	if err != nil {
		return ids, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, id string
		if err := rows.Scan(&kind, &id); err != nil {
			return ids, err
		}
		if kind == "event" {
			ids.events[id] = true
		} else {
			ids.tasks[id] = true
		}
	}
	return ids, rows.Err()
}

func importPlannerBackup(ctx context.Context, tx pgx.Tx, userID string, backup jospatBackup) (importResult, *backupIssue, error) {
	var result importResult
	seen, err := loadImportedIDs(ctx, tx, userID)
	if err != nil {
		return result, nil, err
	}
	before, err := loadPlanner(ctx, tx, userID)
	if err != nil {
		return result, nil, err
	}
	after, processedTasks, issue := mergeBackupTasks(before, backup.Data.Tasks, seen.tasks, &result)
	if issue != nil {
		return result, issue, nil
	}
	if err := storePlanner(ctx, tx, userID, before, after); err != nil {
		return result, nil, err
	}
	if len(before.tasks) == 0 && len(after.tasks) > 0 && backup.Data.TaskOrder != "" {
		tag, err := tx.Exec(ctx, `INSERT INTO planner_preferences (user_id,task_order)
			VALUES ($1::text::uuid,$2) ON CONFLICT (user_id) DO NOTHING`, userID, backup.Data.TaskOrder)
		if err != nil {
			return result, nil, err
		}
		result.TaskOrderImported = tag.RowsAffected() == 1
	}
	processedEvents, err := importBackupEvents(ctx, tx, userID, backup.Data.Events, seen.events, &result.Events)
	if err != nil {
		return result, nil, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO imported_planner_records (user_id,record_kind,legacy_id)
		SELECT $1::text::uuid,'event',id FROM unnest($2::text[]) AS id
		UNION ALL SELECT $1::text::uuid,'task',id FROM unnest($3::text[]) AS id
		ON CONFLICT (user_id,record_kind,legacy_id) DO NOTHING`, userID, processedEvents, processedTasks)
	return result, nil, err
}

func mergeBackupTasks(before *taskPlanner, backups []backupTask, seen map[string]bool, result *importResult) (*taskPlanner, []string, *backupIssue) {
	all := make(map[string]task, len(before.tasks)+len(backups))
	featuredDates := make(map[string]bool)
	for _, existing := range before.tasks {
		all[existing.ID] = existing
		if existing.Featured {
			featuredDates[existing.Date] = true
		}
	}
	after := &taskPlanner{tasks: slices.Clone(before.tasks), order: before.order}
	var processed []string
	var addedPositions []int
	for i, backup := range backups {
		item := backup.task
		count := &result.Tasks
		if item.ParentID != "" {
			count = &result.Subtasks
		}
		if seen[item.ID] {
			count.Skipped++
			continue
		}
		processed = append(processed, item.ID)
		if _, exists := all[item.ID]; exists {
			count.Skipped++
			continue
		}
		if item.Featured {
			if featuredDates[item.Date] {
				item.Featured = false
				result.FeaturedConflicts++
			}
			featuredDates[item.Date] = true
		}
		all[item.ID] = item
		after.tasks = append(after.tasks, item)
		addedPositions = append(addedPositions, i)
		count.Created++
	}
	for _, i := range addedPositions {
		item := backups[i].task
		if item.ParentID == "" {
			continue
		}
		parent, exists := all[item.ParentID]
		code := ""
		switch {
		case !exists:
			code = "missing_task_parent"
		case parent.ID == item.ID || parent.ParentID != "":
			code = "invalid_task_parent"
		case parent.Date != item.Date:
			code = "task_parent_date_mismatch"
		}
		if code != "" {
			return nil, nil, &backupIssue{Code: code, Section: "tasks", Position: i + 1, ID: item.ID, ParentID: item.ParentID}
		}
	}
	return after, processed, nil
}

func importBackupEvents(ctx context.Context, tx pgx.Tx, userID string, events []eventInput, seen map[string]bool, count *importCount) ([]string, error) {
	var ids, names, dates, times []string
	for _, item := range events {
		if !seen[item.ID] {
			ids = append(ids, item.ID)
			names = append(names, item.Name)
			dates = append(dates, item.Date)
			times = append(times, item.Time)
		}
	}
	if len(ids) > 0 {
		tag, err := tx.Exec(ctx, `INSERT INTO events (user_id,id,name,event_date,event_time)
			SELECT $1::text::uuid,id,name,day::date,clock::time
			FROM unnest($2::text[],$3::text[],$4::text[],$5::text[]) AS input(id,name,day,clock)
			ON CONFLICT (user_id,id) DO NOTHING`, userID, ids, names, dates, times)
		if err != nil {
			return nil, err
		}
		count.Created = int(tag.RowsAffected())
	}
	count.Skipped = len(events) - count.Created
	return ids, nil
}
