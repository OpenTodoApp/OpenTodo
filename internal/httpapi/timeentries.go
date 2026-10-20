package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/digest"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/timetrack"
	"github.com/pixari/opentodo/internal/zoned"
)

// Time entry routes (OpenSpec change `time-tracking`, design D7). All require
// authentication; the middleware refuses read and agent tokens on the writes
// before the handler. Writes go through the op log (ApplyStrict) with the
// sync engine's authorship rules, and a start closes the caller's running
// entry in the same batch (design D2). Not demo-denied: nothing outbound,
// nothing stored outside the sandbox's log.
func (s *Server) registerTimeEntryRoutes(mux *routes) {
	mux.handle("GET /api/v1/time-entries", signedIn, s.handleListTimeEntries)
	mux.handle("GET /api/v1/tasks/{id}/time-entries", signedIn, s.handleTaskTimeEntries)
	mux.handle("POST /api/v1/time-entries", signedIn, s.handleCreateTimeEntry)
	mux.handle("POST /api/v1/time-entries/stop", signedIn, s.handleStopTimeEntry)
	mux.handle("PATCH /api/v1/time-entries/{id}", signedIn, s.handlePatchTimeEntry)
	mux.handle("DELETE /api/v1/time-entries/{id}", signedIn, s.handleDeleteTimeEntry)
}

// Page sizes of the list route.
const (
	TimeEntryPageSize    = 100
	TimeEntryMaxPageSize = 500
)

// apiTimeEntry is an entry as the routes show it (camelCase like comments).
type apiTimeEntry struct {
	ID          string  `json:"id"`
	TaskID      string  `json:"taskId"`
	UserID      string  `json:"userId"`
	StartedAt   int64   `json:"startedAt"`
	EndedAt     *int64  `json:"endedAt"`
	Minutes     int     `json:"minutes"`
	Note        string  `json:"note"`
	DeviceID    string  `json:"deviceId"`
	TaskTitle   string  `json:"taskTitle"`
	ProjectID   *string `json:"projectId"`
	ProjectName string  `json:"projectName,omitempty"`
}

// timeData is what the list routes read once per request.
type timeData struct {
	entries  []timetrack.Entry
	devices  map[string]string
	tasks    map[string]timetrack.Task
	projects []timetrack.Project
	trashed  map[string]bool
	labels   []timetrack.Label
	fields   []timetrack.Field
}

func (d *timeData) liveTask(id string) bool {
	t, ok := d.tasks[id]
	return ok && t.DeletedAt == nil && !d.trashed[t.ProjectID]
}

// loadTimeData reads the caller's readable entries, tasks and projects; with
// csv it also reads labels and custom field definitions.
func (s *Server) loadTimeData(ctx context.Context, uid string, csv bool) (*timeData, error) {
	d := &timeData{devices: map[string]string{}, tasks: map[string]timetrack.Task{}, trashed: map[string]bool{}}
	rows, err := s.sync.List(ctx, uid, "time_entry", false)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		e := timetrack.FromRow(r)
		d.entries = append(d.entries, e)
		d.devices[e.ID] = idOf(r["device_id"])
	}
	tasks, err := s.sync.List(ctx, uid, "task", true)
	if err != nil {
		return nil, err
	}
	for _, r := range tasks {
		t := timetrack.TaskFromRow(r)
		d.tasks[t.ID] = t
	}
	projects, err := s.sync.List(ctx, uid, "project", true)
	if err != nil {
		return nil, err
	}
	for _, r := range projects {
		p := timetrack.Project{ID: idOf(r["id"]), Name: idOf(r["name"])}
		if v := r["deleted_at"]; len(v) > 0 && string(v) != "null" {
			d.trashed[p.ID] = true
			p.DeletedAt = new(int64)
		}
		d.projects = append(d.projects, p)
	}
	if !csv {
		return d, nil
	}
	labels, err := s.sync.List(ctx, uid, "label", false)
	if err != nil {
		return nil, err
	}
	for _, r := range labels {
		d.labels = append(d.labels, timetrack.Label{ID: idOf(r["id"]), Name: idOf(r["name"])})
	}
	fields, err := s.sync.List(ctx, uid, "field", false)
	if err != nil {
		return nil, err
	}
	for _, r := range fields {
		var pos float64
		_ = json.Unmarshal(r["position"], &pos)
		d.fields = append(d.fields, timetrack.Field{ID: idOf(r["id"]), ProjectID: idOf(r["project_id"]), Name: idOf(r["name"]), Position: pos})
	}
	return d, nil
}

