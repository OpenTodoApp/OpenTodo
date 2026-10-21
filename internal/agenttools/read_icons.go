package agenttools

import (
	"context"
	"fmt"

	"github.com/pixari/opentodo/internal/iconset"
)

// ---- list_icons (OpenSpec change mcp-projects, design D1, D2) ----
//
// The icon catalogue of projects and sections, searched exactly as the app's
// picker searches (iconset.Search). It reads no user data: every token that can
// list tools gets it, so an assistant finds a valid name instead of guessing one.

const iconLimit = 50

func init() {
	register(tool{
		def: readDef("list_icons", "List icons",
			"List the icons a project or section can have, best matches first. query searches names, keywords and categories (e.g. \"plant\", \"money\", \"travel\"); without it the whole catalogue is returned in pages of limit. Pass a name to update_project, create_sections or update_sections.",
			object(nil, map[string]any{
				"query": map[string]any{"type": "string", "maxLength": 100, "description": "Words to search for, optional."},
				"limit": map[string]any{"type": "integer", "minimum": 1, "maximum": MaxItems, "description": fmt.Sprintf("Maximum number of icons to return (default %d, at most %d).", iconLimit, MaxItems)},
			})),
		read: (*Registry).listIcons,
	})
}

type iconOut struct {
	Name     string   `json:"name"`
	Category string   `json:"category"`
	Keywords []string `json:"keywords"`
}

func (r *Registry) listIcons(_ context.Context, _ string, a args) (map[string]any, error) {
	if err := a.only("", "query", "limit"); err != nil {
		return nil, err
	}
	q, _, err := a.text("query", false, 100)
	if err != nil {
		return nil, err
	}
	n, has, err := a.integer("limit")
	if err != nil {
		return nil, err
	}
	switch {
	case !has:
		n = iconLimit
	case n < 1 || n > MaxItems:
		return nil, argErr(fmt.Sprintf("limit: must be between 1 and %d", MaxItems))
	}
	hits := iconset.Search(q)
	out := make([]iconOut, 0, min(n, len(hits)))
	for _, e := range hits[:min(n, len(hits))] {
		kw := e.Keywords
		if kw == nil {
			kw = []string{}
		}
		out = append(out, iconOut{Name: e.Name, Category: e.Category, Keywords: kw})
	}
	return map[string]any{"icons": out, "total": len(hits), "truncated": len(hits) > n}, nil
}
