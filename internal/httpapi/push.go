package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// Reminders and web push (OpenSpec change `reminders`): the /api/v1/push routes,
// the client's reported zone offset and the server-side recomputation of
// relative reminders when a REST write moves a task's due date.

// WithPush enables the /api/v1/push routes. Without it, or with OPENTODO_PUSH=off,
// the routes are not registered and answer 404 not_found like any unknown route.
func WithPush(p *push.Service) Option { return func(s *Server) { s.push = p } }

func (s *Server) pushEnabled() bool { return s.push != nil && !s.cfg.PushDisabled }

func (s *Server) registerPushRoutes(mux *http.ServeMux) {
	if !s.pushEnabled() {
		return
	}
	mux.Handle("GET /api/v1/push/vapid-key", s.requireAuth(s.handlePushKey))
	mux.Handle("POST /api/v1/push/subscriptions", s.requireAuth(s.handlePushSubscribe))
	mux.Handle("DELETE /api/v1/push/subscriptions/{id}", s.requireAuth(s.handlePushUnsubscribe))
	s.pushTestLimiter = newRateLimiter(pushTestLimit, pushTestWindow)
	mux.Handle("POST /api/v1/push/test", s.requireAuth(s.handlePushTest))
}

// Test pushes per account (OpenSpec `push-test-delivery` D3): enough for a
// troubleshooting session, too few to spam a push endpoint through the server.
const (
	pushTestLimit  = 5
	pushTestWindow = 10 * time.Minute
)