func (d *timeData) out(e timetrack.Entry, now int64) apiTimeEntry {
	t := d.tasks[e.TaskID]
	a := apiTimeEntry{ID: e.ID, TaskID: e.TaskID, UserID: e.UserID, StartedAt: e.StartedAt, EndedAt: e.EndedAt,
		Minutes: timetrack.MinutesOf(e, now), Note: e.Note, DeviceID: d.devices[e.ID], TaskTitle: t.Title}
	if t.ProjectID != "" {
		pid := t.ProjectID
		a.ProjectID = &pid
		for _, p := range d.projects {
			if p.ID == pid {
				a.ProjectName = p.Name
			}
		}
	}
	return a
}

// dayStartOf is the caller's day start in minutes (day-boundary), 0 by default.
func (s *Server) dayStartOf(ctx context.Context, uid string) int {
	prefs, err := s.sync.Get(ctx, uid, "user_prefs", "me")
	if err != nil || prefs == nil {
		return 0
	}
	return digest.DayStart(idOf(prefs["day_start"]))
}

// timeQuery reads task, from, to, tz and running; msg names a bad parameter.
func (s *Server) timeQuery(r *http.Request) (timetrack.Query, string) {
	q := r.URL.Query()
	tq := timetrack.Query{Task: q.Get("task"), From: q.Get("from"), To: q.Get("to"), Loc: time.UTC}
	for name, v := range map[string]string{"from": tq.From, "to": tq.To} {
		if v == "" {
			continue
		}
		if _, err := time.Parse(time.DateOnly, v); err != nil {
			return tq, name + ": must be a date YYYY-MM-DD"
		}
	}
	if tq.From != "" && tq.To != "" && tq.To < tq.From {
		return tq, "to: must not be before from"
	}
	if tz := q.Get("tz"); tz != "" && tz != "UTC" {
		l, err := zoned.Load(tz)
		if err != nil {
			return tq, fmt.Sprintf("tz: unknown IANA time zone %q", tz)
		}
		tq.Loc = l
	}
	switch q.Get("running") {
	case "", "false":
	case "true":
		tq.Running = true
	default:
		return tq, "running: must be true or false"
	}
	tq.DayStart = s.dayStartOf(r.Context(), userFrom(r.Context()).ID)
	return tq, ""
}

func (s *Server) handleListTimeEntries(w http.ResponseWriter, r *http.Request) {
	tq, msg := s.timeQuery(r)
	format := r.URL.Query().Get("format")
	if msg == "" && format != "" && format != "json" && format != "csv" {
		msg = `format: must be "json" or "csv"`
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	s.listTimeEntries(w, r, tq, format == "csv")
}

func (s *Server) handleTaskTimeEntries(w http.ResponseWriter, r *http.Request) {
	task, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, "task", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	if task == nil || task.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	tq, msg := s.timeQuery(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	tq.Task = r.PathValue("id")
	s.listTimeEntries(w, r, tq, false)
}

func (s *Server) listTimeEntries(w http.ResponseWriter, r *http.Request, tq timetrack.Query, csv bool) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	if tq.Task != "" {
		if t, err := s.sync.Get(ctx, uid, "task", tq.Task); err != nil {
			s.internal(w, err)
			return
		} else if t == nil {
			writeError(w, http.StatusNotFound, "not_found", "task not found")
			return
		}
	}
	d, err := s.loadTimeData(ctx, uid, csv)
	if err != nil {
		s.internal(w, err)
		return
	}
	now := time.Now().UnixMilli()
	if csv {
		sel := timetrack.Select(d.entries, tq, d.liveTask)
		tasks := make([]timetrack.Task, 0, len(d.tasks))
		for _, t := range d.tasks {
			tasks = append(tasks, t)
		}
		body := timetrack.CSV(timetrack.CSVInput{Entries: sel, Tasks: tasks, Projects: d.projects, Labels: d.labels, Fields: d.fields,
			Loc: tq.Loc, DayStart: tq.DayStart, Now: now, From: tq.From, To: tq.To})
		name := "time-entries"
		for _, p := range []string{tq.From, tq.To} {
			if p != "" {
				name += "-" + p
			}
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+name+`.csv"`)
		// The row count, for clients that report it (ot time export --json).
		w.Header().Set("X-Row-Count", strconv.Itoa(len(sel)))
		_, _ = w.Write([]byte(body))
		return
	}
	limit, ok := timeLimit(w, r)
	if !ok {
		return
	}
	sel := timetrack.Select(d.entries, tq, d.liveTask)
	if c := r.URL.Query().Get("cursor"); c != "" {
		at, id, ok := parseTimeCursor(c)
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid_input", "cursor: must be a cursor returned by this route")
			return
		}
		i := 0
		for i < len(sel) && (sel[i].StartedAt > at || (sel[i].StartedAt == at && sel[i].ID >= id)) {
			i++
		}
		sel = sel[i:]
	}
	resp := map[string]any{"serverTime": now}
	if len(sel) > limit {
		last := sel[limit-1]
		resp["nextCursor"] = base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(last.StartedAt, 10) + "." + last.ID))
		sel = sel[:limit]
	}
	out := make([]apiTimeEntry, 0, len(sel))
	for _, e := range sel {
		out = append(out, d.out(e, now))
	}
	resp["entries"] = out
	writeJSON(w, http.StatusOK, resp)
}

func timeLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	v := r.URL.Query().Get("limit")
	if v == "" {
		return TimeEntryPageSize, true
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > TimeEntryMaxPageSize {
		writeError(w, http.StatusBadRequest, "invalid_input", "limit: must be an integer from 1 to "+strconv.Itoa(TimeEntryMaxPageSize))
		return 0, false
	}
	return n, true
}

func parseTimeCursor(c string) (int64, string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return 0, "", false
	}
	at, id, ok := strings.Cut(string(raw), ".")
	n, err := strconv.ParseInt(at, 10, 64)
	return n, id, ok && err == nil && id != ""
}

// timeEntryInput is the body of POST and PATCH; unknown members are refused.
type timeEntryInput struct {
	TaskID    *string `json:"taskId"`
	StartedAt *int64  `json:"startedAt"`
	EndedAt   *int64  `json:"endedAt"`
	Note      *string `json:"note"`
}

// runningOps closes the caller's running entry (and repairs any other) at at.
func (s *Server) runningOps(ctx context.Context, uid string, at, ts int64) ([]opsync.Op, *timetrack.Entry, error) {
	rows, err := s.sync.List(ctx, uid, "time_entry", false)
	if err != nil {
		return nil, nil, err
	}
	entries := make([]timetrack.Entry, 0, len(rows))
	for _, r := range rows {
		entries = append(entries, timetrack.FromRow(r))
	}
	keep := timetrack.Running(entries, uid)
	var ops []opsync.Op
	for _, rp := range timetrack.StartBatch(entries, uid, at) {
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: "time_entry", EntityID: rp.ID, Field: "ended_at",
			Value: json.RawMessage(strconv.FormatInt(rp.EndedAt, 10)), TS: ts, Device: serverDevice})
	}
	return ops, keep, nil
}

func (s *Server) handleCreateTimeEntry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in timeEntryInput
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	msg := ""
	switch {
	case in.TaskID == nil || *in.TaskID == "":
		msg = "taskId: is required"
	case (in.StartedAt == nil) != (in.EndedAt == nil):
		msg = "startedAt, endedAt: send both to log a closed entry, or neither to start one"
	case in.StartedAt != nil && *in.StartedAt <= 0:
		msg = "startedAt: must be a positive Unix millisecond time"
	case in.EndedAt != nil && *in.EndedAt < *in.StartedAt:
		msg = "endedAt, startedAt: endedAt must not be before startedAt"
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	task, err := s.sync.Get(ctx, uid, "task", *in.TaskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if task == nil || task.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	now := time.Now().UnixMilli()
	ts := s.opTS()
	id := ids.New()
	// With an Idempotency-Key (ot add --natural) the id derives from the key, so
	// a retry returns the entry it created instead of adding another.
	key, keyed, handled := idempotencyKey(w, r)
	if handled {
		return
	}
	if keyed {
		id = s.idemEntityID(uid, "time-entries", key)
		if prev, err := s.sync.Get(ctx, uid, "time_entry", id); err != nil {
			s.internal(w, err)
			return
		} else if prev != nil {
			w.Header().Set(ReplayedHeader, "true")
			s.writeTimeEntry(w, r, id, nil, http.StatusOK)
			return
		}
	}
	start, end := json.RawMessage(strconv.FormatInt(now, 10)), json.RawMessage("null")
	var extra []opsync.Op
	if in.StartedAt != nil {
		start, end = json.RawMessage(strconv.FormatInt(*in.StartedAt, 10)), json.RawMessage(strconv.FormatInt(*in.EndedAt, 10))
	} else if extra, _, err = s.runningOps(ctx, uid, now, ts); err != nil {
		s.internal(w, err)
		return
	}
	note := ""
	if in.Note != nil {
		note = *in.Note
	}
	n, _ := json.Marshal(note)
	body := map[string]json.RawMessage{
		"task_id": json.RawMessage(opsync.QuoteJSON(*in.TaskID)), "user_id": json.RawMessage(opsync.QuoteJSON(uid)),
		"started_at": start, "ended_at": end, "device_id": json.RawMessage(opsync.QuoteJSON(serverDevice)), "note": n,
		"created_at": json.RawMessage(strconv.FormatInt(now, 10)), "deleted_at": json.RawMessage("null"),
	}
	s.writeTimeEntry(w, r, id, append(fieldOps("time_entry", id, body, ts), extra...), http.StatusCreated)
}

func (s *Server) handleStopTimeEntry(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	ops, keep, err := s.runningOps(ctx, uid, time.Now().UnixMilli(), s.opTS())
	if err != nil {
		s.internal(w, err)
		return
	}
	if keep == nil {
		writeError(w, http.StatusNotFound, "not_found", "no time entry is running")
		return
	}
	s.writeTimeEntry(w, r, keep.ID, ops, http.StatusOK)
}

// ownTimeEntry loads a live entry the caller can see (404 otherwise) and
// refuses one another member wrote (403).
func (s *Server) ownTimeEntry(w http.ResponseWriter, r *http.Request, allowAdmin bool) (opsync.Entity, bool) {
	uid := userFrom(r.Context()).ID
	e, err := s.sync.Get(r.Context(), uid, "time_entry", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if e == nil || e.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "time entry not found")
		return nil, false
	}
	if !allowAdmin && idOf(e["user_id"]) != uid {
		writeError(w, http.StatusForbidden, "forbidden", "only the person who tracked an entry can change it")
		return nil, false
	}
	return e, true
}

