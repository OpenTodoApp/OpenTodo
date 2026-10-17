package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/calfeed"
	ob "github.com/pixari/opentodo/internal/outbound"
	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/settings"
)

// Calendar feeds (OpenSpec change calendar-feeds): subscriptions to other
// calendars shown in Day and Week, and the user's tasks as a calendar feed. One
// owner switch, off by default, governs both (design D1).

const calendarFeedsSettingKey = "calendar_feeds.enabled"

// Request limits (design D5, D7).
const (
	maxEventDays      = 92
	feedFetchesPerHr  = 60
	handFetchesPerHr  = 12
	feedCacheSeconds  = 900
	maxSubscriptionNm = 200
)

// WithCalendarFeeds hands the server the worker that fetches subscriptions, so
// inline fetches and the background job share one store and policy.
func WithCalendarFeeds(w *calfeed.Worker) Option { return func(s *Server) { s.calWorker = w } }

func (s *Server) registerCalendarFeedRoutes(mux *routes) {
	if s.calWorker == nil {
		allow := func(context.Context) bool { return false }
		if s.hooks != nil {
			allow = s.hooks.AllowPrivate
		}
		s.calWorker = &calfeed.Worker{Store: calfeed.NewStore(s.sync.DB()), Fetcher: calfeed.NewFetcher(allow, s.version), Log: s.log}
	}
	s.calWorker.Enabled = s.calendarFeedsEnabled
	s.calWorker.Notify = s.sync.Notifier().NotifyCalendar
	s.calFetchLimiter = newRateLimiter(handFetchesPerHr, time.Hour)
	s.feedLimiter = newRateLimiter(feedFetchesPerHr, time.Hour)
	s.seedCalendarFeeds(context.Background())

	mux.handle("GET /api/v1/settings/calendar-feeds", signedIn.demoDenied(), s.handleGetCalendarFeedsSetting)
	mux.handle("PUT /api/v1/settings/calendar-feeds", ownerOnly("manage the calendar feeds setting").demoDenied(), s.handlePutCalendarFeedsSetting)
	mux.handle("GET /api/v1/calendar-feeds/subscriptions", signedIn.demoDenied(), s.feedsGate(s.handleListSubscriptions))
	mux.handle("POST /api/v1/calendar-feeds/subscriptions", signedIn.demoDenied(), s.feedsGate(s.handleCreateSubscription))
	mux.handle("PATCH /api/v1/calendar-feeds/subscriptions/{id}", signedIn.demoDenied(), s.feedsGate(s.handlePatchSubscription))
	mux.handle("DELETE /api/v1/calendar-feeds/subscriptions/{id}", signedIn.demoDenied(), s.feedsGate(s.handleDeleteSubscription))
	mux.handle("POST /api/v1/calendar-feeds/subscriptions/{id}/refresh", signedIn.demoDenied(), s.feedsGate(s.handleRefreshSubscription))
	mux.handle("GET /api/v1/calendar-feeds/events", signedIn.demoDenied(), s.feedsGate(s.handleCalendarEvents))
	mux.handle("GET /api/v1/calendar-feeds/feed", signedIn.demoDenied(), s.feedsGate(s.handleGetFeed))
	mux.handle("POST /api/v1/calendar-feeds/feed", signedIn.recent().demoDenied(), s.feedsGate(s.handleRotateFeed))
	mux.handle("DELETE /api/v1/calendar-feeds/feed", signedIn.demoDenied(), s.feedsGate(s.handleRevokeFeed))
	mux.handle("GET /feeds/{secret}/tasks.ics", public("calendar apps authenticate with the secret in the address").demoDenied(), s.handleTaskFeed)
}

// CalendarWorker is the background fetcher, run by the jobs leader.
func (s *Server) CalendarWorker() *calfeed.Worker { return s.calWorker }

