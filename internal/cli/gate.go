package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"
)

// writeGate is what stands between a command and a request that writes
// (OpenSpec change `agent-ready-cli`, design D4 and D7): read-only mode, the
// token's scope (learned from GET /api/v1/me at most once per run) and the
// dry-run plan. One gate is shared by every client of a run.
type writeGate struct {
	readOnly bool
	dry      *dryPlan

	scopeKnown bool
	cred       credential
}

// beforeWrite runs for every request that is not a GET. It refuses (read-only,
// scope), or in a dry run records the request and returns a stand-in response
// so the command can go on planning; nil, nil lets the request through.
func (g *writeGate) beforeWrite(ctx context.Context, c *client, method, path string, body any, headers map[string]string) ([]byte, error) {
	if g.readOnly {
		return nil, &exitError{code: ExitNotPermitted, jsonCode: "read_only", msg: "read-only mode is on (--read-only or OPENTODO_READ_ONLY); nothing was sent"}
	}
	if c.token != "" {
		if err := g.checkScope(ctx, c, method, path, body); err != nil {
			return nil, err
		}
	}
	if g.dry != nil {
		return g.dry.add(method, path, body, headers), nil
	}
	return nil, nil
}

// checkScope refuses locally what the server would refuse for this token:
// every write for a read token, and for an agent token every write outside the
// agent content routes (design D8). The server enforces the same rules again.
func (g *writeGate) checkScope(ctx context.Context, c *client, method, path string, body any) error {
	if !g.scopeKnown {
		_, cred, err := c.meAuth(ctx)
		if err != nil {
			return err
		}
		g.cred, g.scopeKnown = cred, true
	}
	switch g.cred.Scope {
	case "read":
		return &exitError{code: ExitNotPermitted, jsonCode: "insufficient_scope", msg: "this API token is read-only (scope read); nothing was sent"}
	case "agent":
		if !agentRouteAllowed(method, path, body) {
			return &exitError{code: ExitNotPermitted, jsonCode: "insufficient_scope",
				msg: fmt.Sprintf("an agent token cannot %s %s: it may only create and edit tasks, projects, labels and comments; nothing was sent", method, "/api/v1"+path)}
		}
	}
	return nil
}

// validIdempotencyKey is the server's Idempotency-Key syntax, checked locally
// (1 to 128 characters of [A-Za-z0-9._:-]; no regexp, to keep ot small).
func validIdempotencyKey(k string) bool {
	if len(k) == 0 || len(k) > 128 {
		return false
	}
	for _, c := range k {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '.', c == '_', c == ':', c == '-':
		default:
			return false
		}
	}
	return true
}

// agentTaskFields are the task fields an agent token may PATCH.
var agentTaskFields = map[string]bool{"title": true, "description": true, "priority": true, "labels": true, "estimate_minutes": true,
	"recurrence": true, "due": true, "project_id": true, "section_id": true, "completed_at": true, "deleted_at": true, "origin": true,
	"deadline": true, "start": true, "evening": true, "blocked_by": true, "location": true}

// agentRouteAllowed mirrors the server's agent content routes.
func agentRouteAllowed(method, path string, body any) bool {
	path, _, _ = strings.Cut(path, "?")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	switch {
	case method == http.MethodPost && len(parts) == 1:
		return parts[0] == "tasks" || parts[0] == "projects" || parts[0] == "labels"
	case method == http.MethodPost && len(parts) == 3:
		return parts[0] == "tasks" && parts[2] == "comments"
	case method == http.MethodDelete && len(parts) == 2:
		return parts[0] == "tasks"
	case method == http.MethodPatch && len(parts) == 2:
		fields := bodyFields(body)
		allowed := map[string]bool{"name": true, "color": true}
		switch parts[0] {
		case "tasks":
			allowed = agentTaskFields
		case "projects":
		default:
			return false
		}
		for f, v := range fields {
			if !allowed[f] || (f == "deleted_at" && string(v) == "null") {
				return false
			}
		}
		return true
	}
	return false
}

func bodyFields(body any) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	raw, err := json.Marshal(body)
	if err == nil {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// ---- dry run ----

// dryPlan collects the writes a command would send and the targets it resolved.
type dryPlan struct {
	command  string
	requests []plannedRequest
	targets  []dryTarget
	local    []string
	// preview is the server's import preview (`ot import --dry-run`).
	preview json.RawMessage
}

type plannedRequest struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Body    any               `json:"body,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

type dryTarget struct {
	Ref          string `json:"ref"`
	ID           string `json:"id"`
	TitlePreview string `json:"title_preview"`
	Status       string `json:"status,omitempty"`
}

// add records a request and returns the stand-in response: a created entity
// gets a placeholder id so later planned requests can refer to it.
func (p *dryPlan) add(method, path string, body any, headers map[string]string) []byte {
	p.requests = append(p.requests, plannedRequest{Method: method, Path: "/api/v1" + path, Body: body, Headers: headers})
	if method == http.MethodPost {
		return []byte(fmt.Sprintf(`{"id":"(planned-%d)"}`, len(p.requests)))
	}
	return []byte(`{}`)
}

// target records a resolved reference (only during a dry run).
func (a *App) target(ref, id, title, status string) {
	if a.gate == nil || a.gate.dry == nil {
		return
	}
	a.gate.dry.targets = append(a.gate.dry.targets, dryTarget{Ref: ref, ID: id, TitlePreview: preview(title), Status: status})
}

// localChange records a change a dry run would make to the config file.
func (a *App) localChange(desc string) {
	if a.gate != nil && a.gate.dry != nil {
		a.gate.dry.local = append(a.gate.dry.local, desc)
	}
}

func (a *App) dryRun() bool { return a.gate != nil && a.gate.dry != nil }

func preview(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= 80 {
		return s
	}
	r := []rune(s)
	return string(r[:79]) + "…"
}

func (a *App) printPlan(g *globalFlags) error {
	p := a.gate.dry
	reqs := p.requests
	if reqs == nil {
		reqs = []plannedRequest{}
	}
	targets := p.targets
	if targets == nil {
		targets = []dryTarget{}
	}
	if g.json {
		out := map[string]any{"dry_run": true, "command": p.command, "requests": reqs, "targets": targets}
		if len(p.local) > 0 {
			out["local"] = p.local
		}
		if p.preview != nil {
			out["preview"] = p.preview
		}
		return a.printJSON(out)
	}
	w := a.Stdout
	fmt.Fprintf(w, "Dry run of `ot %s`: nothing was changed.\n", p.command)
	if len(targets) > 0 {
		fmt.Fprintln(w, "Targets:")
		for _, t := range targets {
			status := ""
			if t.Status != "" {
				status = "  (" + t.Status + ")"
			}
			fmt.Fprintf(w, "  %s  %s%s\n", shortID(t.ID), t.TitlePreview, status)
		}
	}
	if len(reqs) == 0 {
		fmt.Fprintln(w, "No request would be sent.")
	} else {
		fmt.Fprintln(w, "Would send:")
		for _, r := range reqs {
			line := r.Method + " " + r.Path
			if r.Body != nil {
				b, _ := json.Marshal(r.Body)
				line += " " + string(b)
			}
			fmt.Fprintln(w, "  "+line)
		}
	}
	for _, l := range p.local {
		fmt.Fprintln(w, "Would "+l+".")
	}
	if p.preview != nil {
		printPreview(w, p.preview)
	}
	return nil
}
