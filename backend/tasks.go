package main

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (app *application) listTasks(w http.ResponseWriter, r *http.Request, account user) {
	day, today := r.URL.Query().Get("date"), r.URL.Query().Get("today")
	if day != "" && !validDate(day) || today != "" && (day == "" || !validDate(today)) {
		fail(w, http.StatusBadRequest, "invalid_task_date")
		return
	}
	ctx := r.Context()
	tx, err := app.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		databaseError(w, "begin planner read", err)
		return
	}
	defer tx.Rollback(ctx)
	planner, err := loadPlanner(ctx, tx, account.ID)
	if err != nil {
		databaseError(w, "load planner", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		databaseError(w, "commit planner read", err)
		return
	}
	respond(w, http.StatusOK, planner.list(day, today))
}

func (app *application) writePlanner(w http.ResponseWriter, r *http.Request, account user, change func(*taskPlanner) error) *taskPlanner {
	ctx := r.Context()
	tx, err := app.db.Begin(ctx)
	if err != nil {
		databaseError(w, "begin planner change", err)
		return nil
	}
	defer tx.Rollback(ctx)
	err = lockPlanner(ctx, tx, account.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusUnauthorized, "authentication_required")
		return nil
	}
	if err != nil {
		databaseError(w, "lock planner", err)
		return nil
	}
	before, err := loadPlanner(ctx, tx, account.ID)
	if err != nil {
		databaseError(w, "load planner for change", err)
		return nil
	}
	after := &taskPlanner{tasks: slices.Clone(before.tasks), order: before.order}
	if err := change(after); err != nil {
		var invalid plannerInputError
		if errors.As(err, &invalid) {
			fail(w, invalid.status, invalid.code)
		} else {
			databaseError(w, "change planner", err)
		}
		return nil
	}
	if err := storePlanner(ctx, tx, account.ID, before, after); err != nil {
		databaseError(w, "save planner", err)
		return nil
	}
	if err := tx.Commit(ctx); err != nil {
		databaseError(w, "commit planner change", err)
		return nil
	}
	return after
}

func (app *application) changeTask(w http.ResponseWriter, r *http.Request, account user, change func(*taskPlanner, int) error, status int) {
	version, ok := recordVersion(w, r, "task")
	if !ok {
		return
	}
	id := r.PathValue("id")
	planner := app.writePlanner(w, r, account, func(p *taskPlanner) error {
		index := p.find(id)
		if index < 0 {
			return plannerInputError{http.StatusNotFound, "task_not_found"}
		}
		if p.tasks[index].Version != version {
			return plannerInputError{http.StatusPreconditionFailed, "task_version_conflict"}
		}
		return change(p, index)
	})
	if planner == nil {
		return
	}
	if status == http.StatusNoContent {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		return
	}
	respond(w, status, planner.tasks[planner.find(id)])
}

func (app *application) createTask(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		taskDetails
		ID       string `json:"id"`
		ParentID string `json:"parentId"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !input.validate(input.ParentID == "") || (input.ID != "" && !recordID.MatchString(input.ID)) ||
		(input.ParentID != "" && !recordID.MatchString(input.ParentID)) {
		fail(w, http.StatusBadRequest, "invalid_task")
		return
	}
	if input.ID == "" {
		input.ID = newRecordID()
	}
	planner := app.writePlanner(w, r, account, func(p *taskPlanner) error {
		if p.find(input.ID) >= 0 {
			return plannerInputError{http.StatusConflict, "task_id_exists"}
		}
		if input.ParentID != "" {
			parent, err := p.parent(input.ParentID, input.ID)
			if err != nil {
				return err
			}
			input.Date = parent.Date
		}
		p.tasks = append(p.tasks, task{taskDetails: input.taskDetails, ID: input.ID, ParentID: input.ParentID})
		return nil
	})
	if planner != nil {
		respond(w, http.StatusCreated, planner.tasks[planner.find(input.ID)])
	}
}

func (app *application) editTask(w http.ResponseWriter, r *http.Request, account user) {
	var details taskDetails
	if !readJSON(w, r, &details) {
		return
	}
	if !details.validate(true) {
		fail(w, http.StatusBadRequest, "invalid_task")
		return
	}
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		p.edit(index, details)
		return nil
	}, http.StatusOK)
}

func (app *application) renameTask(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		Name *string `json:"name"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if input.Name == nil {
		fail(w, http.StatusBadRequest, "invalid_task")
		return
	}
	name := strings.TrimSpace(*input.Name)
	if name == "" {
		app.deleteTask(w, r, account)
		return
	}
	if !validTaskName(name) {
		fail(w, http.StatusBadRequest, "invalid_task")
		return
	}
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		p.tasks[index].Name = name
		return nil
	}, http.StatusOK)
}

func (app *application) deleteTask(w http.ResponseWriter, r *http.Request, account user) {
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		p.delete(index)
		return nil
	}, http.StatusNoContent)
}

func (app *application) moveTask(w http.ResponseWriter, r *http.Request, account user) {
	var move taskMove
	if !readJSON(w, r, &move) {
		return
	}
	if (move.ParentID == "" || move.Date != "") && !validDate(move.Date) ||
		move.ParentID != "" && !recordID.MatchString(move.ParentID) ||
		move.Placement != nil && !recordID.MatchString(move.Placement.ID) {
		fail(w, http.StatusBadRequest, "invalid_task_move")
		return
	}
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		return p.move(index, move)
	}, http.StatusOK)
}

func (app *application) setTaskDone(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		Done  *bool  `json:"done"`
		Today string `json:"today"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if input.Done == nil || !validDate(input.Today) {
		fail(w, http.StatusBadRequest, "invalid_task_completion")
		return
	}
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		item := &p.tasks[index]
		if item.Done != *input.Done {
			item.Done = *input.Done
			item.DoneLate = item.Done && item.Date < input.Today
		}
		return nil
	}, http.StatusOK)
}

func (app *application) setTaskFeatured(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		Featured *bool `json:"featured"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if input.Featured == nil {
		fail(w, http.StatusBadRequest, "invalid_task_featured")
		return
	}
	app.changeTask(w, r, account, func(p *taskPlanner, index int) error {
		p.feature(index, *input.Featured)
		return nil
	}, http.StatusOK)
}

func (app *application) copyTodayTasks(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		Today string `json:"today"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !validDate(input.Today) || input.Today == "9999-12-31" {
		fail(w, http.StatusBadRequest, "invalid_task_date")
		return
	}
	today, _ := time.Parse(dateLayout, input.Today)
	var ids []string
	planner := app.writePlanner(w, r, account, func(p *taskPlanner) error {
		ids = p.copyToday(today)
		return nil
	})
	if planner != nil {
		respond(w, http.StatusOK, struct {
			Date      string   `json:"date"`
			CopiedIDs []string `json:"copiedIds"`
		}{today.AddDate(0, 0, 1).Format(dateLayout), ids})
	}
}

func (app *application) setTaskOrder(w http.ResponseWriter, r *http.Request, account user) {
	var input struct {
		Order string `json:"taskOrder"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !validTaskOrder(input.Order) {
		fail(w, http.StatusBadRequest, "invalid_task_order")
		return
	}
	planner := app.writePlanner(w, r, account, func(p *taskPlanner) error {
		p.order = input.Order
		return nil
	})
	if planner != nil {
		respond(w, http.StatusOK, input)
	}
}
