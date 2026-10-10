package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/pixari/opentodo/internal/filter"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Saved views (OpenSpec `custom-views`) use the generic collection handlers; this file
// holds the REST-only rules. Sync accepts any string for the enumerations so a future
// value stays additive (clients fall back to defaults at read time), while REST is
// sequential against current state and can safely reject (design D1, D6).

// maxPanels caps how many views a dashboard shows.
const maxPanels = 6

var (
	viewKinds    = []string{"list", "dashboard"}
	viewGroupBy  = []string{"project", "due", "priority", "label", "none"}
	viewSortBy   = []string{"due", "priority", "position", "created", "title"}
	viewSortDir  = []string{"asc", "desc"}
	viewEnumSets = map[string][]string{"kind": viewKinds, "group_by": viewGroupBy, "sort_by": viewSortBy, "sort_dir": viewSortDir}
	// viewDefaults are written on create for every field the caller leaves out.
	viewDefaults = map[string]json.RawMessage{
		"kind":     json.RawMessage(`"list"`),
		"group_by": json.RawMessage(`"project"`),
		"sort_by":  json.RawMessage(`"due"`),
		"sort_dir": json.RawMessage(`"asc"`),
		"pinned":   json.RawMessage(`false`),
		"color":    json.RawMessage(`"#64748b"`),
		"panels":   json.RawMessage(`[]`),
	}
)

// errInvalidView marks a body rejected by checkView; the message names the field.
var errInvalidView = errors.New("invalid view")

func invalidView(format string, args ...any) error {
	return fmt.Errorf("%w: %s", errInvalidView, fmt.Sprintf(format, args...))
}

// applyViewDefaults fills the defaults of a view being created.
func applyViewDefaults(body map[string]json.RawMessage) {
	for f, v := range viewDefaults {
		if _, has := body[f]; !has {
			body[f] = v
		}
	}
	if _, has := body["query"]; !has && kindOf(body, nil) == "dashboard" {
		body["query"] = json.RawMessage(`""`)
	}
}

// kindOf is the view's kind after the write: the body's value, else the stored one,
// else "list" (the default for rows written by sync without a kind).
func kindOf(body map[string]json.RawMessage, existing opsync.Entity) string {
	for _, src := range []map[string]json.RawMessage{body, existing} {
		if raw, ok := src["kind"]; ok {
			var k string
			if json.Unmarshal(raw, &k) == nil {
				return k
			}
		}
	}
	return "list"
}

// checkView validates a view create (existing == nil) or patch. Values of the wrong
// JSON type are left to the op schema validation in Apply so the two never disagree.
func (s *Server) checkView(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) error {
	str := func(field string) (string, bool) {
		raw, has := body[field]
		if !has {
			return "", false
		}
		var v string
		if json.Unmarshal(raw, &v) != nil {
			return "", false
		}
		return v, true
	}
	if existing == nil {
		if _, has := body["name"]; !has {
			return invalidView("view.name is required")
		}
		if _, has := body["query"]; !has {
			return invalidView("view.query is required")
		}
	}
	if name, ok := str("name"); ok && strings.TrimSpace(name) == "" {
		return invalidView("view.name must not be empty")
	}
	for field, allowed := range viewEnumSets {
		if v, ok := str(field); ok && !slices.Contains(allowed, v) {
			return invalidView("view.%s must be one of %s", field, strings.Join(allowed, ", "))
		}
	}
	if existing != nil {
		if k, ok := str("kind"); ok && k != kindOf(nil, existing) {
			return invalidView("view.kind cannot be changed after creation")
		}
	}
	kind := kindOf(body, existing)
	if q, ok := str("query"); ok {
		if strings.TrimSpace(q) == "" && kind == "list" {
			return invalidView("view.query must not be empty")
		}
		if err := filter.Parse(q); err != nil {
			return invalidView("view.query: %s", err.Error())
		}
	}
	if raw, has := body["panels"]; has {
		var panels []string
		if json.Unmarshal(raw, &panels) != nil {
			return nil
		}
		if kind != "dashboard" && len(panels) > 0 {
			return invalidView("view.panels is only allowed on dashboards")
		}
		if len(panels) > maxPanels {
			return invalidView("view.panels holds at most %d views", maxPanels)
		}
		seen := map[string]bool{}
		for _, pid := range panels {
			if pid == id {
				return invalidView("view.panels: a dashboard cannot contain itself")
			}
			if seen[pid] {
				return invalidView("view.panels: view %q is listed twice", pid)
			}
			seen[pid] = true
			p, err := s.sync.Get(ctx, uid, "view", pid)
			if err != nil {
				return err
			}
			if p == nil || p.Deleted() {
				return invalidView("view.panels references unknown or deleted view %q", pid)
			}
			if kindOf(nil, p) != "list" {
				return invalidView("view.panels: view %q is not a list view (dashboards cannot be nested)", pid)
			}
		}
	}
	return nil
}

// viewError answers 400 invalid_input for a rejected view body and 500 otherwise.
func (s *Server) viewError(w http.ResponseWriter, err error) {
	if errors.Is(err, errInvalidView) {
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), errInvalidView.Error()+": "))
		return
	}
	s.internal(w, err)
}
