package main

import (
	"context"
	"reflect"

	"github.com/jackc/pgx/v5"
)

func lockPlanner(ctx context.Context, tx pgx.Tx, userID string) error {
	// Keep task changes and imports for the same account in a single order.
	var lockedID string
	return tx.QueryRow(ctx, `SELECT id::text FROM users WHERE id=$1::text::uuid FOR NO KEY UPDATE`, userID).Scan(&lockedID)
}

func loadPlanner(ctx context.Context, tx pgx.Tx, userID string) (*taskPlanner, error) {
	p := &taskPlanner{tasks: []task{}}
	err := tx.QueryRow(ctx, `SELECT COALESCE(
		(SELECT task_order FROM planner_preferences WHERE user_id=$1::text::uuid),'priority')`,
		userID).Scan(&p.order)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT id,name,to_char(task_date,'YYYY-MM-DD'),
		COALESCE(CASE WHEN extract(second FROM task_time)=0 THEN left(task_time::text,5) ELSE task_time::text END,''),
		COALESCE(parent_id,''),project,priority,done,done_late,featured,manual_order,
		COALESCE(copied_from_task_id,''),version FROM tasks WHERE user_id=$1::text::uuid ORDER BY added_order`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item task
		if err := rows.Scan(&item.ID, &item.Name, &item.Date, &item.Time, &item.ParentID, &item.Project,
			&item.Priority, &item.Done, &item.DoneLate, &item.Featured, &item.ManualOrder, &item.CopiedFrom,
			&item.Version); err != nil {
			return nil, err
		}
		p.tasks = append(p.tasks, item)
	}
	return p, rows.Err()
}

func storePlanner(ctx context.Context, tx pgx.Tx, userID string, before, after *taskPlanner) error {
	var writes pgx.Batch
	old := make(map[string]task, len(before.tasks))
	for _, item := range before.tasks {
		old[item.ID] = item
	}
	for i := range after.tasks {
		item := &after.tasks[i]
		previous, exists := old[item.ID]
		delete(old, item.ID)
		if exists && reflect.DeepEqual(previous, *item) {
			continue
		}
		item.Version = 1
		if exists {
			item.Version = previous.Version + 1
		}
		writes.Queue(`INSERT INTO tasks (user_id,id,name,task_date,task_time,parent_id,project,
			priority,done,done_late,featured,manual_order,copied_from_task_id,version)
			VALUES ($1::text::uuid,$2,$3,$4::text::date,NULLIF($5,'')::time,NULLIF($6,''),$7,$8,$9,$10,$11,$12,NULLIF($13,''),$14)
			ON CONFLICT (user_id,id) DO UPDATE SET name=EXCLUDED.name,task_date=EXCLUDED.task_date,
			task_time=EXCLUDED.task_time,parent_id=EXCLUDED.parent_id,project=EXCLUDED.project,priority=EXCLUDED.priority,
			done=EXCLUDED.done,done_late=EXCLUDED.done_late,featured=EXCLUDED.featured,manual_order=EXCLUDED.manual_order,
			copied_from_task_id=EXCLUDED.copied_from_task_id,version=EXCLUDED.version`,
			userID, item.ID, item.Name, item.Date, item.Time, item.ParentID, item.Project, item.Priority,
			item.Done, item.DoneLate, item.Featured, item.ManualOrder, item.CopiedFrom, item.Version)
	}
	for id := range old {
		writes.Queue(`DELETE FROM tasks WHERE user_id=$1::text::uuid AND id=$2`, userID, id)
	}
	if before.order != after.order {
		writes.Queue(`INSERT INTO planner_preferences (user_id,task_order) VALUES ($1::text::uuid,$2)
			ON CONFLICT (user_id) DO UPDATE SET task_order=EXCLUDED.task_order`, userID, after.order)
	}
	if writes.Len() == 0 {
		return nil
	}
	return tx.SendBatch(ctx, &writes).Close()
}
