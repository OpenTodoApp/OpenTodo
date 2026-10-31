package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/frames"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Calendar slots (OpenSpec change calendar-slots, design D9): several small
// tasks in one calendar block, a personal entity written through the op log.
// Reads accept every token scope; writes are refused to `read` and `agent`
// tokens by the scope check (they are not agent content routes). Invalid values
// answer 422 naming the field. A PATCH with "move_tasks" also dates the listed
// tasks to the slot's day, as adding in the app does (design D3).

func (s *Server) registerSlotRoutes(mux *routes) {
	mux.handle("GET /api/v1/slots", signedIn, s.handleListSlots)
	mux.handle("POST /api/v1/slots", signedIn, s.handleCreateSlot)
	mux.handle("GET /api/v1/slots/{id}", signedIn, s.handleGetSlot)
	mux.handle("PATCH /api/v1/slots/{id}", signedIn, s.handlePatchSlot)
	mux.handle("DELETE /api/v1/slots/{id}", signedIn, s.handleDeleteSlot)
}

const (
	// slotMinMinutes, slotMaxMinutes and slotStep are the lengths a client may
	// set (design D1); the op log itself accepts up to a day.
	slotMinMinutes = 15
	slotMaxMinutes = 480
	slotStep       = 15
	// maxSlotTitle is the longest slot title in characters (design D1).
	maxSlotTitle = 200
)

// slotFields are the fields a slot body may carry and a response shows.
var slotFields = []string{"title", "date", "start", "minutes", "task_ids", "color", "created_at"}

// slotBody is a POST or PATCH body: nil is absent.
type slotBody struct {
	Title     json.RawMessage `json:"title"`
	Date      json.RawMessage `json:"date"`
	Start     json.RawMessage `json:"start"`
	Minutes   json.RawMessage `json:"minutes"`
	TaskIDs   json.RawMessage `json:"task_ids"`
	Color     json.RawMessage `json:"color"`
	MoveTasks bool            `json:"move_tasks"`
}

func (b slotBody) fields() map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for f, v := range map[string]json.RawMessage{"title": b.Title, "date": b.Date, "start": b.Start, "minutes": b.Minutes, "task_ids": b.TaskIDs, "color": b.Color} {
		if v != nil {
			out[f] = v
		}
	}
	return out
}

// slotDTO is a slot as REST shows it: its fields and whether its title is ciphertext.
func slotDTO(e opsync.Entity) map[string]any {
	out := map[string]any{"id": json.RawMessage(e["id"])}
	for _, f := range slotFields {
		if v, ok := e[f]; ok {
			out[f] = v
		}
	}
	var title string
	_ = json.Unmarshal(e["title"], &title)
	out["encrypted"] = e2ee.IsCiphertext(title)
	return out
}

func entityString(e opsync.Entity, f string) string {
	var v string
	_ = json.Unmarshal(e[f], &v)
	return v
}

func (s *Server) handleListSlots(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, to := q.Get("from"), q.Get("to")
	for name, v := range map[string]string{"from": from, "to": to} {
		if _, err := time.Parse(time.DateOnly, v); v != "" && (err != nil || len(v) != 10) {
			writeErrorWith(w, http.StatusUnprocessableEntity, "invalid_input", name+` must be a date "YYYY-MM-DD"`, map[string]any{"field": name})
			return
		}
	}
	list, err := s.sync.List(r.Context(), userFrom(r.Context()).ID, "slot", false)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, e := range list {
		d := entityString(e, "date")
		if (from != "" && d < from) || (to != "" && d > to) {
			continue
		}
		out = append(out, slotDTO(e))
	}
	slices.SortStableFunc(out, func(a, b map[string]any) int {
		return strings.Compare(slotKey(a), slotKey(b))
	})
	writeJSON(w, http.StatusOK, map[string]any{"slots": out})
}

// slotKey orders slots by date, then start.
func slotKey(m map[string]any) string {
	d, _ := m["date"].(json.RawMessage)
	st, _ := m["start"].(json.RawMessage)
	return string(d) + string(st)
}

// liveSlot reads a slot of the caller, answering 404 when it is unknown or deleted.
func (s *Server) liveSlot(w http.ResponseWriter, r *http.Request) (opsync.Entity, bool) {
	e, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, "slot", r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if e == nil || e.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return nil, false
	}
	return e, true
}

func (s *Server) handleGetSlot(w http.ResponseWriter, r *http.Request) {
	if e, ok := s.liveSlot(w, r); ok {
		writeJSON(w, http.StatusOK, slotDTO(e))
	}
}