// seedCalendarFeeds applies the OPENTODO_CALENDAR_FEEDS preset on first start only.
func (s *Server) seedCalendarFeeds(ctx context.Context) {
	if s.cfg.CalendarFeeds == nil {
		return
	}
	if _, err := s.sync.DB().ExecContext(ctx, `INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)`,
		calendarFeedsSettingKey, boolText(*s.cfg.CalendarFeeds), time.Now().UnixMilli()); err != nil {
		s.log.Error("seed calendar feeds setting", "err", err)
	}
}

// calendarFeedsEnabled reads the owner switch through the cache (never on a demo instance).
func (s *Server) calendarFeedsEnabled(ctx context.Context) bool {
	if s.demo != nil {
		return false
	}
	switch s.calFeeds.v.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	var on bool
	if _, err := settings.New(s.sync.DB()).Get(ctx, calendarFeedsSettingKey, &on); err != nil {
		s.log.Error("read calendar feeds setting", "err", err)
		return false
	}
	s.setCalendarFeedsCache(on)
	return on
}

func (s *Server) setCalendarFeedsCache(on bool) {
	if on {
		s.calFeeds.v.Store(2)
	} else {
		s.calFeeds.v.Store(1)
	}
}

func (s *Server) handleGetCalendarFeedsSetting(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"enabled": s.calendarFeedsEnabled(r.Context())})
}

func (s *Server) handlePutCalendarFeedsSetting(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Enabled *bool `json:"enabled"`
	}
	if err := readJSON(r, &in); err != nil || in.Enabled == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"enabled": true|false}`)
		return
	}
	before := s.calendarFeedsEnabled(r.Context())
	if err := settings.New(s.sync.DB()).Set(r.Context(), calendarFeedsSettingKey, *in.Enabled); err != nil {
		s.internal(w, err)
		return
	}
	s.setCalendarFeedsCache(*in.Enabled)
	if before != *in.Enabled {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, calendarFeedsSettingKey, boolText(before), boolText(*in.Enabled)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": *in.Enabled})
}

// feedsGate answers 404 feeds_disabled while the owner switch is off.
func (s *Server) feedsGate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.calendarFeedsEnabled(r.Context()) {
			writeError(w, http.StatusNotFound, "feeds_disabled", "calendar feeds are not enabled")
			return
		}
		next(w, r)
	}
}

func (s *Server) handleListSubscriptions(w http.ResponseWriter, r *http.Request) {
	list, err := s.calWorker.Store.List(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscriptions": list})
}

type subscriptionInput struct {
	URL     *string `json:"url"`
	Name    *string `json:"name"`
	Color   *string `json:"color"`
	Enabled *bool   `json:"enabled"`
}

// checkSubscriptionURL normalises and checks an address: webcal is https, the
// outbound URL rules apply, and the host must not be a private target unless
// the owner allows them (the webhooks setting).
func (s *Server) checkSubscriptionURL(ctx context.Context, raw string) (string, string, string) {
	u, err := calfeed.FetchURL(raw)
	if err != nil {
		return "", "invalid_input", strings.TrimPrefix(err.Error(), ob.ErrBadURL.Error()+": ")
	}
	parsed, _ := url.Parse(u)
	allow := func(context.Context) bool { return false }
	if s.hooks != nil {
		allow = s.hooks.AllowPrivate
	}
	d := &ob.Dialer{Resolver: net.DefaultResolver, AllowPrivate: allow}
	if _, err := d.Allowed(ctx, parsed.Hostname()); errors.Is(err, ob.ErrPrivateTarget) {
		return "", "private_target", "this address is on a private network; the server owner can allow private targets in Settings → Integrations → Webhooks"
	}
	return u, "", ""
}

func (s *Server) handleCreateSubscription(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	var in subscriptionInput
	if err := readJSON(r, &in); err != nil || in.URL == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"url": "...", "name"?: "...", "color"?: "..."}`)
		return
	}
	target, code, msg := s.checkSubscriptionURL(r.Context(), *in.URL)
	if code != "" {
		writeError(w, http.StatusBadRequest, code, msg)
		return
	}
	name, color := trimTo(in.Name, maxSubscriptionNm), trimTo(in.Color, 32)
	if !s.calFetchLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar fetches; try again later")
		return
	}
	sub, err := s.calWorker.Store.Create(r.Context(), uid, target, name, color)
	if errors.Is(err, calfeed.ErrLimit) {
		writeError(w, http.StatusBadRequest, "limit_reached", fmt.Sprintf("you can subscribe to at most %d calendars", calfeed.MaxSubscriptions))
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"subscription": s.fetchNow(r.Context(), sub)})
}

