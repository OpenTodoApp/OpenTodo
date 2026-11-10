// Package syncscope is the part of an account a calendar sync connection or a
// CalDAV app password covers (OpenSpec change sync-scope): everything, only
// the chosen workspaces and projects, or everything except them. A scope is
// server configuration of the connection or the app password, never an op.
package syncscope

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
)

// Modes.
const (
	All    = "all"
	Only   = "only"
	Except = "except"
)

// Limits on a stored scope.
const (
	MaxItems = 200
	MaxIDLen = 64
)

// Scope is a chosen part of the account. Workspaces covers a workspace's
// projects and its Inbox; Projects covers a project and its sub-projects;
// Inboxes covers the tasks without a project of a workspace (by workspace id).
type Scope struct {
	Mode       string   `json:"mode"`
	Workspaces []string `json:"workspaces"`
	Projects   []string `json:"projects"`
	Inboxes    []string `json:"inboxes"`
}

// ErrInvalid is a scope that cannot be stored.
var ErrInvalid = errors.New("invalid scope")

// Everything is the scope of a connection or an app password that has none.
func Everything() Scope {
	return Scope{Mode: All, Workspaces: []string{}, Projects: []string{}, Inboxes: []string{}}
}

// IsAll reports whether the scope covers the whole account.
func (s Scope) IsAll() bool { return s.Mode != Only && s.Mode != Except }

// Normalize checks a scope from a request: a known mode, ids of at most
// MaxIDLen characters, at most MaxItems in all; duplicates are dropped. A
// scope with nothing chosen, or of mode all, is Everything.
func Normalize(s Scope) (Scope, error) {
	if s.Mode != All && s.Mode != Only && s.Mode != Except {
		return Scope{}, ErrInvalid
	}
	out := Everything()
	n := 0
	for _, list := range []struct {
		in  []string
		out *[]string
	}{{s.Workspaces, &out.Workspaces}, {s.Projects, &out.Projects}, {s.Inboxes, &out.Inboxes}} {
		for _, id := range list.in {
			id = strings.TrimSpace(id)
			if id == "" || len(id) > MaxIDLen {
				return Scope{}, ErrInvalid
			}
			if !slices.Contains(*list.out, id) {
				*list.out = append(*list.out, id)
				n++
			}
		}
	}
	if n > MaxItems {
		return Scope{}, ErrInvalid
	}
	if s.Mode == All || n == 0 {
		return Everything(), nil
	}
	out.Mode = s.Mode
	return out, nil
}

// Parse reads a stored scope; an empty or unreadable value is Everything, so
// rows from before scopes cover the whole account as they did.
func Parse(raw string) Scope {
	if raw == "" {
		return Everything()
	}
	var s Scope
	if json.Unmarshal([]byte(raw), &s) != nil {
		return Everything()
	}
	n, err := Normalize(s)
	if err != nil {
		return Everything()
	}
	return n
}

// Text is the stored form: "" for Everything.
func (s Scope) Text() string {
	if s.IsAll() {
		return ""
	}
	b, _ := json.Marshal(s)
	return string(b)
}

// Place is where a task or a calendar is: its workspace, and for a project
// the project followed by its ancestors (none for an Inbox).
type Place struct {
	Workspace string
	Projects  []string
}

// Includes reports whether the scope covers a place.
func (s Scope) Includes(p Place) bool {
	if s.IsAll() {
		return true
	}
	hit := slices.Contains(s.Workspaces, p.Workspace)
	if !hit && len(p.Projects) == 0 {
		hit = slices.Contains(s.Inboxes, p.Workspace)
	}
	for _, id := range p.Projects {
		if hit {
			break
		}
		hit = slices.Contains(s.Projects, id)
	}
	if s.Mode == Except {
		return !hit
	}
	return hit
}
