package main

import (
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

type taskDetails struct {
	Name     string `json:"name"`
	Date     string `json:"date"`
	Time     string `json:"time,omitempty"`
	Project  string `json:"project,omitempty"`
	Priority int    `json:"priority,omitempty"`
}

type task struct {
	taskDetails
	ID          string `json:"id"`
	ParentID    string `json:"parentId,omitempty"`
	Done        bool   `json:"done"`
	DoneLate    bool   `json:"doneLate,omitempty"`
	Featured    bool   `json:"featured,omitempty"`
	ManualOrder *int64 `json:"manualOrder,omitempty"`
	CopiedFrom  string `json:"copiedFromTaskId,omitempty"`
	Version     int64  `json:"version"`
}

type taskPlanner struct {
	tasks []task
	order string
}

func (p *taskPlanner) find(id string) int {
	for i := range p.tasks {
		if p.tasks[i].ID == id {
			return i
		}
	}
	return -1
}

func (details *taskDetails) validate(requireDate bool) bool {
	details.Name = strings.TrimSpace(details.Name)
	details.Project = strings.TrimSpace(details.Project)
	if len(details.Time) == 8 && strings.HasSuffix(details.Time, ":00") {
		details.Time = details.Time[:5]
	}
	return validTaskName(details.Name) && utf8.RuneCountInString(details.Project) <= 60 &&
		!strings.ContainsRune(details.Project, 0) && (!requireDate && details.Date == "" || validDate(details.Date)) &&
		(details.Time == "" || validClock(details.Time)) && details.Priority >= 0 && details.Priority <= 2
}

func validTaskName(name string) bool {
	return name != "" && utf8.RuneCountInString(name) <= 120 && !strings.ContainsRune(name, 0)
}

type plannerInputError struct {
	status int
	code   string
}

func (e plannerInputError) Error() string { return e.code }

func (p *taskPlanner) parent(id, childID string) (task, error) {
	index := p.find(id)
	if index < 0 || id == childID || p.tasks[index].ParentID != "" {
		return task{}, plannerInputError{http.StatusUnprocessableEntity, "invalid_task_parent"}
	}
	return p.tasks[index], nil
}

func (p *taskPlanner) edit(index int, details taskDetails) {
	current := p.tasks[index]
	if current.Date != details.Date {
		movingFeatured := false
		for _, item := range p.tasks {
			if (item.ID == current.ID || item.ParentID == current.ID) && item.Featured {
				movingFeatured = true
				break
			}
		}
		if movingFeatured {
			for i := range p.tasks {
				if p.tasks[i].Date == details.Date {
					p.tasks[i].Featured = false
				}
			}
		}
		for i := range p.tasks {
			item := &p.tasks[i]
			if item.ParentID == current.ID {
				item.Date, item.DoneLate = details.Date, false
			}
		}
		p.tasks[index].ParentID, p.tasks[index].DoneLate = "", false
	}
	p.tasks[index].taskDetails = details
}

func (p *taskPlanner) delete(index int) {
	id := p.tasks[index].ID
	for i := range p.tasks {
		if p.tasks[i].ParentID == id {
			p.tasks[i].ParentID, p.tasks[i].ManualOrder = "", nil
		}
	}
	p.tasks = append(p.tasks[:index], p.tasks[index+1:]...)
}

type taskPlacement struct {
	ID    string `json:"id"`
	After bool   `json:"after"`
}

type taskMove struct {
	Date      string         `json:"date"`
	ParentID  string         `json:"parentId"`
	Placement *taskPlacement `json:"placement"`
}

func (p *taskPlanner) move(index int, move taskMove) error {
	current := p.tasks[index]
	if move.ParentID != "" {
		parent, err := p.parent(move.ParentID, current.ID)
		if err != nil {
			return err
		}
		move.Date = parent.Date
	}
	sameGroup := current.Date == move.Date && current.ParentID == move.ParentID
	if sameGroup && move.Placement == nil {
		return nil
	}
	var positions map[string]int64
	if move.Placement != nil {
		var siblings []task
		for _, item := range p.tasks {
			if item.ID != current.ID && item.ParentID != current.ID &&
				item.Date == move.Date && item.ParentID == move.ParentID {
				siblings = append(siblings, item)
			}
		}
		sortTasks(siblings, p.order)
		target := -1
		for i, sibling := range siblings {
			if sibling.ID == move.Placement.ID {
				target = i
				break
			}
		}
		if target < 0 {
			return plannerInputError{http.StatusUnprocessableEntity, "invalid_task_placement"}
		}
		if move.Placement.After {
			target++
		}
		positions = map[string]int64{current.ID: int64(target)}
		for i, sibling := range siblings {
			position := i
			if i >= target {
				position++
			}
			positions[sibling.ID] = int64(position)
		}
		p.order = "manual"
	}
	for i := range p.tasks {
		item := &p.tasks[i]
		switch {
		case item.ID == current.ID:
			item.moveTo(move.Date, move.ParentID)
			item.Featured = sameGroup && item.Featured
			item.ManualOrder = nil
		case item.ParentID == current.ID && !sameGroup:
			parent := current.ID
			if move.ParentID != "" {
				parent = move.ParentID
				item.ManualOrder = nil
			}
			item.moveTo(move.Date, parent)
			item.Featured = false
		}
		if position, ok := positions[item.ID]; ok {
			item.ManualOrder = &position
		}
	}
	return nil
}

func (item *task) moveTo(date, parent string) {
	if item.Date != date {
		item.DoneLate = false
	}
	item.Date, item.ParentID = date, parent
}

func (p *taskPlanner) feature(index int, featured bool) {
	target := p.tasks[index]
	if !featured {
		p.tasks[index].Featured = false
		return
	}
	for i := range p.tasks {
		if p.tasks[i].Date == target.Date {
			p.tasks[i].Featured = p.tasks[i].ID == target.ID
		}
	}
}

func (p *taskPlanner) copyToday(today time.Time) []string {
	from, to := today.Format(dateLayout), today.AddDate(0, 0, 1).Format(dateLayout)
	existing := make(map[string]task)
	keepFeatured := true
	for _, item := range p.tasks {
		if item.Date == to {
			if item.CopiedFrom != "" {
				existing[item.CopiedFrom] = item
			}
			keepFeatured = keepFeatured && !item.Featured
		}
	}
	ids := make(map[string]string)
	for _, item := range p.tasks {
		if item.Date == from && existing[item.ID].ID == "" {
			ids[item.ID] = newRecordID()
		}
	}
	copiedIDs := []string{}
	for _, item := range p.tasks {
		id, ok := ids[item.ID]
		if !ok {
			continue
		}
		parent := ids[item.ParentID]
		if existingParent, ok := existing[item.ParentID]; ok {
			parent = existingParent.ID
			if existingParent.ParentID != "" {
				parent = existingParent.ParentID
			}
		}
		item.ID, item.CopiedFrom, item.ParentID = id, item.ID, parent
		item.Date, item.Done, item.DoneLate = to, false, false
		item.Featured = keepFeatured && item.Featured
		p.tasks = append(p.tasks, item)
		copiedIDs = append(copiedIDs, id)
	}
	return copiedIDs
}

func validTaskOrder(order string) bool {
	return order == "priority" || order == "added" || order == "name" || order == "manual"
}

func sortTasks(tasks []task, order string) {
	switch order {
	case "name":
		russian := collate.New(language.Russian)
		sort.SliceStable(tasks, func(i, j int) bool {
			return russian.CompareString(tasks[i].Name, tasks[j].Name) < 0
		})
	case "priority":
		sort.SliceStable(tasks, func(i, j int) bool {
			if tasks[i].Featured != tasks[j].Featured {
				return tasks[i].Featured
			}
			return tasks[i].Priority > tasks[j].Priority
		})
	case "manual":
		const last = 9007199254740991
		position := func(item task) int64 {
			if item.ManualOrder != nil {
				return *item.ManualOrder
			}
			return last
		}
		sort.SliceStable(tasks, func(i, j int) bool {
			return position(tasks[i]) < position(tasks[j])
		})
	}
}

type taskList struct {
	Tasks     []task `json:"tasks"`
	Overdue   []task `json:"overdue"`
	TaskOrder string `json:"taskOrder"`
}

func (p *taskPlanner) list(day, today string) taskList {
	result := taskList{Tasks: []task{}, Overdue: []task{}, TaskOrder: p.order}
	if day == "" {
		result.Tasks = p.tasks
		return result
	}
	var roots []task
	children := make(map[string][]task)
	for _, item := range p.tasks {
		if item.Date == day {
			if item.ParentID == "" {
				roots = append(roots, item)
			} else {
				children[item.ParentID] = append(children[item.ParentID], item)
			}
		} else if today != "" && item.Date < today && (!item.Done || item.DoneLate) {
			result.Overdue = append(result.Overdue, item)
		}
	}
	sortTasks(roots, p.order)
	for _, root := range roots {
		result.Tasks = append(result.Tasks, root)
		items := children[root.ID]
		sortTasks(items, p.order)
		result.Tasks = append(result.Tasks, items...)
	}
	sortTasks(result.Overdue, p.order)
	sort.SliceStable(result.Overdue, func(i, j int) bool {
		return result.Overdue[i].Date < result.Overdue[j].Date
	})
	return result
}
