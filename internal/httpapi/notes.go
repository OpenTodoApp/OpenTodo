package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Standalone notes and plain-text note writes (OpenSpec change notes-overview,
// design D12, D13): the append and to-task routes, the body version of every
// note representation and the version check of a replacement. The note
// collection itself is served by the generic collection routes.

// MaxNoteText bounds a body or an append written through REST, the CLI and
// MCP (characters), like a task description written by an agent.
const MaxNoteText = 20000

// MaxNoteTitle bounds a standalone note's title (characters), like a task title.
const MaxNoteTitle = 500

func (s *Server) registerNoteRoutes(mux *routes) {
	// signedIn: read tokens and agent tokens are refused on every write by the
	// authentication middleware (agent tokens write notes through MCP).
	mux.handle("POST /api/v1/notes/{id}/append", signedIn, s.appendHandler("note"))
	mux.handle("POST /api/v1/tasks/{id}/note/append", signedIn, s.appendHandler("task"))
	mux.handle("POST /api/v1/notes/{id}/to-task", signedIn, s.handleNoteToTask)
}

// annotateBody gives every task, project and note representation its body
// version and, for tasks and notes, its pending appends oldest first under
// "appends" instead of the `appends.<id>` fields (design D13).
func (s *Server) annotateBody(ctx context.Context, entity string, list ...opsync.Entity) error {
	if entity != "task" && entity != "project" && entity != "note" {
		return nil
	}
	id := ""
	if len(list) == 1 && list[0] != nil {
		id = idOf(list[0]["id"])
	}
	infos, err := s.sync.BodyInfos(ctx, userFrom(ctx).ID, entity, id)
	if err != nil {
		return err
	}
	for _, e := range list {
		if e == nil {
			continue
		}
		for f := range e {
			if strings.HasPrefix(f, opsync.AppendPrefix) {
				delete(e, f)
			}
		}
		info := infos[idOf(e["id"])]
		version := info.Version
		if version == "" {
			version = "0"
		}
		e["body_version"] = json.RawMessage(opsync.QuoteJSON(version))
		if entity != "project" {
			appends := info.Appends
			if appends == nil {
				appends = []opsync.PendingAppend{}
			}
			raw, _ := json.Marshal(appends)
			e["appends"] = raw
		}
	}
	return nil
}

// withIfMatch makes a PATCH that writes description check the body version
// in If-Match inside the write transaction (design D13). Without the header
// the write behaves as before.
func withIfMatch(r *http.Request, entity string, body map[string]json.RawMessage) *http.Request {
	v := strings.TrimSpace(r.Header.Get("If-Match"))
	if _, has := body["description"]; !has || v == "" || (entity != "task" && entity != "project" && entity != "note") {
		return r
	}
	v = strings.TrimPrefix(v, "W/")
	return r.WithContext(opsync.WithBodyVersion(r.Context(), entity, r.PathValue("id"), strings.Trim(v, `"`)))
}

// bodyChanged answers a failed version check: 409 body_changed with the
// current version, nothing written.
func bodyChanged(w http.ResponseWriter, err error) bool {
	var bc *opsync.BodyChangedError
	if !errors.As(err, &bc) {
		return false
	}
	w.Header().Set("ETag", `"`+bc.Current+`"`)
	writeErrorWith(w, http.StatusConflict, "body_changed", "the note changed after it was read: read it again and retry",
		map[string]any{"body_version": bc.Current})
	return true
}

// checkNoteBody enforces the REST rules of a note write the sync path cannot:
// a title of at most MaxNoteTitle characters, a body of at most MaxNoteText,
// labels and a project that exist for the caller.
func (s *Server) checkNoteBody(ctx context.Context, uid string, body map[string]json.RawMessage) (string, error) {
	if raw, has := body["title"]; has {
		var t string
		if json.Unmarshal(raw, &t) == nil && !e2ee.IsCiphertext(t) && utf8.RuneCountInString(t) > MaxNoteTitle {
			return fmt.Sprintf("note.title must be at most %d characters", MaxNoteTitle), nil
		}
	}
	if raw, has := body["description"]; has {
		var t string
		if json.Unmarshal(raw, &t) == nil && !e2ee.IsCiphertext(t) && utf8.RuneCountInString(t) > MaxNoteText {
			return fmt.Sprintf("note.description must be at most %d characters", MaxNoteText), nil
		}
	}
	if raw, has := body["labels"]; has {
		var labels []string
		if json.Unmarshal(raw, &labels) == nil {
			for _, id := range labels {
				l, err := s.sync.Get(ctx, uid, "label", id)
				if err != nil {
					return "", err
				}
				if l == nil || l.Deleted() {
					return fmt.Sprintf("note.labels references unknown or deleted label %q", id), nil
				}
			}
		}
	}
	if pid := idOf(body["project_id"]); pid != "" {
		p, err := s.sync.Get(ctx, uid, "project", pid)
		if err != nil {
			return "", err
		}
		if p == nil || p.Deleted() {
			return fmt.Sprintf("note.project_id references unknown or deleted project %q", pid), nil
		}
	}
	return "", nil
}

// appendRefusals explain a refused append.
var appendRefusals = refusals{
	opsync.ReasonTooManyAppends: refuse(http.StatusConflict, "too_many_appends",
		"this note already has 100 appends no device has added to it yet: open it in the app, then append again"),
	opsync.ReasonAppendTaken: refuse(http.StatusConflict, "conflict", "this append id is already used: choose another id"),
	opsync.ReasonTooLarge:    refuse(http.StatusBadRequest, "invalid_input", "the note and its pending appends would exceed 64 KB"),
	otherRefusal:             refuse(http.StatusForbidden, "forbidden", "your role on this project does not allow changing its notes"),
}

// appendHandler adds text at the end of a note or a task's note without
// replacing anything (design D13): one pending append `appends.<id>`, which
// devices fold into the document. Body {"id"?, "text"}; 201 with the append id.
func (s *Server) appendHandler(entity string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ID   string `json:"id"`
			Text string `json:"text"`
		}
		if err := readJSON(r, &body); err != nil {
			badBody(w, err)
			return
		}
		uid, id := userFrom(r.Context()).ID, r.PathValue("id")
		if body.ID == "" {
			body.ID = ids.New()
		}
		if _, ok := opsync.AppendID(opsync.AppendPrefix + body.ID); !ok {
			writeError(w, http.StatusBadRequest, "invalid_input", "id must be 1 to 64 letters, digits, - or _")
			return
		}
		if strings.TrimSpace(body.Text) == "" || (!e2ee.IsCiphertext(body.Text) && utf8.RuneCountInString(body.Text) > MaxNoteText) {
			writeError(w, http.StatusBadRequest, "invalid_input", fmt.Sprintf("text must be 1 to %d characters", MaxNoteText))
			return
		}
		e, err := s.sync.Get(r.Context(), uid, entity, id)
		if err != nil {
			s.internal(w, err)
			return
		}
		if e == nil || e.Deleted() {
			writeError(w, http.StatusNotFound, "not_found", "not found")
			return
		}
		if !e2ee.IsCiphertext(body.Text) && s.refuseIfEncrypted(w, r, "this account uses end-to-end encryption: the text must be encrypted on your device (ot encryption unlock)") {
			return
		}
		field := opsync.AppendPrefix + body.ID
		if prev, has := e[field]; has {
			// A retry of the same append is answered as written; another text is a conflict.
			if string(prev) == opsync.QuoteJSON(body.Text) || string(prev) == `""` {
				s.writeAppended(w, r, entity, id, body.ID, http.StatusOK)
				return
			}
		}
		op := opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: field, Value: json.RawMessage(opsync.QuoteJSON(body.Text)), TS: s.opTS(), Device: serverDevice}
		if _, ok := s.applyREST(w, r.Context(), uid, []opsync.Op{op}, "", appendRefusals); !ok {
			return
		}
		s.writeAppended(w, r, entity, id, body.ID, http.StatusCreated)
	}
}

