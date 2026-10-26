package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/issues"
	ob "github.com/pixari/opentodo/internal/outbound"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Issue import (OpenSpec change issue-import): per-user connections to GitHub
// or GitLab whose open issues become tasks. One owner switch, off by default,
// governs every route and the poller (design D10).

const issuesSettingKey = "integrations.issues"

// Hand-triggered token checks and syncs share one window per user (spec
// "Token check", "Sync now").
const (
	issueChecksPerHr = 12
	maxIssueToken    = 4096
)

// WithIssues hands the server the worker that polls connections, so the
// routes and the background job share one store, tokens file and policy.
func WithIssues(w *issues.Worker) Option { return func(s *Server) { s.issueWorker = w } }

// IssueWorker is the background poller, run by the jobs leader.
func (s *Server) IssueWorker() *issues.Worker { return s.issueWorker }

func (s *Server) allowPrivate() func(context.Context) bool {
	if s.hooks != nil {
		return s.hooks.AllowPrivate
	}
	return func(context.Context) bool { return false }
}

func (s *Server) registerIssueRoutes(mux *routes) {
	if s.issueWorker == nil {
		s.issueWorker = issues.NewWorker(s.sync.DB(), s.cfg.DataDir, s.sync, s.allowPrivate(), s.version, s.log)
	}
	s.issueWorker.Enabled = s.issuesOn.On
	s.issueLimiter = newRateLimiter(issueChecksPerHr, time.Hour)

	s.switchRoutes(mux, "/api/v1/settings/issues", switchRoute{sw: s.issuesOn,
		get: signedIn.demoDenied(), put: ownerOnly("manage the issue connections setting").demoDenied()})
	mux.handle("GET /api/v1/issues/connections", signedIn.demoDenied(), s.issuesGate(s.handleListIssueConnections))
	mux.handle("POST /api/v1/issues/connections", signedIn.recent().demoDenied(), s.issuesGate(s.handleCreateIssueConnection))
	// One route, one policy: the handler asks for a fresh session when the body carries a token.
	mux.handle("PATCH /api/v1/issues/connections/{id}", signedIn.demoDenied(), s.issuesGate(s.handlePatchIssueConnection))
	mux.handle("DELETE /api/v1/issues/connections/{id}", signedIn.demoDenied(), s.issuesGate(s.handleDeleteIssueConnection))
	mux.handle("POST /api/v1/issues/connections/{id}/test", signedIn.demoDenied(), s.issuesGate(s.handleTestIssueConnection))
	mux.handle("POST /api/v1/issues/connections/{id}/sync", signedIn.demoDenied(), s.issuesGate(s.handleSyncIssueConnection))
}

// issuesGate answers 404 issues_disabled while the owner switch is off.
func (s *Server) issuesGate(next http.HandlerFunc) http.HandlerFunc {
	return switchGate(s.issuesOn, "issues_disabled", "the server owner has not enabled issue connections")(next)
}

// withTokenSet fills token_set from the tokens file.
func (s *Server) withTokenSet(list []issues.Connection) ([]issues.Connection, error) {
	ids := make([]string, len(list))
	for i := range list {
		ids[i] = list[i].ID
	}
	has, err := s.issueWorker.Tokens.Has(ids...)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].TokenSet = has[list[i].ID]
	}
	return list, nil
}

// issueConnections is the user's connections as every reader serves them
// (route, CLI, MCP resource): stored state only, never a token.
func (s *Server) issueConnections(ctx context.Context, uid string) ([]issues.Connection, error) {
	list, err := s.issueWorker.Store.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	return s.withTokenSet(list)
}

func (s *Server) issueConnection(ctx context.Context, uid, id string) (*issues.Connection, error) {
	c, err := s.issueWorker.Store.Get(ctx, uid, id)
	if err != nil {
		return nil, err
	}
	list, err := s.withTokenSet([]issues.Connection{*c})
	if err != nil {
		return nil, err
	}
	return &list[0], nil
}

// issuesResource is the MCP resource opentodo://integrations/issues.
func (s *Server) issuesResource(ctx context.Context, uid string) (any, error) {
	if !s.issuesOn.On(ctx) {
		return map[string]any{"enabled": false, "connections": []any{}}, nil
	}
	list, err := s.issueConnections(ctx, uid)
	if err != nil {
		return nil, err
	}
	return map[string]any{"enabled": true, "connections": list}, nil
}