// fetchNow runs one inline fetch and returns the subscription as stored after it.
func (s *Server) fetchNow(ctx context.Context, sub *calfeed.Subscription) *calfeed.Subscription {
	_, _ = s.calWorker.Refresh(ctx, sub)
	if fresh, err := s.calWorker.Store.Get(ctx, sub.UserID, sub.ID); err == nil {
		return fresh
	}
	return sub
}

func trimTo(p *string, n int) string {
	if p == nil {
		return ""
	}
	v := strings.TrimSpace(*p)
	if len(v) > n {
		v = v[:n]
	}
	return v
}

func (s *Server) handlePatchSubscription(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	var in subscriptionInput
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "body must be a JSON object")
		return
	}
	p := calfeed.Patch{Enabled: in.Enabled}
	if in.URL != nil {
		target, code, msg := s.checkSubscriptionURL(r.Context(), *in.URL)
		if code != "" {
			writeError(w, http.StatusBadRequest, code, msg)
			return
		}
		if !s.calFetchLimiter.allow(uid) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar fetches; try again later")
			return
		}
		p.URL = &target
	}
	if in.Name != nil {
		v := trimTo(in.Name, maxSubscriptionNm)
		p.Name = &v
	}
	if in.Color != nil {
		v := trimTo(in.Color, 32)
		p.Color = &v
	}
	sub, err := s.calWorker.Store.Update(r.Context(), uid, r.PathValue("id"), p)
	if errors.Is(err, calfeed.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar subscription not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if p.URL != nil {
		sub = s.fetchNow(r.Context(), sub)
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscription": sub})
}

func (s *Server) handleDeleteSubscription(w http.ResponseWriter, r *http.Request) {
	err := s.calWorker.Store.Delete(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, calfeed.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar subscription not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRefreshSubscription(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	sub, err := s.calWorker.Store.Get(r.Context(), uid, r.PathValue("id"))
	if errors.Is(err, calfeed.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar subscription not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if !s.calFetchLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar fetches; try again later")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"subscription": s.fetchNow(r.Context(), sub)})
}

func (s *Server) handleCalendarEvents(w http.ResponseWriter, r *http.Request) {
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	f, err1 := time.Parse("2006-01-02", from)
	t, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil || t.Before(f) {
		writeError(w, http.StatusBadRequest, "invalid_input", "from and to must be dates YYYY-MM-DD, from not after to")
		return
	}
	if int(t.Sub(f).Hours()/24)+1 > maxEventDays {
		writeError(w, http.StatusBadRequest, "invalid_input", fmt.Sprintf("ask for at most %d days at a time", maxEventDays))
		return
	}
	uid := userFrom(r.Context()).ID
	events, err := s.calWorker.Store.Events(r.Context(), uid, from, to)
	if err != nil {
		s.internal(w, err)
		return
	}
	subs, err := s.calWorker.Store.List(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	type subInfo struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		Color         string `json:"color"`
		Enabled       bool   `json:"enabled"`
		LastSuccessAt *int64 `json:"lastSuccessAt"`
	}
	info := []subInfo{}
	for _, sub := range subs {
		info = append(info, subInfo{sub.ID, sub.Name, sub.Color, sub.Enabled, sub.LastSuccessAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "subscriptions": info})
}

func (s *Server) handleGetFeed(w http.ResponseWriter, r *http.Request) {
	f, err := s.calWorker.Store.Feed(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"feed": f})
}

func (s *Server) handleRotateFeed(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	had, err := s.calWorker.Store.Feed(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	secret, f, err := s.calWorker.Store.RotateFeed(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if had != nil {
		s.audit.Record(r.Context(), audit.CalendarFeedRotated(uid))
	} else {
		s.audit.Record(r.Context(), audit.CalendarFeedCreated(uid))
	}
	writeJSON(w, http.StatusCreated, map[string]any{"feed": f, "url": s.publicOrigin(r) + "/feeds/" + secret + "/tasks.ics"})
}

func (s *Server) handleRevokeFeed(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	ok, err := s.calWorker.Store.RevokeFeed(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "there is no feed URL to revoke")
		return
	}
	s.audit.Record(r.Context(), audit.CalendarFeedRevoked(uid))
	w.WriteHeader(http.StatusNoContent)
}

// handleTaskFeed serves GET /feeds/{secret}/tasks.ics: the secret is the only
// credential (design D7). Unknown secrets count per address like failed CalDAV
// sign-ins; a valid feed is limited per token.
func (s *Server) handleTaskFeed(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if s.davLimiter.over("feed:" + ip) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts; try again later")
		return
	}
	notFound := func() {
		s.davLimiter.allow("feed:" + ip)
		writeError(w, http.StatusNotFound, "not_found", "no such feed")
	}
	if !s.calendarFeedsEnabled(r.Context()) {
		notFound()
		return
	}
	secret := r.PathValue("secret")
	uid, ok := s.calWorker.Store.FeedUser(r.Context(), secret)
	if !ok {
		notFound()
		return
	}
	sum := sha256.Sum256([]byte(secret))
	if !s.feedLimiter.allow(hex.EncodeToString(sum[:8])) {
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "this feed was fetched too often; try again later")
		return
	}
	ctx := r.Context()
	cursor, err := s.sync.Cursor(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	gen, _ := s.sync.Generation(ctx)
	now := time.Now()
	etag := fmt.Sprintf(`W/"%s-%d-%s"`, gen, cursor, now.UTC().Format("20060102"))
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age="+strconv.Itoa(feedCacheSeconds))
	if match := r.Header.Get("If-None-Match"); match != "" && strings.Contains(match, etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	tasks, err := s.feedTasks(r, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	base := ""
	if s.cfg.BaseURL != nil {
		base = strings.TrimRight(s.cfg.BaseURL.String(), "/")
	}
	body := calfeed.WriteFeed(tasks, calfeed.FeedOptions{Now: now, BaseURL: base, Encrypted: s.encryptionStatus(ctx, uid).Enabled})
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	_, _ = w.Write(body)
}

// feedTasks lists the user's visible open tasks with a due date, like the CalDAV view.
func (s *Server) feedTasks(r *http.Request, uid string) ([]calfeed.FeedTask, error) {
	d := &davRequest{s: s, r: r, user: &auth.User{ID: uid}}
	v, err := d.load()
	if err != nil {
		return nil, err
	}
	var out []calfeed.FeedTask
	for _, t := range v.tasks {
		if !isNullish(t["completed_at"]) {
			continue
		}
		pid := idOf(t["project_id"])
		if pid != "" && !v.calendarVisible(pid) {
			continue
		}
		var due struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
			TZ   *string `json:"tz"`
		}
		if json.Unmarshal(t["due"], &due) != nil || due.Date == "" {
			continue
		}
		id := idOf(t["id"])
		ft := calfeed.FeedTask{ID: id, Title: idOf(t["title"]), Description: idOf(t["description"]), Date: due.Date, Time: due.Time, TZ: due.TZ, Modified: v.modified[id]}
		_ = json.Unmarshal(t["estimate_minutes"], &ft.Estimate)
		_ = json.Unmarshal(t["priority"], &ft.Priority)
		var rule string
		if json.Unmarshal(t["recurrence"], &rule) == nil && rule != "" {
			if parsed, err := recurrence.Parse(rule); err == nil {
				ft.RRULE = parsed.RRULE()
			}
		}
		var labels []string
		_ = json.Unmarshal(t["labels"], &labels)
		for _, l := range labels {
			if name, ok := v.labels[l]; ok && name != "" {
				ft.Labels = append(ft.Labels, name)
			}
		}
		out = append(out, ft)
	}
	return out, nil
}
