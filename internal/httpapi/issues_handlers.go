package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/issues"
)

// The issue connection routes (issue-import D10); registration and checks in issues.go.

const encryptedIssuesMessage = "this account uses end-to-end encryption: the server would write issue titles and bodies into the account's history in plaintext on every poll, so issue connections are not available"

func (s *Server) handleCreateIssueConnection(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in issueConnInput
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", `body must be {"provider", "host", "token", "name"?, "project_id"?, "filter"?, "map_labels"?, "interval_minutes"?, "enabled"?}`)
		return
	}
	if s.refuseIfEncrypted(w, r, encryptedIssuesMessage) {
		return
	}
	if in.Provider == nil || !issues.ValidProvider(*in.Provider) {
		writeFieldError(w, "provider", `provider must be "github" or "gitlab"`)
		return
	}
	raw := ""
	if in.Host != nil {
		raw = *in.Host
	}
	host, ok := s.checkIssueHost(w, ctx, raw)
	if !ok {
		return
	}
	token, ok := checkIssueToken(w, in.Token)
	if !ok {
		return
	}
	name, ok := checkIssueName(w, in.Name)
	if !ok {
		return
	}
	if name == "" {
		name = issues.DefaultName(host)
	}
	project, ok := s.checkIssueProject(w, ctx, uid, in.ProjectID)
	if !ok {
		return
	}
	filter, ok := checkIssueFilter(w, in.Filter)
	if !ok {
		return
	}
	interval := issues.DefaultIntervalMins
	if in.IntervalMinutes != nil {
		interval = *in.IntervalMinutes
	}
	var fe *issues.FieldError
	if err := issues.CheckInterval(interval); errors.As(err, &fe) {
		writeFieldError(w, fe.Field, fe.Msg)
		return
	}
	input := issues.Input{Provider: *in.Provider, Host: host, Name: name, ProjectID: &project, Filter: filter, IntervalMinutes: interval, Enabled: true}
	if in.MapLabels != nil {
		input.MapLabels = *in.MapLabels
	}
	if in.Enabled != nil {
		input.Enabled = *in.Enabled
	}
	c, err := s.issueWorker.Store.Create(ctx, uid, input)
	if errors.Is(err, issues.ErrLimit) {
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("you can have at most %d issue connections", issues.MaxConnections))
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.issueWorker.Tokens.Set(c.ID, token); err != nil {
		_ = s.issueWorker.Store.Delete(ctx, uid, c.ID)
		s.internal(w, err)
		return
	}
	s.audit.Record(ctx, audit.IssueConnectionCreated(uid, c.ID, c.Provider))
	writeJSON(w, http.StatusCreated, map[string]any{"connection": s.checkNow(ctx, uid, c)})
}

// checkNow attempts the account check of a new or re-keyed connection (within
// the user's hand-triggered limit) and returns the connection as stored after it.
func (s *Server) checkNow(ctx context.Context, uid string, c *issues.Connection) *issues.Connection {
	if s.issueLimiter.allow(uid) {
		if _, err := s.issueWorker.Check(ctx, c); err != nil && !isPollError(err) {
			s.log.Error("issue connections: check", "err", err)
		}
	}
	if fresh, err := s.issueConnection(ctx, uid, c.ID); err == nil {
		return fresh
	}
	return c
}

func isPollError(err error) bool {
	var pe *issues.PollError
	return errors.As(err, &pe)
}

// issuePatch validates a PATCH body into a store patch and the names of the
// settings it changes; ok is false once an error was answered.
func (s *Server) issuePatch(w http.ResponseWriter, r *http.Request, cur *issues.Connection, in issueConnInput) (issues.Patch, []string, bool) {
	ctx := r.Context()
	var p issues.Patch
	var changed []string
	if in.Provider != nil && *in.Provider != cur.Provider {
		writeFieldError(w, "provider", "the provider of a connection cannot change; add a new connection instead")
		return p, nil, false
	}
	if in.Host != nil {
		host, ok := s.checkIssueHost(w, ctx, *in.Host)
		if !ok {
			return p, nil, false
		}
		if host != cur.Host {
			p.Host = &host
			changed = append(changed, "host")
		}
	}
	if in.Name != nil {
		name, ok := checkIssueName(w, in.Name)
		if !ok {
			return p, nil, false
		}
		if name == "" {
			name = issues.DefaultName(cur.Host)
		}
		if name != cur.Name {
			p.Name = &name
			changed = append(changed, "name")
		}
	}
	if len(in.ProjectID) > 0 {
		project, ok := s.checkIssueProject(w, ctx, cur.UserID, in.ProjectID)
		if !ok {
			return p, nil, false
		}
		if was := deref(cur.ProjectID); project != was {
			p.ProjectID = &project
			changed = append(changed, "project")
		}
	}
	if in.Filter != nil {
		f, ok := checkIssueFilter(w, in.Filter)
		if !ok {
			return p, nil, false
		}
		if fmt.Sprint(f) != fmt.Sprint(cur.Filter) {
			p.Filter = &f
			changed = append(changed, "filter")
		}
	}
	if in.MapLabels != nil && *in.MapLabels != cur.MapLabels {
		p.MapLabels = in.MapLabels
		changed = append(changed, "labels")
	}
	if in.IntervalMinutes != nil {
		var fe *issues.FieldError
		if err := issues.CheckInterval(*in.IntervalMinutes); errors.As(err, &fe) {
			writeFieldError(w, fe.Field, fe.Msg)
			return p, nil, false
		}
		if *in.IntervalMinutes != cur.IntervalMinutes {
			p.IntervalMinutes = in.IntervalMinutes
			changed = append(changed, "interval")
		}
	}
	if in.Enabled != nil && (*in.Enabled != cur.Enabled || (*in.Enabled && cur.StoppedReason != "")) {
		p.Enabled = in.Enabled
		changed = append(changed, "enabled")
	}
	return p, changed, true
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *Server) handlePatchIssueConnection(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in issueConnInput
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "body must be a JSON object")
		return
	}
	// Replacing the token needs a recent sign-in, like creating an API token.
	if in.Token != nil {
		if sess := sessionFrom(ctx); sess != nil && !sess.FreshWithin(FreshWindow, s.auth.Now()) {
			writeError(w, http.StatusForbidden, "reauth_required", "confirm your password or a code to continue")
			return
		}
	}
	cur, err := s.issueWorker.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, issues.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "issue connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if in.Enabled != nil && *in.Enabled && s.refuseIfEncrypted(w, r, encryptedIssuesMessage) {
		return
	}
	p, changed, ok := s.issuePatch(w, r, cur, in)
	if !ok {
		return
	}
	var token string
	if in.Token != nil {
		if token, ok = checkIssueToken(w, in.Token); !ok {
			return
		}
		p.TokenReplaced = true
		changed = append(changed, "token")
	}
	if token != "" {
		if err := s.issueWorker.Tokens.Set(cur.ID, token); err != nil {
			s.internal(w, err)
			return
		}
	}
	c, err := s.issueWorker.Store.Update(ctx, uid, cur.ID, p)
	if err != nil {
		s.internal(w, err)
		return
	}
	if len(changed) > 0 {
		s.audit.Record(ctx, audit.IssueConnectionUpdated(uid, c.ID, c.Provider, strings.Join(changed, ",")))
	}
	if p.TokenReplaced || p.Host != nil {
		c = s.checkNow(ctx, uid, c)
	} else if fresh, err := s.issueConnection(ctx, uid, c.ID); err == nil {
		c = fresh
	}
	writeJSON(w, http.StatusOK, map[string]any{"connection": c})
}