func (s *Server) handlePatchTimeEntry(w http.ResponseWriter, r *http.Request) {
	stored, ok := s.ownTimeEntry(w, r, false)
	if !ok {
		return
	}
	var in timeEntryInput
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	cur := timetrack.FromRow(stored)
	body := map[string]json.RawMessage{}
	msg := ""
	if in.TaskID != nil {
		msg = "taskId: cannot be changed"
	}
	if in.StartedAt != nil {
		if *in.StartedAt <= 0 {
			msg = "startedAt: must be a positive Unix millisecond time"
		}
		cur.StartedAt = *in.StartedAt
		body["started_at"] = json.RawMessage(strconv.FormatInt(*in.StartedAt, 10))
	}
	if in.EndedAt != nil {
		cur.EndedAt = in.EndedAt
		body["ended_at"] = json.RawMessage(strconv.FormatInt(*in.EndedAt, 10))
	}
	if in.Note != nil {
		body["note"], _ = json.Marshal(*in.Note)
	}
	switch {
	case msg != "":
	case len(body) == 0:
		msg = "nothing to change: send startedAt, endedAt and/or note"
	case cur.EndedAt != nil && *cur.EndedAt < cur.StartedAt:
		msg = "endedAt, startedAt: endedAt must not be before startedAt"
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
		return
	}
	id := r.PathValue("id")
	s.writeTimeEntry(w, r, id, fieldOps("time_entry", id, body, s.opTS()), http.StatusOK)
}

func (s *Server) handleDeleteTimeEntry(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.ownTimeEntry(w, r, true); !ok {
		return
	}
	id := r.PathValue("id")
	body := map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(time.Now().UnixMilli(), 10))}
	s.writeTimeEntry(w, r, id, fieldOps("time_entry", id, body, s.opTS()), http.StatusNoContent)
}

// writeTimeEntry applies one strict batch and answers with entry id as stored.
func (s *Server) writeTimeEntry(w http.ResponseWriter, r *http.Request, id string, ops []opsync.Op, status int) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var res opsync.ApplyResult
	var err error
	if len(ops) > 0 { // nil: an idempotent replay answers with the stored entry
		res, err = s.sync.ApplyStrict(ctx, uid, ops)
	}
	if err != nil {
		var rej *opsync.RejectedError
		switch {
		case writeLimited(w, err):
		case errors.Is(err, opsync.ErrInvalidOp):
			writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		case errors.As(err, &rej):
			writeError(w, http.StatusForbidden, "forbidden", "viewers cannot track time; only the person who tracked an entry can change it, and they, project admins and the owner can delete it")
		default:
			s.internal(w, err)
		}
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, serverDevice)
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	row, err := s.sync.Get(ctx, uid, "time_entry", id)
	if err != nil || row == nil {
		s.internal(w, fmt.Errorf("read time entry after write: %v", err))
		return
	}
	d := &timeData{devices: map[string]string{id: idOf(row["device_id"])}, tasks: map[string]timetrack.Task{}}
	e := timetrack.FromRow(row)
	if t, err := s.sync.Get(ctx, uid, "task", e.TaskID); err == nil && t != nil {
		d.tasks[e.TaskID] = timetrack.TaskFromRow(t)
	}
	writeJSON(w, status, d.out(e, time.Now().UnixMilli()))
}