// handlePushTest sends one real test push to the caller's subscription for
// deviceId and reports the push service's outcome. Expected push states are a
// successful diagnostic (200); HTTP errors are for request problems (design D2).
func (s *Server) handlePushTest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		DeviceID string `json:"deviceId"`
	}
	if err := readJSON(r, &in); err != nil || strings.TrimSpace(in.DeviceID) == "" {
		badBodyWith(w, err, "bad_request", "deviceId is required")
		return
	}
	uid := userFrom(r.Context()).ID
	if !s.pushTestLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many test notifications, try again in a few minutes")
		return
	}
	sub, err := s.push.SubscriptionForDevice(r.Context(), uid, in.DeviceID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if sub == nil {
		writeJSON(w, http.StatusOK, map[string]any{"outcome": "no_subscription", "subscription": nil})
		return
	}
	testID, res, err := s.push.SendTest(r.Context(), sub)
	switch res {
	case push.Sent:
		out := map[string]any{"outcome": "sent", "testId": testID}
		if fresh, err := s.push.SubscriptionForDevice(r.Context(), uid, in.DeviceID); err == nil && fresh != nil {
			out["subscription"] = fresh.Public()
		}
		writeJSON(w, http.StatusOK, out)
	case push.Gone:
		writeJSON(w, http.StatusOK, map[string]any{"outcome": "gone", "subscription": nil})
	default:
		out := map[string]any{"outcome": "failed", "error": "push service unreachable"}
		var serr *push.StatusError
		if errors.As(err, &serr) {
			out["status"] = serr.Code
			out["error"] = serr.Error()
		} else if err != nil {
			s.log.Warn("test push failed", "subscription", sub.ID, "err", err)
		}
		if fresh, err := s.push.SubscriptionForDevice(r.Context(), uid, in.DeviceID); err == nil && fresh != nil {
			out["subscription"] = fresh.Public()
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// handlePushKey returns the server's public VAPID key and, when ?device= names
// one of the caller's devices, that device's subscription status (null when the
// server holds none, e.g. after the push service reported it gone).
func (s *Server) handlePushKey(w http.ResponseWriter, r *http.Request) {
	k, err := s.push.Keys()
	if err != nil {
		s.internal(w, err)
		return
	}
	out := map[string]any{"publicKey": k.PublicKey()}
	if dev := r.URL.Query().Get("device"); dev != "" {
		sub, err := s.push.SubscriptionForDevice(r.Context(), userFrom(r.Context()).ID, dev)
		if err != nil {
			s.internal(w, err)
			return
		}
		if sub != nil {
			out["subscription"] = sub.Public()
		} else {
			out["subscription"] = nil
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	var in push.SubscriptionInput
	// The browser's PushSubscription.toJSON() carries more than is stored.
	if err := readJSONLoose(r, &in); err != nil {
		badBody(w, err)
		return
	}
	// Tie a browser subscription to its session, so signing out or revoking the
	// session removes it. Token-authenticated clients have no session.
	sessionHash := ""
	if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		if c, err := r.Cookie(sessionCookie); err == nil {
			sessionHash = auth.SessionHash(c.Value)
		}
	}
	if _, err := s.push.Keys(); err != nil {
		s.internal(w, err)
		return
	}
	sub, created, err := s.push.Upsert(r.Context(), userFrom(r.Context()).ID, sessionHash, in)
	if errors.Is(err, push.ErrInvalidSubscription) {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]any{"subscription": sub.Public()})
}

func (s *Server) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	err := s.push.Delete(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, push.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "subscription not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- zone offset ----

// tzKey stores a user's last reported zone offset (minutes east of UTC) in the
// settings table; REST writes that move a due date use it (design D2).
func tzKey(uid string) string { return "tz_offset:" + uid }

// maxTZOffset bounds reported offsets (UTC−14…UTC+14 covers every real zone).
const maxTZOffset = 14 * 60

func (s *Server) recordTZOffset(ctx context.Context, uid string, offset *int) {
	if offset == nil || *offset < -maxTZOffset || *offset > maxTZOffset {
		return
	}
	if v, ok := s.tzOffsets.Load(uid); ok && v.(int) == *offset {
		return
	}
	if err := settings.New(s.sync.DB()).Set(ctx, tzKey(uid), *offset); err != nil {
		s.log.Warn("store zone offset", "err", err)
		return
	}
	s.tzOffsets.Store(uid, *offset)
}

func (s *Server) tzLocation(ctx context.Context, uid string) *time.Location {
	offset := 0
	if v, ok := s.tzOffsets.Load(uid); ok {
		offset = v.(int)
	} else if found, err := settings.New(s.sync.DB()).Get(ctx, tzKey(uid), &offset); err == nil && found {
		s.tzOffsets.Store(uid, offset)
	}
	return time.FixedZone("", offset*60)
}

// ---- relative reminders follow REST due changes ----

// dueInstantMs is the Unix ms a due denotes: a zoned due is its wall time in its
// own zone (absolute-datetimes); a floating one is read in loc, 09:00 when
// date-only.
func dueInstantMs(d *due, loc *time.Location) (int64, bool) {
	clock := "09:00"
	if d.Time != nil {
		clock = *d.Time
	}
	if d.TZ != nil && d.Time != nil {
		if zl, err := zoned.Load(*d.TZ); err == nil {
			loc = zl
		}
	}
	at, err := zoned.Instant(d.Date, clock, loc)
	if err != nil {
		return 0, false
	}
	return at.UnixMilli(), true
}

func relativeFireAt(d *due, offset json.RawMessage, loc *time.Location) json.RawMessage {
	if d == nil {
		return json.RawMessage("null")
	}
	at, ok := dueInstantMs(d, loc)
	if !ok {
		return json.RawMessage("null")
	}
	var minutes int64
	_ = json.Unmarshal(offset, &minutes)
	return json.RawMessage(fmt.Sprint(at + minutes*60_000))
}

// deadlineFireAt is the firing instant of a deadline reminder (OpenSpec change
// deadlines, design D5): 09:00 in loc on the deadline day plus the offset, null
// without a deadline.
func deadlineFireAt(deadlineRaw, offset json.RawMessage, loc *time.Location) json.RawMessage {
	var date string
	if json.Unmarshal(deadlineRaw, &date) != nil || date == "" {
		return json.RawMessage("null")
	}
	return relativeFireAt(&due{Date: date}, offset, loc)
}

// reminderOpsForTask recomputes fire_at for the reminders that follow a task
// field the patch sets: relative reminders follow `due`, deadline reminders
// follow `deadline`. The ops are stamped with the same ts as the task ops so
// last-writer-wins takes both from the same write (as the web client does).
func (s *Server) reminderOpsForTask(ctx context.Context, uid, taskID string, patch map[string]json.RawMessage, ts int64) ([]opsync.Op, error) {
	return s.reminderOpsForTaskAs(ctx, uid, taskID, patch, ts, serverDevice)
}

// reminderOpsForTaskAs is reminderOpsForTask with the ops' device chosen by the
// caller (agent:<token-id> for AI assistant writes).
func (s *Server) reminderOpsForTaskAs(ctx context.Context, uid, taskID string, patch map[string]json.RawMessage, ts int64, device string) ([]opsync.Op, error) {
	dueRaw, hasDue := patch["due"]
	deadlineRaw, hasDeadline := patch["deadline"]
	if !hasDue && !hasDeadline {
		return nil, nil
	}
	list, err := s.sync.List(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	d := decodeDue(dueRaw)
	var loc *time.Location
	var ops []opsync.Op
	for _, rem := range list {
		if idOf(rem["task_id"]) != taskID {
			continue
		}
		kind := idOf(rem["kind"])
		if !(kind == "relative" && hasDue) && !(kind == "deadline" && hasDeadline) {
			continue
		}
		if loc == nil {
			loc = s.tzLocation(ctx, uid)
		}
		id := idOf(rem["id"])
		var fire json.RawMessage
		if kind == "deadline" {
			fire = deadlineFireAt(deadlineRaw, rem["offset_minutes"], loc)
		} else {
			fire = relativeFireAt(d, rem["offset_minutes"], loc)
		}
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: id, Field: "fire_at", Value: fire, TS: ts, Device: device})
		if !opsync.SameJSON(fire, rem["fire_at"]) {
			for _, f := range []string{"delivered_at", "dismissed_at"} {
				if !isNullish(rem[f]) {
					ops = append(ops, opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: id, Field: f, Value: json.RawMessage("null"), TS: ts, Device: device})
				}
			}
		}
	}
	return ops, nil
}

// completeReminderBody fills in a REST reminder write: defaults on create, and
// fire_at for a relative reminder computed from its task's due date when the
// caller did not send one. It returns a user-facing message when the body is
// rejected (an unknown or deleted task).
func (s *Server) completeReminderBody(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	merged := opsync.Entity{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	if existing == nil {
		for _, f := range []string{"delivered_at", "dismissed_at", "deleted_at", "offset_minutes"} {
			if _, has := body[f]; !has {
				body[f] = json.RawMessage("null")
			}
		}
		if _, has := body["kind"]; !has {
			body["kind"] = json.RawMessage(`"absolute"`)
			merged["kind"] = body["kind"]
		}
		if _, has := body["task_id"]; !has {
			return "reminder.task_id is required", nil
		}
	}
	taskID := idOf(merged["task_id"])
	if _, has := body["task_id"]; has {
		t, err := s.sync.Get(ctx, uid, "task", taskID)
		if err != nil {
			return "", err
		}
		if t == nil || t.Deleted() {
			return "reminder.task_id references an unknown or deleted task", nil
		}
	}
	_, offsetSent := body["offset_minutes"]
	_, fireSent := body["fire_at"]
	kind := idOf(merged["kind"])
	if (kind == "relative" || kind == "deadline") && !fireSent && (existing == nil || offsetSent || body["kind"] != nil) {
		t, err := s.sync.Get(ctx, uid, "task", taskID)
		if err != nil {
			return "", err
		}
		switch {
		case kind == "deadline" && t != nil:
			body["fire_at"] = deadlineFireAt(t["deadline"], merged["offset_minutes"], s.tzLocation(ctx, uid))
		case kind == "deadline":
			body["fire_at"] = json.RawMessage("null")
		default:
			var d *due
			if t != nil {
				d = decodeDue(t["due"])
			}
			body["fire_at"] = relativeFireAt(d, merged["offset_minutes"], s.tzLocation(ctx, uid))
		}
	}
	return "", nil
}
