package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const dateLayout = "2006-01-02"

type eventInput struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
	Date string `json:"date"`
	Time string `json:"time"`
}

type calendarEvent struct {
	eventInput
	Version int64 `json:"version"`
}

const eventColumns = `id,name,to_char(event_date,'YYYY-MM-DD'),
	CASE WHEN extract(second FROM event_time)=0 THEN left(event_time::text,5) ELSE event_time::text END,version`

var recordID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

func newRecordID() string {
	var raw [16]byte
	rand.Read(raw[:])
	return hex.EncodeToString(raw[:])
}

func validDate(value string) bool {
	parsed, err := time.Parse(dateLayout, value)
	return err == nil && parsed.Year() >= 1 && parsed.Format(dateLayout) == value
}

func validClock(value string) bool {
	layout := "15:04"
	if len(value) == 8 {
		layout = "15:04:05"
	}
	parsed, err := time.Parse(layout, value)
	return err == nil && parsed.Format(layout) == value
}

func readEvent(w http.ResponseWriter, r *http.Request) (eventInput, bool) {
	var input eventInput
	if !readJSON(w, r, &input) {
		return input, false
	}
	if !input.validate() {
		fail(w, http.StatusBadRequest, "invalid_event")
		return input, false
	}
	return input, true
}

func (input *eventInput) validate() bool {
	input.Name = strings.TrimSpace(input.Name)
	return input.Name != "" && utf8.RuneCountInString(input.Name) <= 90 && !strings.ContainsRune(input.Name, 0) &&
		validDate(input.Date) && validClock(input.Time) && (input.ID == "" || recordID.MatchString(input.ID))
}

func scanEvent(row pgx.Row, event *calendarEvent) error {
	return row.Scan(&event.ID, &event.Name, &event.Date, &event.Time, &event.Version)
}

func (app *application) listEvents(w http.ResponseWriter, r *http.Request, account user) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if (from != "" || to != "") && (!validDate(from) || !validDate(to) || from > to) {
		fail(w, http.StatusBadRequest, "invalid_date_range")
		return
	}
	rows, err := app.db.Query(r.Context(), `SELECT `+eventColumns+` FROM events WHERE user_id=$1::text::uuid
		AND (NULLIF($2,'') IS NULL OR event_date >= NULLIF($2,'')::date)
		AND (NULLIF($3,'') IS NULL OR event_date <= NULLIF($3,'')::date)
		ORDER BY event_date,event_time,id`, account.ID, from, to)
	if err != nil {
		databaseError(w, "list events", err)
		return
	}
	defer rows.Close()
	events := []calendarEvent{}
	for rows.Next() {
		var event calendarEvent
		if err := scanEvent(rows, &event); err != nil {
			databaseError(w, "read event", err)
			return
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		databaseError(w, "read events", err)
		return
	}
	respond(w, http.StatusOK, events)
}

func (app *application) createEvent(w http.ResponseWriter, r *http.Request, account user) {
	input, ok := readEvent(w, r)
	if !ok {
		return
	}
	if input.ID == "" {
		input.ID = newRecordID()
	}
	var event calendarEvent
	err := scanEvent(app.db.QueryRow(r.Context(), `INSERT INTO events (user_id,id,name,event_date,event_time)
		VALUES ($1::text::uuid,$2,$3,$4::text::date,$5::text::time) ON CONFLICT (user_id,id) DO NOTHING
		RETURNING `+eventColumns, account.ID, input.ID, input.Name, input.Date, input.Time), &event)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusConflict, "event_id_exists")
		return
	}
	if err != nil {
		databaseError(w, "create event", err)
		return
	}
	respond(w, http.StatusCreated, event)
}

func recordVersion(w http.ResponseWriter, r *http.Request, kind string) (int64, bool) {
	if !recordID.MatchString(r.PathValue("id")) {
		fail(w, http.StatusNotFound, kind+"_not_found")
		return 0, false
	}
	header := r.Header.Get("If-Match")
	if header == "" {
		fail(w, http.StatusPreconditionRequired, kind+"_version_required")
		return 0, false
	}
	version, err := strconv.ParseInt(strings.Trim(header, `"`), 10, 64)
	if err != nil || version < 1 || header != strconv.Quote(strconv.FormatInt(version, 10)) {
		fail(w, http.StatusBadRequest, "invalid_"+kind+"_version")
		return 0, false
	}
	return version, true
}

func (app *application) updateEvent(w http.ResponseWriter, r *http.Request, account user) {
	version, ok := recordVersion(w, r, "event")
	if !ok {
		return
	}
	input, ok := readEvent(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if input.ID != "" && input.ID != id {
		fail(w, http.StatusBadRequest, "event_id_mismatch")
		return
	}
	var event calendarEvent
	err := scanEvent(app.db.QueryRow(r.Context(), `UPDATE events SET name=$4,event_date=$5::text::date,
		event_time=$6::text::time,version=version+1 WHERE user_id=$1::text::uuid AND id=$2 AND version=$3
		RETURNING `+eventColumns, account.ID, id, version, input.Name, input.Date, input.Time), &event)
	if errors.Is(err, pgx.ErrNoRows) {
		app.eventWriteMiss(w, r, account)
		return
	}
	if err != nil {
		databaseError(w, "update event", err)
		return
	}
	respond(w, http.StatusOK, event)
}

func (app *application) deleteEvent(w http.ResponseWriter, r *http.Request, account user) {
	version, ok := recordVersion(w, r, "event")
	if !ok {
		return
	}
	result, err := app.db.Exec(r.Context(), `DELETE FROM events WHERE user_id=$1::text::uuid AND id=$2 AND version=$3`,
		account.ID, r.PathValue("id"), version)
	if err != nil {
		databaseError(w, "delete event", err)
		return
	}
	if result.RowsAffected() == 0 {
		app.eventWriteMiss(w, r, account)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (app *application) eventWriteMiss(w http.ResponseWriter, r *http.Request, account user) {
	var exists bool
	err := app.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM events WHERE user_id=$1::text::uuid AND id=$2)`,
		account.ID, r.PathValue("id")).Scan(&exists)
	if err != nil {
		databaseError(w, "find event", err)
		return
	}
	if exists {
		fail(w, http.StatusPreconditionFailed, "event_version_conflict")
		return
	}
	fail(w, http.StatusNotFound, "event_not_found")
}