func (s *Server) handleCreateSlot(w http.ResponseWriter, r *http.Request) {
	var b slotBody
	if err := readJSON(r, &b); err != nil {
		badBody(w, err)
		return
	}
	body := b.fields()
	if _, has := body["date"]; !has {
		slotInvalid(w, "date", "slot.date is required")
		return
	}
	now := s.now().UnixMilli()
	for f, v := range map[string]string{"title": `""`, "start": `"09:00"`, "minutes": `30`, "task_ids": `[]`, "color": `"#64748b"`} {
		if _, has := body[f]; !has {
			body[f] = json.RawMessage(v)
		}
	}
	body["created_at"] = json.RawMessage(strconv.FormatInt(now, 10))
	body["deleted_at"] = json.RawMessage(`null`)
	if !s.checkSlot(w, r, body, nil) {
		return
	}
	s.writeSlot(w, r, ids.New(), body, b.MoveTasks, http.StatusCreated)
}

func (s *Server) handlePatchSlot(w http.ResponseWriter, r *http.Request) {
	var b slotBody
	if err := readJSON(r, &b); err != nil {
		badBody(w, err)
		return
	}
	body := b.fields()
	if len(body) == 0 && !b.MoveTasks {
		writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
		return
	}
	existing, ok := s.liveSlot(w, r)
	if !ok || !s.checkSlot(w, r, body, existing) {
		return
	}
	s.writeSlot(w, r, r.PathValue("id"), body, b.MoveTasks, http.StatusOK)
}

func (s *Server) handleDeleteSlot(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.liveSlot(w, r); !ok {
		return
	}
	body := map[string]json.RawMessage{"deleted_at": json.RawMessage(strconv.FormatInt(s.now().UnixMilli(), 10))}
	s.writeSlot(w, r, r.PathValue("id"), body, false, http.StatusNoContent)
}

// writeSlot applies a slot's fields, and with moveTasks the listed tasks' dates
// and their removal from the day's other slots, as one strict batch.
func (s *Server) writeSlot(w http.ResponseWriter, r *http.Request, id string, body map[string]json.RawMessage, moveTasks bool, status int) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	ts := s.opTS()
	ops := fieldOps("slot", id, body, ts)
	if moveTasks {
		extra, ok := s.slotMoveOps(w, r, id, body, ts)
		if !ok {
			return
		}
		ops = append(ops, extra...)
	}
	if _, ok := s.applyREST(w, ctx, uid, ops, "", slotRefusals); !ok {
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	e, err := s.sync.Get(ctx, uid, "slot", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, slotDTO(e))
}

// slotMoveOps dates every listed task to the slot's day without a time and
// takes them out of the day's other slots (design D3, D9). A task the caller
// cannot see answers 422; one they cannot edit is refused by the batch (403).
func (s *Server) slotMoveOps(w http.ResponseWriter, r *http.Request, id string, body map[string]json.RawMessage, ts int64) ([]opsync.Op, bool) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	existing, err := s.sync.Get(ctx, uid, "slot", id)
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	pick := func(f string) json.RawMessage {
		if v, has := body[f]; has {
			return v
		}
		return existing[f]
	}
	var date string
	var list []string
	_ = json.Unmarshal(pick("date"), &date)
	_ = json.Unmarshal(pick("task_ids"), &list)
	if date == "" {
		slotInvalid(w, "date", "slot.date is required to move tasks")
		return nil, false
	}
	var ops []opsync.Op
	want := json.RawMessage(`{"date":` + opsync.QuoteJSON(date) + `}`)
	for _, tid := range list {
		task, err := s.sync.Get(ctx, uid, "task", tid)
		if err != nil {
			s.internal(w, err)
			return nil, false
		}
		if task == nil || task.Deleted() {
			writeErrorWith(w, http.StatusUnprocessableEntity, "invalid_input", fmt.Sprintf("slot.task_ids: %q is not a task you can see", tid), map[string]any{"field": "task_ids", "task_id": tid})
			return nil, false
		}
		var due struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
		}
		_ = json.Unmarshal(task["due"], &due)
		if due.Date == date && due.Time == nil {
			continue
		}
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: "task", EntityID: tid, Field: "due", Value: want, TS: ts, Device: serverDevice})
	}
	others, err := s.sync.List(ctx, uid, "slot", false)
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	for _, o := range others {
		oid := entityString(o, "id")
		if oid == id || entityString(o, "date") != date {
			continue
		}
		var theirs []string
		_ = json.Unmarshal(o["task_ids"], &theirs)
		kept := slices.DeleteFunc(slices.Clone(theirs), func(t string) bool { return slices.Contains(list, t) })
		if len(kept) != len(theirs) {
			v, _ := json.Marshal(kept)
			ops = append(ops, opsync.Op{ID: ids.New(), Entity: "slot", EntityID: oid, Field: "task_ids", Value: v, TS: ts, Device: serverDevice})
		}
	}
	return ops, true
}