func (s *Server) writeAppended(w http.ResponseWriter, r *http.Request, entity, id, appendID string, status int) {
	infos, err := s.sync.BodyInfos(r.Context(), userFrom(r.Context()).ID, entity, id)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, map[string]any{"entity": entity, "entity_id": id, "append_id": appendID, "body_version": infos[id].Version})
}

// handleNoteToTask turns a standalone note into a task in one batch (design
// D6): a new task with the note's title, document, projection, project,
// labels and pending appends, and the note's tombstone. On an encrypted
// account the body carries the task id and the content values sealed for it
// ({"task_id", "title", "description", "notes_doc"}), since the server can
// neither read nor reseal them.
func (s *Server) handleNoteToTask(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if r.ContentLength != 0 {
		if err := readJSON(r, &body); err != nil {
			badBody(w, err)
			return
		}
	}
	uid, id := userFrom(r.Context()).ID, r.PathValue("id")
	note, err := s.sync.Get(r.Context(), uid, "note", id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if note == nil || note.Deleted() {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	taskID := idOf(body["task_id"])
	if taskID == "" {
		taskID = ids.New()
	} else if !opsync.ValidEntityID(taskID) {
		writeError(w, http.StatusBadRequest, "invalid_input", "task_id is not a valid id")
		return
	}
	override := map[string]json.RawMessage{}
	for _, f := range []string{"title", "description", "notes_doc"} {
		if v, has := body[f]; has {
			override[f] = v
		}
	}
	on, err := s.encryptionEnabled(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if on && (len(override) == 0 || idOf(body["task_id"]) == "") {
		writeError(w, http.StatusConflict, "encryption_enabled",
			"this account uses end-to-end encryption: the task's title and note must be sealed for the new task id on your device (ot notes to-task)")
		return
	}
	now := s.now().UnixMilli()
	task, tomb := opsync.NoteToTask(note, now, override)
	ts := s.opTS()
	ops := append(fieldOps("task", taskID, task, ts), fieldOps("note", id, tomb, ts)...)
	if _, ok := s.applyREST(w, r.Context(), uid, ops, "", collectionRefusals); !ok {
		return
	}
	e, err := s.sync.Get(r.Context(), uid, "task", taskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.annotateProjects(r.Context(), "task", e); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, e)
}
