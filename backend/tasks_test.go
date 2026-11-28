package main

import (
	"encoding/json"
	"slices"
	"strconv"
	"testing"
)

func TestPlannerAPI(t *testing.T) {
	request, login := testAPI(t)
	owner, other := login("planner@example.test"), login("other-planner@example.test")
	request("GET", "/api/tasks", "", nil, "", 401)
	request("POST", "/api/tasks", `{"id":"task-a","name":"План","date":"2026-11-28","time":"09:00:00","project":"Учёба","priority":2}`, owner, "", 201)
	request("POST", "/api/tasks", `{"id":"task-child","name":"Шаг","parentId":"task-a","date":"2026-11-30"}`, owner, "", 201)
	request("POST", "/api/tasks", `{"name":"Ещё глубже","parentId":"task-child"}`, owner, "", 422)
	request("POST", "/api/tasks", `{"name":"Чужая подзадача","parentId":"task-a"}`, other, "", 422)
	request("DELETE", "/api/tasks/task-a", "", other, `"1"`, 404)
	request("POST", "/api/tasks", `{"id":"task-b","name":"Завтра","date":"2026-11-29"}`, owner, "", 201)
	request("POST", "/api/tasks", `{"id":"task-d","name":"Послезавтра","date":"2026-11-30"}`, owner, "", 201)

	getList := func(query string) taskList {
		t.Helper()
		res := request("GET", "/api/tasks"+query, "", owner, "", 200)
		var list taskList
		if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
		return list
	}
	find := func(tasks []task, id string) task {
		t.Helper()
		for _, item := range tasks {
			if item.ID == id {
				return item
			}
		}
		t.Fatalf("missing task %q in %+v", id, tasks)
		return task{}
	}
	current := func(id string) task {
		t.Helper()
		return find(getList("").Tasks, id)
	}
	change := func(method, id, suffix, body string, status int) {
		t.Helper()
		version := strconv.Quote(strconv.FormatInt(current(id).Version, 10))
		request(method, "/api/tasks/"+id+suffix, body, owner, version, status)
	}

	if item := current("task-child"); item.ParentID != "task-a" || item.Date != "2026-11-28" {
		t.Fatalf("child should inherit the parent's date: %+v", item)
	}
	if item := current("task-a"); item.Priority != 2 || item.Project != "Учёба" || item.Time != "09:00" {
		t.Fatalf("planner metadata was lost: %+v", item)
	}
	change("PATCH", "task-a", "", `{"name":"План на день"}`, 200)
	if item := current("task-a"); item.Name != "План на день" || item.Project != "Учёба" || item.Date != "2026-11-28" {
		t.Fatalf("quick rename changed unrelated fields: %+v", item)
	}
	change("PUT", "task-child", "/done", `{"done":true,"today":"2026-11-29"}`, 200)
	late := find(getList("?date=2026-11-29&today=2026-11-29").Overdue, "task-child")
	if !late.Done || !late.DoneLate {
		t.Fatalf("a late completion should remain in the overdue view: %+v", late)
	}
	request("PUT", "/api/tasks/task-child/done", `{"done":false,"today":"2026-11-29"}`, owner, `"1"`, 412)
	for _, id := range []string{"task-a", "task-b", "task-d"} {
		change("PUT", id, "/featured", `{"featured":true}`, 200)
	}
	for range 2 {
		request("POST", "/api/tasks/copy-today", `{"today":"2026-11-28"}`, owner, "", 200)
	}
	tomorrow := getList("?date=2026-11-29").Tasks
	if len(tomorrow) != 3 || tomorrow[0].ID != "task-b" ||
		tomorrow[1].CopiedFrom != "task-a" || tomorrow[1].Featured ||
		tomorrow[2].CopiedFrom != "task-child" || tomorrow[2].ParentID != tomorrow[1].ID || tomorrow[2].Done || tomorrow[2].DoneLate {
		t.Fatalf("copy should preserve hierarchy, reset completion and avoid duplicates: %+v", tomorrow)
	}

	change("PUT", "task-a", "", `{"name":"Новый план","date":"2026-11-30","priority":1}`, 200)
	if item := current("task-child"); item.Date != "2026-11-30" || !item.Done || item.DoneLate || item.ParentID != "task-a" {
		t.Fatalf("editing the parent date should move its children and clear lateness: %+v", item)
	}
	if current("task-d").Featured || !current("task-a").Featured {
		t.Fatal("editing the date should carry the featured task and clear the destination's previous one")
	}
	change("POST", "task-a", "/move", `{"parentId":"task-b"}`, 200)
	for _, id := range []string{"task-a", "task-child"} {
		item := current(id)
		if item.ParentID != "task-b" || item.Date != "2026-11-29" || item.Featured {
			t.Fatalf("nesting a parent should flatten its previous children: %+v", item)
		}
	}
	change("POST", "task-child", "/move", `{"parentId":"task-b","placement":{"id":"task-d"}}`, 422)
	change("POST", "task-child", "/move", `{"parentId":"task-b","placement":{"id":"task-a","after":false}}`, 200)
	ordered := getList("?date=2026-11-29")
	if ordered.TaskOrder != "manual" || ordered.Tasks[1].ID != "task-child" || ordered.Tasks[2].ID != "task-a" {
		t.Fatalf("manual sibling order was not saved: %+v", ordered)
	}
	change("DELETE", "task-b", "", "", 204)
	for _, id := range []string{"task-a", "task-child"} {
		if item := current(id); item.ParentID != "" || item.ManualOrder != nil {
			t.Fatalf("deleting a parent should detach the child and clear its manual order: %+v", item)
		}
	}
	request("PUT", "/api/task-order", `{"taskOrder":"name"}`, owner, "", 200)
	ordered = getList("?date=2026-11-29")
	if ordered.TaskOrder != "name" || ordered.Tasks[0].ID != "task-a" {
		t.Fatalf("Russian name order was not applied: %+v", ordered)
	}
	change("PATCH", "task-d", "", `{"name":"   "}`, 204)
	request("DELETE", "/api/tasks/task-d", "", owner, `"1"`, 404)
	isolated := request("GET", "/api/tasks", "", other, "", 200)
	var otherPlan taskList
	if err := json.Unmarshal(isolated.Body.Bytes(), &otherPlan); err != nil ||
		len(otherPlan.Tasks) != 0 || otherPlan.TaskOrder != "priority" {
		t.Fatalf("another account must have an independent plan: %s (%v)", isolated.Body, err)
	}
}

func TestPlannerAddedOrderAndOverdue(t *testing.T) {
	planner := taskPlanner{order: "added", tasks: []task{
		{ID: "created-first", taskDetails: taskDetails{Name: "Я", Date: "2026-11-28"}},
		{ID: "created-second", taskDetails: taskDetails{Name: "А", Date: "2026-11-28", Priority: 2}},
		{ID: "late-first", taskDetails: taskDetails{Date: "2026-11-27"}, Done: true, DoneLate: true},
		{ID: "on-time", taskDetails: taskDetails{Date: "2026-11-27"}, Done: true},
		{ID: "older", taskDetails: taskDetails{Date: "2026-11-26"}},
	}}
	list := planner.list("2026-11-28", "2026-11-28")
	if !slices.Equal([]string{list.Tasks[0].ID, list.Tasks[1].ID}, []string{"created-first", "created-second"}) ||
		len(list.Overdue) != 2 || !slices.Equal([]string{list.Overdue[0].ID, list.Overdue[1].ID}, []string{"older", "late-first"}) {
		t.Fatalf("unexpected added order or overdue list: %+v", list)
	}
}
