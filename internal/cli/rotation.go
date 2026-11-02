package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Rotating assignees (OpenSpec change chore-rotation, design D6): `ot edit
// --rotate alice,bob` and `--no-rotate`, people resolved among the task
// project's members by name or email.

// projectMember is one entry of GET /projects/{id}/members.
type projectMember struct {
	UserID string `json:"userId"`
	Name   string `json:"name"`
	Email  string `json:"email"`
}

func (c *client) projectMembers(ctx context.Context, projectID string) ([]projectMember, error) {
	var out struct {
		Members []projectMember `json:"members"`
	}
	if err := c.getJSON(ctx, "/projects/"+projectID+"/members", &out); err != nil {
		return nil, err
	}
	return out.Members, nil
}

// label is how a member is named in output: the name, else the email.
func (m projectMember) label() string {
	if m.Name != "" {
		return m.Name
	}
	return m.Email
}

// findMember resolves one reference: an exact email or name (ignoring case),
// else a unique name or email prefix.
func findMember(members []projectMember, ref string) (projectMember, error) {
	r := strings.ToLower(strings.TrimSpace(ref))
	var exact, prefix []projectMember
	for _, m := range members {
		name, email := strings.ToLower(m.Name), strings.ToLower(m.Email)
		switch {
		case r == email || r == name || r == m.UserID:
			exact = append(exact, m)
		case strings.HasPrefix(name, r) || strings.HasPrefix(email, r):
			prefix = append(prefix, m)
		}
	}
	if len(exact) == 1 {
		return exact[0], nil
	}
	if len(exact) == 0 && len(prefix) == 1 {
		return prefix[0], nil
	}
	if len(exact)+len(prefix) > 1 {
		return projectMember{}, usageErr("--rotate: %q matches several members; use their email", ref)
	}
	names := make([]string, 0, len(members))
	for _, m := range members {
		names = append(names, m.label())
	}
	return projectMember{}, usageErr("--rotate: nobody called %q is a member of the task's project. Members: %s", ref, strings.Join(names, ", "))
}

// fillRotation puts --rotate's people or --no-rotate's empty list into patch.
func (a *App) fillRotation(ctx context.Context, c *client, t *task, set map[string]bool, refs string, patch map[string]any) error {
	if set["no-rotate"] {
		patch["rotation"] = []string{}
	}
	if !set["rotate"] {
		return nil
	}
	ids, err := a.rotationIDs(ctx, c, t, refs)
	if err == nil {
		patch["rotation"] = ids
	}
	return err
}

// rotationIDs resolves --rotate's comma-separated people in order.
func (a *App) rotationIDs(ctx context.Context, c *client, t *task, refs string) ([]string, error) {
	if t.ProjectID == nil || *t.ProjectID == "" {
		return nil, usageErr("--rotate: only a task in a shared project takes turns")
	}
	members, err := c.projectMembers(ctx, *t.ProjectID)
	if err != nil {
		return nil, err
	}
	var out []string
	seen := map[string]bool{}
	for _, ref := range strings.Split(refs, ",") {
		if strings.TrimSpace(ref) == "" {
			continue
		}
		m, err := findMember(members, ref)
		if err != nil {
			return nil, err
		}
		if seen[m.UserID] {
			return nil, usageErr("--rotate names %s twice", m.label())
		}
		seen[m.UserID] = true
		out = append(out, m.UserID)
	}
	if len(out) == 0 {
		return nil, usageErr("--rotate needs at least one person; --no-rotate stops taking turns")
	}
	return out, nil
}

// printTurns prints "Takes turns: Alice* → Bob" for a recurring task with a
// rotation (see turnsLine); nothing when the members cannot be read.
func (a *App) printTurns(ctx context.Context, c *client, w io.Writer, raw json.RawMessage) {
	var t struct {
		ProjectID  *string  `json:"project_id"`
		AssigneeID *string  `json:"assignee_id"`
		Recurrence *string  `json:"recurrence"`
		Rotation   []string `json:"rotation"`
	}
	if json.Unmarshal(raw, &t) != nil || len(t.Rotation) == 0 || t.ProjectID == nil || t.Recurrence == nil {
		return
	}
	members, err := c.projectMembers(ctx, *t.ProjectID)
	if err != nil {
		return
	}
	fmt.Fprintln(w, turnsLine(t.Rotation, t.AssigneeID, members))
}

// turnsLine names the rotation in order, the current assignee marked with
// an asterisk and a departed person as "(left the project)".
func turnsLine(rotation []string, assignee *string, members []projectMember) string {
	byID := map[string]projectMember{}
	for _, m := range members {
		byID[m.UserID] = m
	}
	parts := make([]string, 0, len(rotation))
	for _, id := range rotation {
		name := "(left the project)"
		if m, ok := byID[id]; ok {
			name = m.label()
		}
		if assignee != nil && *assignee == id {
			name += "*"
		}
		parts = append(parts, name)
	}
	return "Takes turns: " + strings.Join(parts, " → ")
}
