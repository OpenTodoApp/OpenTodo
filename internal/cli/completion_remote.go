package cli

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
)

// completionTimeout bounds every network read of a Tab press (design D3).
const completionTimeout = 2 * time.Second

// completionClient is a read-only client for the line's profile, nil when
// there is no server or token. Completion never caches what it reads.
func (a *App) completionClient(st *compState) *client {
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return nil
	}
	t := resolveTarget(&st.g, a.Getenv, cfg)
	if t.URL == "" || t.Token == "" {
		return nil
	}
	c := newClient(t.URL, t.Token)
	c.http = &http.Client{Timeout: completionTimeout, CheckRedirect: c.http.CheckRedirect}
	return c
}

// readable reports whether a name can be shown: not empty, not ciphertext and
// not the server's placeholder for an encrypted value.
func readable(s string) bool {
	s = strings.TrimSpace(s)
	return s != "" && !e2ee.IsCiphertext(s) && s != e2ee.Placeholder
}

// remoteCandidates reads one kind of value from the server. Any failure, slow
// server or missing sign-in gives no candidates.
func (a *App) remoteCandidates(ctx context.Context, st *compState, kind valueKind) []compItem {
	c := a.completionClient(st)
	if c == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, completionTimeout)
	defer cancel()
	var out []compItem
	switch kind {
	case kindProjects, kindAllProj:
		list, err := c.projects(ctx)
		if err != nil {
			return nil
		}
		for _, p := range list {
			if p.DeletedAt != nil || (p.Archived && kind != kindAllProj) || !readable(p.Name) {
				continue
			}
			desc := "project"
			if p.Archived {
				desc = "archived project"
			}
			out = append(out, compItem{p.Name, desc})
		}
	case kindLabels:
		list, err := c.labels(ctx)
		if err != nil {
			return nil
		}
		for _, l := range list {
			if readable(l.Name) {
				out = append(out, compItem{l.Name, "label"})
			}
		}
	case kindWorkspace:
		list, err := c.workspaces(ctx)
		if err != nil {
			return nil
		}
		for _, w := range list {
			if readable(w.Name) {
				out = append(out, compItem{w.Name, "workspace"})
			}
		}
	case kindTasks, kindDoneTasks:
		list, err := c.tasks(ctx)
		if err != nil {
			return nil
		}
		for _, t := range list {
			if t.DeletedAt != nil || (t.CompletedAt != nil) != (kind == kindDoneTasks) {
				continue
			}
			desc := ""
			if readable(t.Title) {
				desc = t.Title
			}
			out = append(out, compItem{t.ID, desc})
		}
	}
	return out
}
