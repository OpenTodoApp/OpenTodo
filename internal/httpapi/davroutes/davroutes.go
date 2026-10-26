// Package davroutes is the CalDAV endpoint (OpenSpec change `caldav`): /dav/,
// the well-known address and discovery from the host root. It authenticates
// with HTTP Basic and app passwords only (never sessions or API tokens) and
// writes through ApplyStrict like every REST route; see write.go. The app
// password routes and the owner switch stay in internal/httpapi, which hands
// this package the services and the handler logic it shares with REST.
package davroutes

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// davRealm is the Basic authentication realm.
const davRealm = "OpenTodo CalDAV"

// Deps is what httpapi hands the endpoint.
type Deps struct {
	Sync *opsync.Service
	Auth *auth.Service
	Log  *slog.Logger
	// On is the owner's CalDAV switch.
	On  *settings.Switch
	Now func() time.Time
	// ApplyAs applies ops as a user in one strict batch and wakes the other devices.
	ApplyAs      func(ctx context.Context, uid, device string, ops []opsync.Op) (opsync.ApplyResult, error)
	ClientIP     func(r *http.Request) string
	PublicOrigin func(r *http.Request) string
	// AuthBlocked reports an address over the failed sign-in limit (10 a
	// minute); AuthFailed counts one failure.
	AuthBlocked, AuthFailed func(ip string) bool
	// TZLocation is a user's time zone for reminders.
	TZLocation func(ctx context.Context, uid string) *time.Location
	// ReminderOps are the reminder ops that follow a task write, as for REST.
	ReminderOps func(ctx context.Context, uid, taskID string, patch map[string]json.RawMessage, ts int64, device string) ([]opsync.Op, error)
	// RecurringCompletion turns completing a repeating task into the occurrence record, as for REST.
	RecurringCompletion func(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity, today string) (string, map[string]json.RawMessage, bool, error)
	// EncryptionEnabled reports an account that encrypts its content (refused here).
	EncryptionEnabled func(ctx context.Context, uid string) (bool, error)
}

// Server is the CalDAV endpoint.
type Server struct {
	Deps
	sync     *opsync.Service
	auth     *auth.Service
	log      *slog.Logger
	caldavOn *settings.Switch
}

// New builds the endpoint.
func New(d Deps) *Server {
	return &Server{Deps: d, sync: d.Sync, auth: d.Auth, log: d.Log, caldavOn: d.On}
}

// Register adds the endpoint's routes behind their policies.
func (s *Server) Register(mux httpx.Router) {
	mux.Handle("/dav/", httpx.Public("CalDAV clients authenticate with an app password in the handler").DemoDenied(), s.handleDAV)
	mux.Handle("/dav", httpx.Public("CalDAV clients authenticate with an app password in the handler").DemoDenied(), s.handleDAV)
	mux.Handle("/.well-known/caldav", httpx.Public("CalDAV discovery; the handler authenticates with an app password").DemoDenied(), s.handleDAV)
	mux.Handle("/.well-known/caldav/", httpx.Public("CalDAV discovery; the handler authenticates with an app password").DemoDenied(), s.handleDAV)
	// Discovery from the host root (issue #249): Apple's clients probe the root
	// and /principals/ with WebDAV methods when the well-known address does not
	// lead them; without CalDAV these answer as the web app did (405, 404).
	mux.Handle("PROPFIND /{$}", httpx.Public("CalDAV discovery from the host root; redirects to /dav/").DemoDenied(), s.handleDAVRoot)
	mux.Handle("OPTIONS /{$}", httpx.Public("CalDAV discovery from the host root; reports the DAV capabilities").DemoDenied(), s.handleDAVRoot)
	mux.Handle("/principals", httpx.Public("CalDAV discovery; redirects to the principal under /dav/").DemoDenied(), s.handleDAVRoot)
	mux.Handle("/principals/", httpx.Public("CalDAV discovery; redirects to the principal under /dav/").DemoDenied(), s.handleDAVRoot)
}

func (s *Server) now() time.Time { return s.Now() }

// opTS stamps the endpoint's ops with the sync service's server clock.
func (s *Server) opTS() int64 { return s.sync.ServerTS() }

func (s *Server) applyAs(ctx context.Context, uid, device string, ops []opsync.Op) (opsync.ApplyResult, error) {
	return s.ApplyAs(ctx, uid, device, ops)
}

func (s *Server) publicOrigin(r *http.Request) string { return s.PublicOrigin(r) }

func (s *Server) tzLocation(ctx context.Context, uid string) *time.Location {
	return s.TZLocation(ctx, uid)
}

func (s *Server) reminderOpsForTaskAs(ctx context.Context, uid, taskID string, patch map[string]json.RawMessage, ts int64, device string) ([]opsync.Op, error) {
	return s.ReminderOps(ctx, uid, taskID, patch, ts, device)
}

func (s *Server) recurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity, today string) (string, map[string]json.RawMessage, bool, error) {
	return s.RecurringCompletion(ctx, uid, id, body, existing, today)
}

func (s *Server) encryptionEnabled(ctx context.Context, uid string) (bool, error) {
	return s.EncryptionEnabled(ctx, uid)
}

// Op values and due values under the short names of the endpoint's code.
type due = zoned.Due

var (
	idOf           = opsync.StringOf
	numberOf       = opsync.NumberOf
	isNullish      = opsync.IsNull
	mustJSON       = opsync.JSONOf
	decodeDue      = zoned.DecodeDue
	dueInstantMs   = zoned.DueInstantMs
	relativeFireAt = zoned.RelativeFireAt
	deadlineFireAt = zoned.DeadlineFireAt
	localToday     = zoned.LocalToday
)

// davAuth resolves HTTP Basic credentials (email and app password). Failures,
// including revoked passwords, count toward a per-address limit of 10 a minute;
// while an address is over it every attempt is refused with 429.
func (s *Server) davAuth(w http.ResponseWriter, r *http.Request) (*auth.User, string, bool) {
	ip := s.ClientIP(r)
	if s.AuthBlocked(ip) {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "too many failed attempts", http.StatusTooManyRequests)
		return nil, "", false
	}
	challenge := func() {
		w.Header().Set("WWW-Authenticate", `Basic realm="`+davRealm+`", charset="UTF-8"`)
		http.Error(w, "authentication required", http.StatusUnauthorized)
	}
	email, secret, ok := basicAuth(r)
	if !ok {
		challenge()
		return nil, "", false
	}
	u, id, err := s.auth.UserByAppPassword(r.Context(), email, secret)
	if errors.Is(err, auth.ErrNotFound) {
		s.AuthFailed(ip)
		challenge()
		return nil, "", false
	}
	if err != nil {
		s.log.Error("caldav auth lookup failed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return nil, "", false
	}
	return u, id, true
}

func basicAuth(r *http.Request) (user, pass string, ok bool) {
	h := r.Header.Get("Authorization")
	const prefix = "Basic "
	if len(h) < len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return "", "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(h[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	user, pass, ok = strings.Cut(string(raw), ":")
	return user, pass, ok && user != "" && pass != ""
}
