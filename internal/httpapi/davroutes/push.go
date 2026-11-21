package davroutes

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/davpush"
	"github.com/OpenTodoApp/opentodo/internal/settings"
)

// Push to calendar apps (OpenSpec change caldav-push): WebDAV-Push discovery,
// registration and removal on the endpoint, and the changes the push job asks
// for. The job itself is internal/davpush.

// PushDeps is what the endpoint needs for push; the zero value turns it off.
type PushDeps struct {
	// On is the owner's push switch.
	On    *settings.Switch
	Store *davpush.Store
	// VAPIDKey is the server's VAPID public key (nil when web push is off).
	VAPIDKey func() (string, error)
	// CheckTarget refuses a push resource the outbound policy refuses.
	CheckTarget func(ctx context.Context, raw string) error
	// AllowRegister counts one registration of an app password (30 an hour).
	AllowRegister func(appPasswordID string) bool
}

// kindPush is a registration URL, /dav/push/<id>.
const kindPush = "push"

func pushHref(id string) string { return "/dav/push/" + url.PathEscape(id) }

// pushOn reports whether push is advertised and registrations are taken.
func (s *Server) pushOn(ctx context.Context) bool {
	p := s.Push
	return p.On != nil && p.Store != nil && p.VAPIDKey != nil && p.On.On(ctx)
}

// davHeader is the DAV header of an answer.
func (s *Server) davHeader(ctx context.Context) string {
	if s.pushOn(ctx) {
		return davCompliance + ", " + caldav.DAVPush
	}
	return davCompliance
}

// pushProps adds the draft's properties of a collection (Home or a calendar).
func (d *davRequest) pushProps(m map[caldav.PropName]propFunc, collection string) {
	if !d.s.pushOn(d.ctx()) {
		return
	}
	m[caldav.PropPushTransports] = func() string {
		key, err := d.s.Push.VAPIDKey()
		if err != nil {
			return ""
		}
		return caldav.PushTransports(key)
	}
	m[caldav.PropPushTopic] = func() string {
		topic, err := d.s.Push.Store.Topic(d.user.ID, collection)
		if err != nil {
			return ""
		}
		return caldav.Esc(topic)
	}
	m[caldav.PropPushSupportedTrigger] = func() string { return caldav.PushSupportedTriggers }
}

// pushRegister is POST push-register on the calendar home or a calendar (design D3).
func (d *davRequest) pushRegister() {
	if d.path.kind != kindHome && d.path.kind != kindCalendar {
		http.Error(d.w, "push-register is taken on the calendar home and on calendars", http.StatusMethodNotAllowed)
		return
	}
	if !d.s.pushOn(d.ctx()) {
		d.pushRefuse(caldav.PushNotAvailable)
		return
	}
	v, err := d.calendars()
	if err != nil {
		d.fail(err)
		return
	}
	collection := davpush.Home
	if d.path.kind == kindCalendar {
		if !v.calendarVisible(d.path.calendar) {
			http.NotFound(d.w, d.r)
			return
		}
		collection = d.path.calendar
	}
	if d.s.Push.AllowRegister != nil && !d.s.Push.AllowRegister(d.appPassword) {
		d.w.Header().Set("Retry-After", "3600")
		http.Error(d.w, "too many registrations", http.StatusTooManyRequests)
		return
	}
	root, err := caldav.ParseXMLLimit(d.r.Body, caldav.MaxPushRegisterBytes)
	if err != nil || root == nil {
		http.Error(d.w, "malformed push-register body", http.StatusBadRequest)
		return
	}
	reg, err := caldav.ParsePushRegister(root)
	var refusal *caldav.PushRefusal
	switch {
	case errors.As(err, &refusal):
		d.pushRefuse(refusal.Element)
		return
	case err != nil:
		http.Error(d.w, err.Error(), http.StatusBadRequest)
		return
	}
	if d.s.Push.CheckTarget != nil {
		if err := d.s.Push.CheckTarget(d.ctx(), reg.PushResource); err != nil {
			d.pushRefuse(caldav.PushInvalidSubscription)
			return
		}
	}
	expires := d.s.Push.Store.Expiry(reg.Expires)
	sub, created, err := d.s.Push.Store.Register(d.ctx(), d.user.ID, d.appPassword, collection, reg, expires, v.cursor)
	if errors.Is(err, davpush.ErrLimit) {
		d.pushRefuse(caldav.PushNotAvailable)
		return
	} else if err != nil {
		d.fail(err)
		return
	}
	d.w.Header().Set("Location", d.s.publicOrigin(d.r)+pushHref(sub.ID))
	d.w.Header().Set("Expires", expires.UTC().Format(http.TimeFormat))
	if created {
		d.w.WriteHeader(http.StatusCreated)
		return
	}
	d.w.WriteHeader(http.StatusNoContent)
}

func (d *davRequest) pushRefuse(element string) {
	d.w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	d.w.WriteHeader(http.StatusForbidden)
	_, _ = d.w.Write(caldav.PushErrorBody(element))
}

