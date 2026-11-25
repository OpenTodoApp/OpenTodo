package sync

import (
	"context"
	"encoding/json"
)

// KeepsOpenSubtasks reports whether the user chose to keep a parent's open
// subtasks open when it is completed (OpenSpec change keep-open-subtasks,
// design D1): user_prefs.complete_subtasks "keep"; anything else completes them.
func (s *Service) KeepsOpenSubtasks(ctx context.Context, uid string) (bool, error) {
	prefs, err := s.Get(ctx, uid, "user_prefs", "me")
	if err != nil || prefs == nil {
		return false, err
	}
	return StringOf(prefs["complete_subtasks"]) == "keep", nil
}

// CompletionCascade returns the open, live descendants of task id that a write
// completing it also completes, the server's side of the web app's
// planCompletePlain (keep-open-subtasks D4): every completion path (REST, the
// agent tools, rules and routines, CalDAV, public pages) completes them in the
// same batch unless the user keeps open subtasks. Empty when body does not
// complete an open task, or when the completion rolls a series (the caller
// knows: ok from RecurringCompletion). Read level by level through parent_id,
// not the whole account.
func (s *Service) CompletionCascade(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing Entity) ([]string, error) {
	if at, completing := body["completed_at"]; !completing || IsNull(at) || existing == nil || existing.Deleted() || !IsNull(existing["completed_at"]) {
		return nil, nil
	}
	keep, err := s.KeepsOpenSubtasks(ctx, uid)
	if err != nil || keep {
		return nil, err
	}
	var out []string
	seen := map[string]bool{id: true}
	for level := []string{id}; len(level) > 0; {
		vals := make([]json.RawMessage, 0, len(level))
		for _, p := range level {
			vals = append(vals, json.RawMessage(QuoteJSON(p)))
		}
		kids, err := s.ListWhere(ctx, uid, "task", false, &Match{Field: "parent_id", Values: vals})
		if err != nil {
			return nil, err
		}
		level = level[:0:0]
		for _, k := range kids {
			kid := StringOf(k["id"])
			if kid == "" || seen[kid] {
				continue
			}
			seen[kid] = true
			level = append(level, kid)
			if NumberOf(k["completed_at"]) == 0 {
				out = append(out, kid)
			}
		}
	}
	return out, nil
}
