package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/pixari/opentodo/internal/iconset"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Sections (OpenSpec change `board-view`, design D7). REST requests are handled
// sequentially against current state, so the reference rules below are enforced
// here; the sync path never rejects for them (clients treat a dangling
// section_id as "No section").

// checkSection validates a section create (existing == nil) or patch body: the
// name must not be empty, a new section needs an existing, non-deleted project,
// and a section never moves to another project. It returns a user-facing
// message when the body is rejected.
func (s *Server) checkSection(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	if msg := checkSectionStyle(body); msg != "" {
		return msg, nil
	}
	if raw, has := body["name"]; has || existing == nil {
		var name string
		if err := json.Unmarshal(raw, &name); has && err != nil {
			return "", nil // type errors are reported by the op schema
		}
		if strings.TrimSpace(name) == "" {
			return "section.name must not be empty", nil
		}
	}
	raw, has := body["project_id"]
	if existing != nil {
		if has && idOf(raw) != idOf(existing["project_id"]) {
			return "section.project_id cannot change; create a section in the other project instead", nil
		}
		return "", nil
	}
	pid := idOf(raw)
	if pid == "" {
		return "section.project_id is required", nil
	}
	p, err := s.sync.Get(ctx, uid, "project", pid)
	if err != nil {
		return "", err
	}
	if p == nil || p.Deleted() {
		return fmt.Sprintf("section.project_id references unknown or deleted project %q", pid), nil
	}
	return "", nil
}

// hexColour is a palette colour as the API accepts it.
var hexColour = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// checkSectionStyle validates a section's optional colour and icon (OpenSpec
// change icons-and-section-style, design D4): null clears either; otherwise the
// colour is #rrggbb and the icon a name from the icon catalogue. Only REST checks
// the catalogue; sync accepts names it does not know yet.
func checkSectionStyle(body map[string]json.RawMessage) string {
	if raw, has := body["color"]; has && string(raw) != "null" {
		var c string
		if json.Unmarshal(raw, &c) != nil || !hexColour.MatchString(c) {
			return "section.color must be a #rrggbb colour or null"
		}
	}
	if raw, has := body["icon"]; has && string(raw) != "null" {
		var name string
		if json.Unmarshal(raw, &name) != nil || !iconset.Valid(name) {
			return fmt.Sprintf("section.icon must be a name from the icon catalogue or null, got %s", raw)
		}
	}
	return ""
}

// checkSections dispatches the section rules of the entity being written.
func (s *Server) checkSections(ctx context.Context, uid, entity string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	switch entity {
	case "section":
		return s.checkSection(ctx, uid, body, existing)
	case "task":
		return s.checkTaskSection(ctx, uid, body, existing)
	}
	return "", nil
}

// checkTaskSection validates task.section_id on create (existing == nil) and
// patch: a section must exist, not be deleted and belong to the task's project
// (after the write). A patch that moves the task to another project without
// naming a section clears the section in the same batch (spec: changing a
// task's project clears its section).
func (s *Server) checkTaskSection(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	project := idOf(body["project_id"])
	if _, has := body["project_id"]; !has && existing != nil {
		project = idOf(existing["project_id"])
	}
	raw, has := body["section_id"]
	if !has {
		if existing != nil && idOf(existing["section_id"]) != "" {
			if _, moved := body["project_id"]; moved && project != idOf(existing["project_id"]) {
				body["section_id"] = json.RawMessage("null")
			}
		}
		return "", nil
	}
	sid := idOf(raw)
	if sid == "" {
		return "", nil
	}
	sec, err := s.sync.Get(ctx, uid, "section", sid)
	if err != nil {
		return "", err
	}
	if sec == nil || sec.Deleted() {
		return fmt.Sprintf("task.section_id references unknown or deleted section %q", sid), nil
	}
	if idOf(sec["project_id"]) != project {
		return "task.section_id must name a section of the task's project", nil
	}
	return "", nil
}

// sectionDeleteOps clears section_id on the open, non-deleted tasks of a deleted
// section, one op per task, stamped like the section's tombstone so they land in
// the same batch (spec: deleting a section moves its tasks to "No section").
func (s *Server) sectionDeleteOps(ctx context.Context, uid, sectionID string, ts int64) ([]opsync.Op, error) {
	tasks, err := s.sync.List(ctx, uid, "task", false)
	if err != nil {
		return nil, err
	}
	var ops []opsync.Op
	for _, t := range tasks {
		if idOf(t["section_id"]) != sectionID || (len(t["completed_at"]) > 0 && string(t["completed_at"]) != "null") {
			continue
		}
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: "task", EntityID: idOf(t["id"]), Field: "section_id",
			Value: json.RawMessage("null"), TS: ts, Device: serverDevice})
	}
	return ops, nil
}
