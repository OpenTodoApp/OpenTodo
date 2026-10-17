package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// ---- handlers: audit log (OpenSpec change `audit-log`) ----
//
// The owner reads, filters and exports the log and manages its settings; every
// user reads their own access events. There are deliberately no routes that
// modify or delete an event: PATCH or DELETE on /api/v1/audit/{id} falls through
// to the generic collection routes, which answer 404 for the unknown collection.

// filterError names the query parameter that was rejected.
type filterError struct{ param, msg string }

func (e *filterError) Error() string { return e.param + ": " + e.msg }

// parseAuditFilter reads the list and export filters from the query string.
func parseAuditFilter(q url.Values, paged bool) (audit.Filter, error) {
	var f audit.Filter
	if v := q.Get("name"); v != "" {
		if !audit.Known(audit.Name(v)) {
			return f, &filterError{"name", "unknown event name"}
		}
		f.Name = audit.Name(v)
	}
	f.Actor = strings.TrimSpace(q.Get("actor"))
	f.Target = strings.TrimSpace(q.Get("target"))
	if v := q.Get("outcome"); v != "" {
		if v != audit.Success && v != audit.Failure {
			return f, &filterError{"outcome", "must be success or failure"}
		}
		f.Outcome = v
	}
	var err error
	if f.From, err = parseTime(q.Get("from")); err != nil {
		return f, &filterError{"from", err.Error()}
	}
	if f.To, err = parseTime(q.Get("to")); err != nil {
		return f, &filterError{"to", err.Error()}
	}
	if f.From != 0 && f.To != 0 && f.To < f.From {
		return f, &filterError{"to", "must not be before from"}
	}
	if !paged {
		return f, nil
	}
	if v := q.Get("cursor"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			return f, &filterError{"cursor", "must be a positive event id"}
		}
		f.Cursor = n
	}
	f.Limit = audit.DefaultLimit
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > audit.MaxLimit {
			return f, &filterError{"limit", fmt.Sprintf("must be between 1 and %d", audit.MaxLimit)}
		}
		f.Limit = n
	}
	return f, nil
}

// parseTime accepts Unix milliseconds or an RFC 3339 timestamp; "" is no bound.
func parseTime(v string) (int64, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, nil
	}
	if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
		return n, nil
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t.UnixMilli(), nil
	}
	return 0, errors.New("must be Unix milliseconds or an RFC 3339 time")
}

func (s *Server) auditFilter(w http.ResponseWriter, r *http.Request, paged bool) (audit.Filter, bool) {
	f, err := parseAuditFilter(r.URL.Query(), paged)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return f, false
	}
	return f, true
}

func (s *Server) handleAuditList(w http.ResponseWriter, r *http.Request) {
	f, ok := s.auditFilter(w, r, true)
	if !ok {
		return
	}
	list, next, err := s.audit.List(r.Context(), f)
	if err != nil {
		s.internal(w, err)
		return
	}
	var cursor any
	if next != 0 {
		cursor = next
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": list, "cursor": cursor})
}

// handleAuditExport streams every matching event, newest first, as
// newline-delimited JSON and records the export itself afterwards.
func (s *Server) handleAuditExport(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	f, ok := s.auditFilter(w, r, false)
	if !ok {
		return
	}
	f.Limit = audit.MaxLimit
	// Read the first page before committing to a 200 so a database error can
	// still be reported as JSON.
	page, next, err := s.audit.List(r.Context(), f)
	if err != nil {
		s.internal(w, err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "application/x-ndjson; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="opentodo-audit-%s.ndjson"`, time.Now().UTC().Format("20060102")))
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	count := 0
	for {
		for _, e := range page {
			if err := enc.Encode(e); err != nil {
				return // client went away
			}
			count++
		}
		if next == 0 {
			break
		}
		f.Cursor = next
		if page, next, err = s.audit.List(r.Context(), f); err != nil {
			s.log.Error("audit export interrupted", "err", err)
			return
		}
	}
	s.audit.Record(r.Context(), audit.AuditExported(u.ID, count))
}

func (s *Server) handleGetAuditSettings(w http.ResponseWriter, r *http.Request) {
	set, err := s.audit.Settings(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, set)
}

func (s *Server) handlePutAuditSettings(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		RetentionDays *float64 `json:"retentionDays"`
		LogIP         *bool    `json:"logIp"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	var p audit.SettingsPatch
	if in.RetentionDays != nil {
		d := *in.RetentionDays
		if d != math.Trunc(d) || d < audit.MinRetentionDays || d > audit.MaxRetentionDays {
			writeError(w, http.StatusBadRequest, "invalid_input", audit.ErrInvalidRetention.Error())
			return
		}
		n := int(d)
		p.RetentionDays = &n
	}
	p.LogIP = in.LogIP
	before, err := s.audit.Settings(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	set, err := s.audit.UpdateSettings(r.Context(), u.ID, p)
	if errors.Is(err, audit.ErrInvalidRetention) {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	// A shorter retention is applied right away instead of waiting for the hourly
	// run; the change itself was recorded in the settings transaction first.
	if set.RetentionDays < before.RetentionDays {
		if _, err := s.audit.Prune(r.Context()); err != nil {
			s.log.Error("audit prune after retention change failed", "err", err)
		}
	}
	writeJSON(w, http.StatusOK, set)
}

func (s *Server) handleMyActivity(w http.ResponseWriter, r *http.Request) {
	list, err := s.audit.Activity(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": list})
}
