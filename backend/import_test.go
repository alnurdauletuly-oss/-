package main

import (
	"encoding/json"
	"strings"
	"testing"
)

const legacyPlannerCopy = `{
	"format":"jospat-backup","version":1,"createdAt":"2026-11-29T06:00:00.000Z",
	"data":{
		"events":[{"id":"event-1","name":"Дедлайн","date":"2026-11-29","time":"15:30"}],
		"tasks":[
			{"id":"task-child","parentId":"task-0","name":"Проверить план","date":"2026-11-29","done":true,"doneLate":true,"time":"09:00","manualOrder":0,"copiedFromTaskId":"deleted-original"},
			{"id":"task-0","name":"План","date":"2026-11-29","done":false,"featured":true,"priority":2,"project":"Учёба","manualOrder":1}
		],
		"taskOrder":"manual","habits":[],"notes":[{"title":"Личная запись"}],"journal":{"2026-11-29":{"thoughts":"Личные данные"}}
	},
	"noteFiles":{"example-file":"YQ=="}
}`

func TestLegacyPlannerImport(t *testing.T) {
	request, login := testAPI(t)
	owner, other := login("import-owner@example.test"), login("import-other@example.test")
	request("POST", "/api/import/jospat", legacyPlannerCopy, nil, "", 401)
	initial := request("POST", "/api/import/jospat", legacyPlannerCopy, owner, "", 200)
	var result importResult
	if err := json.Unmarshal(initial.Body.Bytes(), &result); err != nil || result != (importResult{
		Events: importCount{Created: 1}, Tasks: importCount{Created: 1}, Subtasks: importCount{Created: 1}, TaskOrderImported: true,
	}) {
		t.Fatalf("unexpected import result: %s (%v)", initial.Body, err)
	}
	list := request("GET", "/api/tasks", "", owner, "", 200)
	var plan taskList
	if err := json.Unmarshal(list.Body.Bytes(), &plan); err != nil || len(plan.Tasks) != 2 || plan.TaskOrder != "manual" {
		t.Fatalf("unexpected imported plan: %s (%v)", list.Body, err)
	}
	child, parent := plan.Tasks[0], plan.Tasks[1]
	if child.ID != "task-child" || child.ParentID != parent.ID || child.Date != parent.Date || child.Time != "09:00" ||
		!child.Done || !child.DoneLate || child.ManualOrder == nil || *child.ManualOrder != 0 ||
		child.CopiedFrom != "deleted-original" || child.Version != 1 ||
		parent.ID != "task-0" || !parent.Featured || parent.Project != "Учёба" || parent.Priority != 2 {
		t.Fatalf("legacy identifiers, ordering or planner fields were lost: %s", list.Body)
	}
	request("PATCH", "/api/tasks/task-0", `{"name":"План на сервере"}`, owner, `"1"`, 200)
	request("PUT", "/api/events/event-1", `{"name":"Обновлённый дедлайн","date":"2026-11-30","time":"13:45"}`, owner, `"1"`, 200)
	request("PUT", "/api/task-order", `{"taskOrder":"name"}`, owner, "", 200)
	repeat := request("POST", "/api/import/jospat", legacyPlannerCopy, owner, "", 200)
	if err := json.Unmarshal(repeat.Body.Bytes(), &result); err != nil || result != (importResult{
		Events: importCount{Skipped: 1}, Tasks: importCount{Skipped: 1}, Subtasks: importCount{Skipped: 1},
	}) {
		t.Fatalf("repeat created duplicates: %s (%v)", repeat.Body, err)
	}
	list = request("GET", "/api/tasks", "", owner, "", 200)
	if err := json.Unmarshal(list.Body.Bytes(), &plan); err != nil || len(plan.Tasks) != 2 || plan.TaskOrder != "name" ||
		plan.Tasks[1].Name != "План на сервере" || plan.Tasks[1].Version != 2 {
		t.Fatalf("repeat overwrote a server edit: %s (%v)", list.Body, err)
	}
	events := request("GET", "/api/events", "", owner, "", 200)
	var calendar []calendarEvent
	if err := json.Unmarshal(events.Body.Bytes(), &calendar); err != nil || len(calendar) != 1 ||
		calendar[0].Name != "Обновлённый дедлайн" || calendar[0].Time != "13:45" || calendar[0].Version != 2 {
		t.Fatalf("repeat overwrote a calendar event: %s (%v)", events.Body, err)
	}
	request("DELETE", "/api/tasks/task-child", "", owner, `"1"`, 204)
	request("DELETE", "/api/events/event-1", "", owner, `"2"`, 204)
	request("POST", "/api/import/jospat", legacyPlannerCopy, owner, "", 200)
	events = request("GET", "/api/events", "", owner, "", 200)
	list = request("GET", "/api/tasks", "", owner, "", 200)
	if strings.TrimSpace(events.Body.String()) != "[]" || strings.Contains(list.Body.String(), "task-child") {
		t.Fatal("repeat brought back deleted records")
	}
	secondAccount := request("POST", "/api/import/jospat", legacyPlannerCopy, other, "", 200)
	if secondAccount.Body.String() != initial.Body.String() {
		t.Fatalf("import history was shared across accounts: %s", secondAccount.Body)
	}
}

