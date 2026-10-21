package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Public links (OpenSpec change `public-links`): owners and admins publish one
// project as a read-only or tick-only list that anyone with the link can open
// without an account. The public routes never authenticate (a session cookie
// is ignored), answer one uniform 404 for every unusable link, and a tick is
// an op written by the link's creator from the device public:<link-id>.

type publicLimiters struct {
	create, read, tick, addr *rateLimiter
}

func (s *Server) registerPublicLinkRoutes(mux *routes) {
	s.public = publicLimiters{
		create: newRateLimiter(20, time.Hour),
		read:   newRateLimiter(120, time.Minute),
		tick:   newRateLimiter(60, time.Minute),
		addr:   newRateLimiter(120, time.Minute),
	}
	mux.handle("GET /api/v1/projects/{id}/public-links", signedIn.demoDenied(), s.handleListPublicLinks)
	mux.handle("POST /api/v1/projects/{id}/public-links", signedIn.recent().demoDenied(), s.handleCreatePublicLink)
	mux.handle("DELETE /api/v1/projects/{id}/public-links/{linkId}", signedIn.demoDenied(), s.handleRevokePublicLink)
	mux.handle("GET /api/v1/public/{token}", public("anyone with the link reads the list; the secret in the address is the credential").demoDenied(), s.handlePublicList)
	mux.handle("POST /api/v1/public/{token}/tick", public("anyone with a tick-enabled link may tick; the secret in the address is the credential").demoDenied(), s.handlePublicTick)
}

// publicHeaders keep a public list out of search engines, referrers and caches.
func publicHeaders(w http.ResponseWriter) {
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
}

// publicManager is projectManager with the public-links wording.
func (s *Server) publicManager(w http.ResponseWriter, r *http.Request) (shared, ok bool) {
	m, err := s.sync.ProjectMembers(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return false, false
	}
	if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only the project's owner and admins can manage public links")
		return false, false
	}
	return len(m.Members) > 1, true
}