func (s *Server) handleDeleteIssueConnection(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	cur, err := s.issueWorker.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, issues.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "issue connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.issueWorker.Store.Delete(ctx, uid, cur.ID); err != nil {
		s.internal(w, err)
		return
	}
	if err := s.issueWorker.Tokens.Delete(cur.ID); err != nil {
		s.log.Error("issue connections: remove token", "err", err) // the hourly sweep retries
	}
	s.audit.Record(ctx, audit.IssueConnectionDeleted(uid, cur.ID, cur.Provider))
	w.WriteHeader(http.StatusNoContent)
}

// handTriggered loads the user's connection for test or sync, refusing a
// connection that cannot be polled before the shared hourly limit is spent.
func (s *Server) handTriggered(w http.ResponseWriter, r *http.Request, sync bool) (*issues.Connection, bool) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	c, err := s.issueWorker.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, issues.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "issue connection not found")
		return nil, false
	}
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	if sync {
		now := s.auth.Now()
		switch {
		case c.StoppedReason != "":
			writeError(w, http.StatusConflict, "connection_stopped", "this connection is stopped ("+c.StoppedReason+"); replace the token, edit the host or enable it again")
			return nil, false
		case !c.Enabled:
			writeError(w, http.StatusConflict, "connection_disabled", "this connection is disabled; enable it first")
			return nil, false
		case c.LastError == issues.ReasonRateLimited && c.NextPollAt > now.UnixMilli():
			writeError(w, http.StatusConflict, "provider_rate_limited", "the provider's rate limit was reached; polling resumes at "+time.UnixMilli(c.NextPollAt).UTC().Format(time.RFC3339))
			return nil, false
		}
	}
	if !s.issueLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", fmt.Sprintf("at most %d token checks and syncs per hour; try again later", issueChecksPerHr))
		return nil, false
	}
	return c, true
}

func (s *Server) handleTestIssueConnection(w http.ResponseWriter, r *http.Request) {
	c, ok := s.handTriggered(w, r, false)
	if !ok {
		return
	}
	ctx := r.Context()
	acc, err := s.issueWorker.Check(ctx, c)
	out := map[string]any{"ok": err == nil, "login": acc.Login, "can_read_issues": acc.CanReadIssues}
	var pe *issues.PollError
	switch {
	case errors.As(err, &pe):
		out["reason"] = pe.Reason
	case err != nil:
		s.internal(w, err)
		return
	}
	if fresh, err := s.issueConnection(ctx, c.UserID, c.ID); err == nil {
		out["connection"] = fresh
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSyncIssueConnection(w http.ResponseWriter, r *http.Request) {
	c, ok := s.handTriggered(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	counts, err := s.issueWorker.Poll(ctx, c)
	out := map[string]any{"ok": err == nil, "run": counts}
	var pe *issues.PollError
	switch {
	case errors.As(err, &pe):
		out["reason"] = pe.Reason
	case err != nil:
		s.internal(w, err)
		return
	}
	if fresh, err := s.issueConnection(ctx, c.UserID, c.ID); err == nil {
		out["connection"] = fresh
	}
	writeJSON(w, http.StatusOK, out)
}

// stopIssueConnections stops the account's connections when encryption is
// turned on (spec "Encrypted accounts") and returns their names.
func (s *Server) stopIssueConnections(ctx context.Context, uid string) ([]string, error) {
	if s.issueWorker == nil {
		return nil, nil
	}
	return s.issueWorker.Store.StopUser(ctx, uid, issues.ReasonEncrypted)
}