func TestLegacyPlannerImportRejectsBrokenRelationships(t *testing.T) {
	request, login := testAPI(t)
	owner := login("import-relations@example.test")
	for _, example := range []struct {
		find, replace, reason string
	}{
		{`"parentId":"task-0"`, `"parentId":"missing"`, "missing_task_parent"},
		{`"parentId":"task-0"`, `"parentId":"task-child"`, "invalid_task_parent"},
		{`"date":"2026-11-29","done":true`, `"date":"2026-11-28","done":true`, "task_parent_date_mismatch"},
		{`"id":"task-child"`, `"id":"task-0"`, "duplicate_backup_task_id"},
		{`"done":false,"featured"`, `"featured"`, "invalid_backup_task"},
	} {
		broken := strings.Replace(legacyPlannerCopy, example.find, example.replace, 1)
		response := request("POST", "/api/import/jospat", broken, owner, "", 422)
		if !strings.Contains(response.Body.String(), example.reason) {
			t.Fatalf("expected %s, got %s", example.reason, response.Body)
		}
	}
	events := request("GET", "/api/events", "", owner, "", 200)
	tasks := request("GET", "/api/tasks", "", owner, "", 200)
	if strings.TrimSpace(events.Body.String()) != "[]" || !strings.Contains(tasks.Body.String(), `"tasks":[]`) {
		t.Fatalf("failed import changed the account: %s %s", events.Body, tasks.Body)
	}
	request("POST", "/api/tasks", `{"id":"task-0","name":"Существующий план","date":"2026-11-29"}`, owner, "", 201)
	request("PUT", "/api/tasks/task-0/featured", `{"featured":true}`, owner, `"1"`, 200)
	copy := strings.Replace(legacyPlannerCopy, `"copiedFromTaskId":"deleted-original"`, `"copiedFromTaskId":"deleted-original","featured":true`, 1)
	res := request("POST", "/api/import/jospat", copy, owner, "", 200)
	var result importResult
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil ||
		result.Events.Created != 1 || result.Tasks.Skipped != 1 || result.Subtasks.Created != 1 ||
		result.FeaturedConflicts != 1 || result.TaskOrderImported {
		t.Fatalf("unexpected merge with existing planner: %s (%v)", res.Body, err)
	}
	tasks = request("GET", "/api/tasks", "", owner, "", 200)
	var plan taskList
	if err := json.Unmarshal(tasks.Body.Bytes(), &plan); err != nil || len(plan.Tasks) != 2 ||
		plan.Tasks[0].Name != "Существующий план" || !plan.Tasks[0].Featured ||
		plan.Tasks[1].ParentID != "task-0" || plan.Tasks[1].Featured {
		t.Fatalf("existing parent or priority was overwritten: %s (%v)", tasks.Body, err)
	}
}