// pushUnregister is DELETE on a registration URL: the user's own only.
func (d *davRequest) pushUnregister() {
	if d.s.Push.Store == nil {
		http.NotFound(d.w, d.r)
		return
	}
	ok, err := d.s.Push.Store.Delete(d.ctx(), d.user.ID, d.appPassword, d.path.name)
	if err != nil {
		d.fail(err)
		return
	}
	if !ok {
		http.NotFound(d.w, d.r)
		return
	}
	d.w.WriteHeader(http.StatusNoContent)
}

// pushDontNotify applies a successful write's Push-Dont-Notify header: the
// listed registrations of the writing app password (all of its own for *) move
// past the write's own ops, from before (the cursor when the write began), so
// the writer is not woken by its own change. Another password's registrations,
// and changes other devices made before the write, are never skipped.
func (d *davRequest) pushDontNotify(before int64) {
	h := d.r.Header.Get("Push-Dont-Notify")
	if h == "" || d.s.Push.Store == nil {
		return
	}
	var subIDs []string
	all := false
	for _, part := range strings.Split(h, ",") {
		part = strings.Trim(strings.TrimSpace(part), `"`)
		if part == "*" {
			all = true
			continue
		}
		if u, err := url.Parse(part); err == nil {
			if id, ok := strings.CutPrefix(u.Path, "/dav/push/"); ok && id != "" && !strings.Contains(id, "/") {
				subIDs = append(subIDs, id)
			}
		}
	}
	if !all && len(subIDs) == 0 {
		return
	}
	cursor, err := d.s.sync.Cursor(d.ctx(), d.user.ID)
	if err == nil {
		err = d.s.Push.Store.Silence(d.ctx(), d.user.ID, d.appPassword, subIDs, all, before, cursor)
	}
	if err != nil {
		d.s.log.Warn("caldav push-dont-notify", "err", err)
	}
}

// statusWriter remembers the status of an answer (for Push-Dont-Notify). The
// body passes straight to the embedded writer; an answer written without
// WriteHeader is a 200 (succeeded).
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

// succeeded reports a 2xx answer, or one written without WriteHeader.
func (w *statusWriter) succeeded() bool { return w.status == 0 || (w.status >= 200 && w.status < 300) }

// PushChanges reports what changed for one of the user's app passwords since a
// cursor, as its sync-collection reports would list it (caldav-push D5): the
// push job's view of the endpoint, outside a request.
func (s *Server) PushChanges(ctx context.Context, uid, appPasswordID string, since int64) (davpush.Changes, error) {
	var ch davpush.Changes
	list, err := s.auth.ListAppPasswords(ctx, uid)
	if err != nil {
		return ch, err
	}
	var ap *auth.AppPassword
	for i := range list {
		if list[i].ID == appPasswordID && list[i].RevokedAt == nil {
			ap = &list[i]
		}
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, "/", nil)
	if err != nil {
		return ch, err
	}
	d := &davRequest{s: s, r: r, user: &auth.User{ID: uid}}
	if ap != nil {
		d.scope, d.events = ap.Scope, ap.Events
	}
	v, err := d.calendars()
	if err != nil {
		return ch, err
	}
	ch.Cursor, ch.SyncToken, ch.Calendars = v.cursor, syncToken(v.cursor), map[string]bool{}
	if ap == nil || since >= v.cursor {
		return ch, nil
	}
	delta, err := s.sync.ChangedSince(ctx, uid, since)
	if err != nil {
		return ch, err
	}
	ch.CalendarSet = len(delta.Fields["project"]) > 0 || len(delta.Purged["project"]) > 0
	candidates := map[string]bool{}
	for id, f := range delta.Fields["task"] {
		candidates[id] = true
		// Deleted, or moved out of a calendar it may have been in: every calendar
		// may list it as gone. A new task writes these fields too; it is placed
		// below by the calendar it is in.
		moved := (f["project_id"] || f["workspace_id"] || f["parent_id"]) && !f["created_at"]
		if f["deleted_at"] || moved {
			ch.All = true
		}
	}
	if len(delta.Purged["task"]) > 0 {
		ch.All = true
	}
	if err := d.reminderCandidates(v, delta.Fields["reminder"], candidates); err != nil {
		return ch, err
	}
	byLabel, err := d.labelCandidates(v, delta.Fields["label"])
	if err != nil {
		return ch, err
	}
	for id := range byLabel {
		candidates[id] = true
	}
	if ch.All {
		return ch, nil
	}
	ids := make([]string, 0, len(candidates))
	for id := range candidates {
		ids = append(ids, id)
	}
	if err := d.fetch(v, ids); err != nil {
		return ch, err
	}
	for _, id := range ids {
		if t, live := v.byID[id]; live {
			if cal := v.calendarOf(t); cal != "" {
				ch.Calendars[cal] = true
			}
		}
	}
	return ch, nil
}