func (s *Server) handleListIssueConnections(w http.ResponseWriter, r *http.Request) {
	list, err := s.issueConnections(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": list})
}

// issueConnInput is the body of POST and PATCH. project_id is raw so PATCH can
// tell "absent" from null (the Inbox).
type issueConnInput struct {
	Provider        *string         `json:"provider"`
	Host            *string         `json:"host"`
	Token           *string         `json:"token"`
	Name            *string         `json:"name"`
	ProjectID       json.RawMessage `json:"project_id"`
	Filter          *issues.Filter  `json:"filter"`
	MapLabels       *bool           `json:"map_labels"`
	IntervalMinutes *int            `json:"interval_minutes"`
	Enabled         *bool           `json:"enabled"`
}

// checkIssueHost normalises a host and applies the outbound policy: http only
// while the owner allows private targets, no private address unless allowed.
func (s *Server) checkIssueHost(w http.ResponseWriter, ctx context.Context, raw string) (string, bool) {
	host, err := issues.NormalizeHost(raw)
	var fe *issues.FieldError
	if errors.As(err, &fe) {
		writeFieldError(w, fe.Field, fe.Msg)
		return "", false
	}
	allow := s.allowPrivate()
	if strings.HasPrefix(host, "http://") && !allow(ctx) {
		writeFieldError(w, "host", "the address must use https; http is accepted only for a local server the owner allowed in Settings → Integrations → Webhooks")
		return "", false
	}
	u, _ := url.Parse(host)
	d := &ob.Dialer{Resolver: s.issueWorker.Dialer.Resolver, AllowPrivate: allow}
	if _, err := d.Allowed(ctx, u.Hostname()); errors.Is(err, ob.ErrPrivateTarget) {
		writeError(w, http.StatusBadRequest, "private_target", "this address is on a private network; the server owner can allow private targets in Settings → Integrations → Webhooks")
		return "", false
	}
	return host, true
}

// checkIssueProject accepts a live, unarchived project the user can write to.
func (s *Server) checkIssueProject(w http.ResponseWriter, ctx context.Context, uid string, raw json.RawMessage) (string, bool) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return "", true
	}
	var id string
	if json.Unmarshal(raw, &id) != nil {
		writeFieldError(w, "project_id", "must be a project id or null for the Inbox")
		return "", false
	}
	if id == "" {
		return "", true
	}
	live, _, role, err := s.sync.ProjectStatus(ctx, uid, id)
	if err != nil {
		s.internal(w, err)
		return "", false
	}
	p, err := s.sync.Get(ctx, uid, "project", id)
	if err != nil {
		s.internal(w, err)
		return "", false
	}
	if !live || p == nil || string(p["archived"]) == "true" || (role != opsync.RoleOwner && role != opsync.RoleAdmin && role != opsync.RoleEditor) {
		writeFieldError(w, "project_id", "choose an active project you can add tasks to, or the Inbox")
		return "", false
	}
	return id, true
}

func checkIssueName(w http.ResponseWriter, p *string) (string, bool) {
	if p == nil {
		return "", true
	}
	v := strings.TrimSpace(*p)
	if utf8.RuneCountInString(v) > issues.MaxName {
		writeFieldError(w, "name", fmt.Sprintf("a name is at most %d characters", issues.MaxName))
		return "", false
	}
	return v, true
}

func checkIssueToken(w http.ResponseWriter, p *string) (string, bool) {
	v := ""
	if p != nil {
		v = strings.TrimSpace(*p)
	}
	if v == "" || len(v) > maxIssueToken || strings.ContainsAny(v, " \r\n\t") {
		writeFieldError(w, "token", "paste the personal access token from your GitHub or GitLab settings")
		return "", false
	}
	return v, true
}

func checkIssueFilter(w http.ResponseWriter, f *issues.Filter) (issues.Filter, bool) {
	var in issues.Filter
	if f != nil {
		in = *f
	}
	n := in.Normalize()
	var fe *issues.FieldError
	if err := n.Validate(); errors.As(err, &fe) {
		writeFieldError(w, fe.Field, fe.Msg)
		return n, false
	}
	return n, true
}
