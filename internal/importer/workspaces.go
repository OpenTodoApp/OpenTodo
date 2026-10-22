package importer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspaces in the own export (OpenSpec change workspaces, data-import
// "Workspaces restored"): an exported workspace is matched to one of the
// importing account's workspaces by id, then by name ignoring case; one that
// matches nothing is created as the account's own while its limit allows,
// and otherwise its entities land in the default workspace with a note.
// Members and groups are never imported.

// ExportedWorkspace is one entry of the export's `workspaces` array.
type ExportedWorkspace struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Icon    string `json:"icon"`
	Color   string `json:"color"`
	Default bool   `json:"default"`
}

// mapWorkspaces rewrites the workspace_id of every row to the importing
// account's workspace. create is false for a preview: nothing is written, and
// a workspace that would be created keeps its exported id in the plan.
func (s *Service) mapWorkspaces(ctx context.Context, uid string, parsed *Parsed, create bool) error {
	if len(parsed.Workspaces) == 0 {
		return nil
	}
	mine, err := s.sync.Workspaces(ctx, uid)
	if err != nil {
		return err
	}
	byID, byName := map[string]string{}, map[string]string{}
	for _, w := range mine {
		target := w.ID
		if w.Default {
			target = ""
		}
		byID[w.ID] = target
		if w.Role == opsync.WorkspaceOwner || w.Role == opsync.WorkspaceAdmin {
			byName[strings.ToLower(w.Name)] = target
		}
	}
	mapping := map[string]string{}
	var unplaced []string
	for _, ew := range parsed.Workspaces {
		if ew.Default {
			mapping[ew.ID] = ""
			continue
		}
		if t, ok := byID[ew.ID]; ok {
			mapping[ew.ID] = t
			continue
		}
		if t, ok := byName[strings.ToLower(strings.TrimSpace(ew.Name))]; ok {
			mapping[ew.ID] = t
			continue
		}
		if !create {
			mapping[ew.ID] = ew.ID
			parsed.Notes = append(parsed.Notes, fmt.Sprintf("The workspace %q will be created.", ew.Name))
			continue
		}
		name, icon, color := ew.Name, ew.Icon, ew.Color
		w, err := s.sync.CreateWorkspace(ctx, uid, opsync.WorkspaceInput{Name: &name, Icon: &icon, Color: &color})
		if errors.Is(err, opsync.ErrLimitReached) || errors.Is(err, opsync.ErrInvalidInput) {
			mapping[ew.ID] = ""
			unplaced = append(unplaced, ew.Name)
			continue
		}
		if err != nil {
			return err
		}
		mapping[ew.ID] = w.ID
		byName[strings.ToLower(name)] = w.ID
	}
	if len(unplaced) > 0 {
		parsed.Notes = append(parsed.Notes, fmt.Sprintf("%s could not be created (workspace limit); their projects, labels, views and tasks are in your default workspace.", strings.Join(unplaced, ", ")))
	}
	for i := range parsed.Rows {
		e := parsed.Rows[i].Entity
		raw, has := e["workspace_id"]
		if !has {
			continue
		}
		var id string
		if json.Unmarshal(raw, &id) != nil || id == "" {
			continue
		}
		target, known := mapping[id]
		if !known {
			target = "" // a workspace the file does not describe
		}
		if target == "" {
			e["workspace_id"] = json.RawMessage("null")
		} else {
			e["workspace_id"], _ = json.Marshal(target)
		}
	}
	return nil
}
