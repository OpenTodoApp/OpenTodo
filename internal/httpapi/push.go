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
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
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

// dueInstantMs is the Unix ms of a floating due in loc (09:00 when date-only).
func dueInstantMs(d *due, loc *time.Location) (int64, bool) {
	day, err := time.ParseInLocation("2006-01-02", d.Date, loc)
	if err != nil {
		return 0, false
	}
	hh, mm := 9, 0
	if d.Time != nil {
		if _, err := fmt.Sscanf(*d.Time, "%d:%d", &hh, &mm); err != nil {
			return 0, false
		}
	}
	return time.Date(day.Year(), day.Month(), day.Day(), hh, mm, 0, 0, loc).UnixMilli(), true
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

// reminderOpsForDue recomputes fire_at for every live relative reminder of a task
// whose due is being set to dueRaw, stamped with the same ts as the due op so
// last-writer-wins takes both from the same write (as the web client does).
func (s *Server) reminderOpsForDue(ctx context.Context, uid, taskID string, dueRaw json.RawMessage, ts int64) ([]opsync.Op, error) {
	list, err := s.sync.List(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	d := decodeDue(dueRaw)
	var loc *time.Location
	var ops []opsync.Op
	for _, rem := range list {
		if idOf(rem["task_id"]) != taskID || idOf(rem["kind"]) != "relative" {
			continue
		}
		if loc == nil {
			loc = s.tzLocation(ctx, uid)
		}
		id := idOf(rem["id"])
		fire := relativeFireAt(d, rem["offset_minutes"], loc)
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: id, Field: "fire_at", Value: fire, TS: ts, Device: serverDevice})
		if !opsync.SameJSON(fire, rem["fire_at"]) {
			for _, f := range []string{"delivered_at", "dismissed_at"} {
				if !isNullish(rem[f]) {
					ops = append(ops, opsync.Op{ID: ids.New(), Entity: "reminder", EntityID: id, Field: f, Value: json.RawMessage("null"), TS: ts, Device: serverDevice})
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
	if idOf(merged["kind"]) == "relative" && !fireSent && (existing == nil || offsetSent || body["kind"] != nil) {
		t, err := s.sync.Get(ctx, uid, "task", taskID)
		if err != nil {
			return "", err
		}
		var d *due
		if t != nil {
			d = decodeDue(t["due"])
		}
		body["fire_at"] = relativeFireAt(d, merged["offset_minutes"], s.tzLocation(ctx, uid))
	}
	return "", nil
}