// slotRefusals explain a refused slot write: a task the caller may not edit is named.
var slotRefusals = refusals{
	otherRefusal: func(w http.ResponseWriter, rej *opsync.RejectedError) {
		if rej.Op.Entity == "task" {
			writeErrorWith(w, http.StatusForbidden, "forbidden", fmt.Sprintf("you can't change the date of task %q", rej.Op.EntityID), map[string]any{"task_id": rej.Op.EntityID})
			return
		}
		writeError(w, http.StatusForbidden, "forbidden", "you can't change "+rej.Op.Entity+"."+rej.Op.Field)
	},
}

// isDateValue reports whether raw is a JSON string "YYYY-MM-DD" naming a real day.
func isDateValue(raw json.RawMessage) bool {
	var d string
	if json.Unmarshal(raw, &d) != nil || len(d) != 10 {
		return false
	}
	_, err := time.Parse(time.DateOnly, d)
	return err == nil
}

func slotInvalid(w http.ResponseWriter, field, msg string) {
	writeErrorWith(w, http.StatusUnprocessableEntity, "invalid_input", msg, map[string]any{"field": field})
}

// checkSlot validates a slot body (existing is nil on create) and answers the refusal.
func (s *Server) checkSlot(w http.ResponseWriter, r *http.Request, body map[string]json.RawMessage, existing opsync.Entity) bool {
	if raw, has := body["title"]; has {
		var title string
		if json.Unmarshal(raw, &title) != nil || (!e2ee.IsCiphertext(title) && utf8.RuneCountInString(title) > maxSlotTitle) {
			slotInvalid(w, "title", fmt.Sprintf("slot.title must be at most %d characters", maxSlotTitle))
			return false
		}
		if title != "" && !e2ee.IsCiphertext(title) {
			on, err := s.encryptionEnabled(r.Context(), userFrom(r.Context()).ID)
			if err != nil {
				s.internal(w, err)
				return false
			}
			if on {
				writeError(w, http.StatusConflict, "encryption_enabled", "this account uses end-to-end encryption: slot.title must be encrypted on a device")
				return false
			}
		}
	}
	if raw, has := body["date"]; has {
		if !isDateValue(raw) {
			slotInvalid(w, "date", `slot.date must be a date "YYYY-MM-DD"`)
			return false
		}
	}
	if raw, has := body["start"]; has {
		var st string
		if json.Unmarshal(raw, &st) != nil || frames.Clock(st) < 0 {
			slotInvalid(w, "start", `slot.start must be a time "HH:MM" between 00:00 and 23:59`)
			return false
		}
	}
	if raw, has := body["minutes"]; has {
		var n int
		if json.Unmarshal(raw, &n) != nil || n < slotMinMinutes || n > slotMaxMinutes || n%slotStep != 0 {
			slotInvalid(w, "minutes", fmt.Sprintf("slot.minutes must be %d to %d in steps of %d", slotMinMinutes, slotMaxMinutes, slotStep))
			return false
		}
	}
	if raw, has := body["task_ids"]; has {
		var list []string
		if json.Unmarshal(raw, &list) != nil || list == nil {
			slotInvalid(w, "task_ids", "slot.task_ids must be an array of task ids")
			return false
		}
		if len(list) > opsync.MaxSlotTasks {
			slotInvalid(w, "task_ids", fmt.Sprintf("a slot holds at most %d tasks", opsync.MaxSlotTasks))
			return false
		}
		seen := map[string]bool{}
		for _, id := range list {
			if !opsync.ValidEntityID(id) || seen[id] {
				slotInvalid(w, "task_ids", fmt.Sprintf("slot.task_ids: %q is not a task id or is listed twice", id))
				return false
			}
			seen[id] = true
		}
	}
	if raw, has := body["color"]; has {
		var c string
		if json.Unmarshal(raw, &c) != nil || !frameColor.MatchString(c) {
			slotInvalid(w, "color", `slot.color must be a hex colour such as "#3b82f6"`)
			return false
		}
	}
	return true
}
