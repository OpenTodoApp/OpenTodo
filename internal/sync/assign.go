package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/notify"
)

// Assignment events (OpenSpec change `task-assignment`, design D4).

// AddSink registers a notification sink. Every sink receives the assignment
// events of committed batches, in registration order. Call it during wiring,
// before the service handles requests. A service without sinks emits nothing.
func (s *Service) AddSink(sink notify.Sink) {
	if sink != nil {
		s.sinks = append(s.sinks, sink)
	}
}

// EmitPageActivity hands a task page event (a guest's reply or completion) to
// the sinks (OpenSpec task-pages, design D9).
func (s *Service) EmitPageActivity(ctx context.Context, e notify.PageEvent) {
	s.sinks.PageActivity(ctx, e)
}

// emitAssignments hands one notify.Assigned event per task whose assignee_id
// changed in a committed batch to someone other than its author. It runs after
// commit, so the sinks see the stored state and cannot affect the batch.
func (s *Service) emitAssignments(ctx context.Context, author string, at int64, changes []Change) {
	if len(s.sinks) == 0 {
		return
	}
	var actorName string
	actorLoaded := false
	for _, c := range changes {
		if c.Entity != "task" {
			continue
		}
		fc, ok := c.Fields["assignee_id"]
		if !ok {
			continue
		}
		assignee := idValue(fc.To)
		if assignee == "" || assignee == author {
			continue
		}
		if !actorLoaded {
			actorName = s.userName(ctx, author)
			actorLoaded = true
		}
		e := notify.Assigned{AssigneeID: assignee, ActorID: author, ActorName: actorName, TaskID: c.EntityID, At: at}
		e.TaskTitle = s.stringField(ctx, c.ScopeID, "task", c.EntityID, "title")
		e.ProjectID = idValue(json.RawMessage(s.rawField(ctx, c.ScopeID, "task", c.EntityID, "project_id")))
		if e.ProjectID == "" {
			if pid, ok := strings.CutPrefix(c.ScopeID, "project:"); ok {
				e.ProjectID = pid
			}
		}
		if e.ProjectID != "" {
			e.ProjectName = s.stringField(ctx, c.ScopeID, "project", e.ProjectID, "name")
		}
		s.sinks.Assigned(ctx, e)
	}
}

func (s *Service) userName(ctx context.Context, id string) string {
	var name, email string
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(name,''), COALESCE(email,'') FROM users WHERE id = ?`, id).Scan(&name, &email); err != nil {
		return ""
	}
	if name == "" {
		return email
	}
	return name
}

// rawField reads one materialized value ("" when absent or on error: events are
// best effort and never fail a batch that has already committed).
func (s *Service) rawField(ctx context.Context, scope, entity, id, field string) string {
	var v string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ? AND field = ?`,
		scope, entity, id, field).Scan(&v)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return ""
	}
	return v
}

// stringField reads a string value for server-built text (notifications). A
// ciphertext value (OpenSpec `e2ee`) becomes e2ee.Placeholder: the server cannot
// read it and must never show the envelope to people.
func (s *Service) stringField(ctx context.Context, scope, entity, id, field string) string {
	var out string
	if raw := s.rawField(ctx, scope, entity, id, field); raw != "" {
		_ = json.Unmarshal([]byte(raw), &out)
	}
	return e2ee.Display(out)
}