func (s *Server) handleCreatePublicLink(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	shared, ok := s.publicManager(w, r)
	if !ok {
		return
	}
	var in struct {
		Rights        string `json:"rights"`
		Name          string `json:"name"`
		ExpiresInDays *int   `json:"expiresInDays"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	days := 0
	if in.ExpiresInDays != nil {
		days = *in.ExpiresInDays
		if days < 1 || days > auth.MaxPublicLinkDays {
			writeError(w, http.StatusBadRequest, "invalid_input", "expiresInDays: must be from 1 to 90, or left out for no expiry")
			return
		}
	}
	switch {
	case in.Rights != "view" && in.Rights != "tick":
		writeError(w, http.StatusBadRequest, "invalid_input", "rights: must be view or tick")
		return
	case len([]rune(strings.TrimSpace(in.Name))) > 60 || strings.ContainsAny(in.Name, "\r\n"):
		writeError(w, http.StatusBadRequest, "invalid_input", "name: at most 60 characters on one line")
		return
	}
	// An unshared project of an encrypted account is ciphertext on the server.
	if !shared && s.refuseIfEncrypted(w, r, "public links are not available for projects of accounts with end-to-end encryption") {
		return
	}
	if !s.public.create.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many public links created, try again later")
		return
	}
	l, secret, err := s.auth.CreatePublicLink(r.Context(), u, r.PathValue("id"), in.Rights, in.Name, days)
	if errors.Is(err, auth.ErrInvalidPublicLink) {
		writeError(w, http.StatusBadRequest, "invalid_input", "rights, name or expiresInDays is not valid")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	l.CreatedByName = u.Name
	writeJSON(w, http.StatusCreated, map[string]any{"id": l.ID, "projectId": l.ProjectID, "rights": l.Rights, "name": l.Name,
		"createdBy": l.CreatedBy, "createdByName": l.CreatedByName, "createdAt": l.CreatedAt, "expiresAt": l.ExpiresAt,
		"lastUsedAt": nil, "link": s.publicOrigin(r) + "/public/" + secret})
}

func (s *Server) handleListPublicLinks(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.publicManager(w, r); !ok {
		return
	}
	list, err := s.auth.ListPublicLinks(r.Context(), r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"links": list})
}

func (s *Server) handleRevokePublicLink(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.publicManager(w, r); !ok {
		return
	}
	err := s.auth.RevokePublicLink(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("linkId"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "public link not found")
	case err != nil:
		s.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// usablePublicLink re-checks an active link against current state (design D5):
// the creator is active and still the project's owner or admin, the project is
// live and not archived, and an unshared project's creator has no encryption.
func (s *Server) usablePublicLink(ctx context.Context, l *auth.ResolvedPublicLink) (opsync.PublicProject, bool, error) {
	if l.CreatorDeactivated {
		return opsync.PublicProject{}, false, nil
	}
	live, shared, role, err := s.sync.ProjectStatus(ctx, l.CreatedBy, l.ProjectID)
	if err != nil || !live || (role != opsync.RoleOwner && role != opsync.RoleAdmin) {
		return opsync.PublicProject{}, false, err
	}
	if !shared {
		on, err := s.encryptionEnabled(ctx, l.CreatedBy)
		if err != nil || on {
			return opsync.PublicProject{}, false, err
		}
	}
	pp, ok, err := s.sync.PublicProject(ctx, l.CreatedBy, l.ProjectID, time.Now())
	if err != nil || !ok {
		return opsync.PublicProject{}, false, err
	}
	var archived bool
	_ = json.Unmarshal(pp.Project["archived"], &archived)
	if archived {
		return opsync.PublicProject{}, false, nil
	}
	return pp, true, nil
}

var errPublicAnswered = errors.New("answered")

// resolvePublic runs the limits and checks every public route shares. On
// failure it has answered (429 or the uniform 404) and returns errPublicAnswered.
func (s *Server) resolvePublic(w http.ResponseWriter, r *http.Request, perLink *rateLimiter) (*auth.ResolvedPublicLink, opsync.PublicProject, error) {
	publicHeaders(w)
	ip := clientIP(r)
	if !s.public.addr.allow(ip) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, try again in a minute")
		return nil, opsync.PublicProject{}, errPublicAnswered
	}
	invalid := func() (*auth.ResolvedPublicLink, opsync.PublicProject, error) {
		writeError(w, http.StatusNotFound, "link_invalid", auth.ErrPublicLinkInvalid.Error())
		return nil, opsync.PublicProject{}, errPublicAnswered
	}
	l, err := s.auth.LookupPublicLink(r.Context(), r.PathValue("token"))
	if errors.Is(err, auth.ErrPublicLinkInvalid) {
		// Guessing links costs as much as guessing passwords (10 misses a minute).
		if !s.publicLinkLimiter.allow(ip) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
			return nil, opsync.PublicProject{}, errPublicAnswered
		}
		return invalid()
	}
	if err != nil {
		s.internal(w, err)
		return nil, opsync.PublicProject{}, errPublicAnswered
	}
	if !perLink.allow(l.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "this link is used too often, try again in a minute")
		return nil, opsync.PublicProject{}, errPublicAnswered
	}
	pp, ok, err := s.usablePublicLink(r.Context(), l)
	if err != nil {
		s.internal(w, err)
		return nil, opsync.PublicProject{}, errPublicAnswered
	}
	if !ok {
		return invalid()
	}
	if err := s.auth.TouchPublicLink(r.Context(), l.ID); err != nil {
		s.log.Warn("public link last use", "err", err)
	}
	return l, pp, nil
}

// publicFields is everything a guest may see of a task (design D3): nothing
// else is copied, so a content field added later is not exposed by default.
var publicTaskFields = []string{"id", "title", "due", "priority", "section_id", "parent_id", "position", "completed_at"}

func project(e opsync.Entity, fields []string) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage, len(fields))
	for _, f := range fields {
		if v, ok := e[f]; ok {
			out[f] = v
		} else {
			out[f] = json.RawMessage("null")
		}
	}
	return out
}

func position(e opsync.Entity) float64 {
	var p float64
	_ = json.Unmarshal(e["position"], &p)
	return p
}

func (s *Server) handlePublicList(w http.ResponseWriter, r *http.Request) {
	l, pp, err := s.resolvePublic(w, r, s.public.read)
	if err != nil {
		return
	}
	sort.SliceStable(pp.Sections, func(i, j int) bool { return position(pp.Sections[i]) < position(pp.Sections[j]) })
	sort.SliceStable(pp.Tasks, func(i, j int) bool { return position(pp.Tasks[i]) < position(pp.Tasks[j]) })
	sections := make([]map[string]json.RawMessage, 0, len(pp.Sections))
	for _, e := range pp.Sections {
		sections = append(sections, project(e, []string{"id", "name", "position"}))
	}
	tasks := make([]map[string]json.RawMessage, 0, len(pp.Tasks))
	for _, e := range pp.Tasks {
		tasks = append(tasks, project(e, publicTaskFields))
	}
	var name, color string
	_ = json.Unmarshal(pp.Project["name"], &name)
	_ = json.Unmarshal(pp.Project["color"], &color)
	writeJSON(w, http.StatusOK, map[string]any{"projectName": name, "projectColor": color, "rights": l.Rights,
		"sections": sections, "tasks": tasks, "serverTime": time.Now().UnixMilli()})
}

// handlePublicTick completes or reopens one task of a tick link's project, as
// an op by the link's creator from the device public:<link-id> (design D4).
func (s *Server) handlePublicTick(w http.ResponseWriter, r *http.Request) {
	l, pp, err := s.resolvePublic(w, r, s.public.tick)
	if err != nil {
		return
	}
	if l.Rights != "tick" {
		writeError(w, http.StatusForbidden, "forbidden", "this link can only show the list")
		return
	}
	var in struct {
		TaskID    string `json:"taskId"`
		Completed *bool  `json:"completed"`
	}
	if err := readJSON(r, &in); err != nil || in.TaskID == "" || in.Completed == nil {
		badBodyWith(w, err, "invalid_input", "taskId and completed are required")
		return
	}
	var task opsync.Entity
	for _, t := range pp.Tasks {
		var id string
		_ = json.Unmarshal(t["id"], &id)
		if id == in.TaskID {
			task = t
		}
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such task on this list")
		return
	}
	ctx := r.Context()
	now := time.Now()
	// An anonymous visitor completed it: completed_by stays null
	// (completed-date-filters D5), instead of naming the link's creator.
	body := map[string]json.RawMessage{"completed_at": json.RawMessage("null"), "completed_by": json.RawMessage("null")}
	if *in.Completed {
		body["completed_at"] = mustJSON(now.UnixMilli())
	}
	ts := s.opTS()
	device := opsync.PublicDevice(l.ID)
	var ops []opsync.Op
	if *in.Completed {
		// A repeating task rolls forward, as when the API completes it.
		recordID, record, ok, err := s.recurringCompletion(ctx, l.CreatedBy, in.TaskID, body, task, localToday(now))
		if err != nil {
			s.internal(w, err)
			return
		}
		if ok {
			ops = append(ops, deviceOps("task", recordID, record, ts, device)...)
		}
	}
	ops = append(ops, deviceOps("task", in.TaskID, body, ts, device)...)
	res, err := s.sync.ApplyStrict(ctx, l.CreatedBy, ops)
	if err != nil {
		// The checks above guarantee the creator may write; a refusal means
		// they and the resolver disagree.
		s.log.Error("public tick refused", "link", l.ID, "err", err)
		s.internal(w, err)
		return
	}
	if res.Applied > 0 {
		s.sync.NotifyApplied(res, device)
	}
	got, err := s.sync.Get(ctx, l.CreatedBy, "task", in.TaskID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"taskId": in.TaskID, "completed_at": got["completed_at"]})
}

// deviceOps is fieldOps with an explicit device.
func deviceOps(entity, id string, body map[string]json.RawMessage, ts int64, device string) []opsync.Op {
	ops := make([]opsync.Op, 0, len(body))
	for field, value := range body {
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: field, Value: value, TS: ts, Device: device})
	}
	return ops
}

// publicLabels names a public link's changes for one viewer (public-links D6):
// "Public link (<name>)" for the project's owner and admins when the link has a
// name, "Public link" for everyone else. Results are cached per link.
type publicLabels struct {
	s      *Server
	viewer string
	cache  map[string]string
}

func (s *Server) publicLabeler(viewerID string) *publicLabels {
	return &publicLabels{s: s, viewer: viewerID, cache: map[string]string{}}
}

func (p *publicLabels) label(ctx context.Context, device string, ts int64) string {
	// A task page's guest write (task-pages D5): the name the guest typed for
	// that write, for every viewer, since the guest chose to show it.
	if pageID, ok := strings.CutPrefix(device, opsync.PageDevicePrefix); ok {
		name, err := p.s.auth.TaskPageGuestName(ctx, pageID, ts)
		if err != nil || name == "" {
			return "Guest (task page)"
		}
		return name + " (guest, task page)"
	}
	linkID, ok := strings.CutPrefix(device, opsync.PublicDevicePrefix)
	if !ok {
		return ""
	}
	if l, seen := p.cache[linkID]; seen {
		return l
	}
	label := "Public link"
	if info, err := p.s.auth.PublicLinkNames(ctx, []string{linkID}); err == nil {
		if li, found := info[linkID]; found && li.Name != "" {
			if _, _, role, err := p.s.sync.ProjectStatus(ctx, p.viewer, li.ProjectID); err == nil && (role == opsync.RoleOwner || role == opsync.RoleAdmin) {
				label = "Public link (" + li.Name + ")"
			}
		}
	}
	p.cache[linkID] = label
	return label
}
