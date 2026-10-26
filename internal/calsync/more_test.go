package calsync

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/calsync/calsynctest"
	"github.com/pixari/opentodo/internal/config"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// fakeTokens is Google's token endpoint: it trades codes and refresh tokens
// for access tokens, and refuses a revoked refresh token with invalid_grant.
type fakeTokens struct {
	*httptest.Server
	refreshes atomic.Int32
	revoked   atomic.Bool
	lastForm  atomic.Value
}

func newFakeTokens(t *testing.T) *fakeTokens {
	f := &fakeTokens{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.lastForm.Store(r.PostForm)
		w.Header().Set("Content-Type", "application/json")
		if r.PostForm.Get("client_id") != "cid" || r.PostForm.Get("client_secret") != "csecret" {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_client"})
			return
		}
		switch r.PostForm.Get("grant_type") {
		case "authorization_code":
			if r.PostForm.Get("code") != "the-code" || r.PostForm.Get("code_verifier") == "" {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600})
		case "refresh_token":
			f.refreshes.Add(1)
			if f.revoked.Load() || r.PostForm.Get("refresh_token") != "refresh-1" {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_grant"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access-1", "expires_in": 3600})
		}
	}))
	t.Cleanup(f.Close)
	return f
}

func TestGoogleTokenExchangeAndRefresh(t *testing.T) {
	h := newHarness(t)
	tokens := newFakeTokens(t)
	h.w.Google.Env = config.GoogleConfig{ClientID: "cid", ClientSecret: "csecret"}
	h.w.Token.URL = tokens.URL
	h.w.GoogleBase = h.srv.URL + "/dav/"
	h.srv.Bearer = "access-1"

	verifier, challenge := PKCE()
	auth := AuthorizationURL(GoogleAuthURL, "cid", "https://todo.example/api/v1/calendar-sync/google/callback", "st", challenge)
	q, _ := url.Parse(auth)
	if q.Query().Get("code_challenge_method") != "S256" || q.Query().Get("access_type") != "offline" || q.Query().Get("scope") != GoogleScope {
		t.Fatalf("authorization url = %s", auth)
	}
	client, _ := h.w.Google.Client(h.ctx)
	tok, err := h.w.Token.Exchange(h.ctx, client, "the-code", verifier, "https://todo.example/cb")
	if err != nil || tok.Refresh != "refresh-1" || tok.Access != "access-1" {
		t.Fatalf("exchange = %+v %v", tok, err)
	}
	d, err := h.w.DiscoverGoogle(h.ctx, tok.Access)
	if err != nil || len(d.Calendars) != 1 {
		t.Fatalf("discover = %+v %v", d, err)
	}
	c, err := h.w.Store.Create(h.ctx, &Connection{UserID: "alice", Provider: ProviderGoogle, Name: "Google", ServerURL: GoogleCalDAV, Calendars: d.Calendars})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.w.Secrets.Set(c.ID, tok.Refresh); err != nil {
		t.Fatal(err)
	}
	target := d.Calendars[0].URL
	if _, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{TargetURL: &target}); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "t1", map[string]any{"title": "Standup", "due": map[string]string{"date": "2026-10-21", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	h.cycle(h.conn(c.ID))
	if tokens.refreshes.Load() != 1 || h.srv.Get("work", "t1.ics") == "" {
		t.Fatalf("refreshes = %d (the access token is cached)", tokens.refreshes.Load())
	}
	// An expired access token is refreshed; a revoked grant asks to reconnect.
	h.clock = h.clock.Add(2 * time.Hour)
	tokens.revoked.Store(true)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("cycle with a revoked grant succeeded")
	}
	if got := h.conn(c.ID); got.State() != StateReconnect {
		t.Fatalf("state = %s", got.State())
	}
}

func TestShownCalendarsBecomeEvents(t *testing.T) {
	h := newHarness(t)
	h.srv.AddCalendar("family", &calsynctest.Calendar{Name: "Family", Color: "#FF0000"})
	h.srv.Put("family", "bday.ics", event("bday", "Birthday", "DTSTART:20261022T180000Z", "DTEND:20261022T200000Z", h.clock))
	h.srv.Put("work", "meeting.ics", event("meeting", "Team meeting", "DTSTART:20261021T100000Z", "DTEND:20261021T110000Z", h.clock))
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-21", "time": "09:00"}})
	c := h.connect(false)
	reads := []string{h.srv.CalendarURL("family")}
	if _, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{ReadURLs: &reads}); err != nil {
		t.Fatal(err)
	}
	h.cycle(h.conn(c.ID))
	events, err := h.w.Feeds.EventsOf(h.ctx, "alice", "2026-10-20", "2026-10-25", false, true)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range events {
		names = append(names, e.Summary)
	}
	if strings.Join(names, ",") != "Team meeting,Birthday" {
		t.Fatalf("events = %v (OpenTodo's own events must be left out)", names)
	}
	// Managed subscriptions never show up as the user's subscriptions.
	if list, _ := h.w.Feeds.List(h.ctx, "alice"); len(list) != 0 {
		t.Fatalf("subscriptions = %+v", list)
	}
	managed, _ := h.w.Feeds.Managed(h.ctx, "alice")
	if len(managed) != 2 || managed[1].Name != "Fake · Family" || managed[1].Color != "#FF0000" {
		t.Fatalf("managed = %+v", managed)
	}
	// Unchanged calendars are not read again (the cycle after OpenTodo's own
	// writes reads the target once more).
	h.cycle(h.conn(c.ID))
	reports := h.srv.Count("REPORT")
	h.cycle(h.conn(c.ID))
	if got := h.srv.Count("REPORT") - reports; got != 0 {
		t.Fatalf("an unchanged cycle sent %d REPORTs", got)
	}
	// Deleting the connection deletes its shown calendars.
	if err := h.w.Store.Delete(h.ctx, "alice", c.ID); err != nil {
		t.Fatal(err)
	}
	if managed, _ := h.w.Feeds.Managed(h.ctx, "alice"); len(managed) != 0 {
		t.Fatalf("managed after delete = %+v", managed)
	}
}

func TestObserveSchedulesSoon(t *testing.T) {
	h := newHarness(t)
	c := h.connect(false)
	h.cycle(c)
	before := h.conn(c.ID).NextSyncAt
	// A calendar sync write does not trigger another cycle.
	h.w.Observe(h.ctx, []opsync.Change{{UserID: "alice", ScopeID: "user:alice", Entity: "task", EntityID: "t1", Fields: map[string]opsync.FieldChange{"due": {}}, Origin: Device(c.ID)}})
	if h.conn(c.ID).NextSyncAt != before {
		t.Fatal("a calendar sync change scheduled a cycle")
	}
	h.w.Observe(h.ctx, []opsync.Change{{UserID: "alice", ScopeID: "user:alice", Entity: "task", EntityID: "t1", Fields: map[string]opsync.FieldChange{"title": {}}, Origin: "phone"}})
	if got := h.conn(c.ID).NextSyncAt; got != h.clock.Add(Debounce).UnixMilli() {
		t.Fatalf("next = %d, want %d", got, h.clock.Add(Debounce).UnixMilli())
	}
}

func TestSecretsSweepKeepsGoogleClient(t *testing.T) {
	h := newHarness(t)
	c := h.connect(false)
	for k, v := range map[string]string{"gone": "x", GoogleSecretKey: "csecret"} {
		if err := h.w.Secrets.Set(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := h.w.Secrets.Sweep(h.ctx, h.w.Store); err != nil || n != 1 {
		t.Fatalf("sweep = %d %v", n, err)
	}
	has, _ := h.w.Secrets.Has(c.ID, GoogleSecretKey, "gone")
	if !has[c.ID] || !has[GoogleSecretKey] || has["gone"] {
		t.Fatalf("secrets = %v", has)
	}
}

func TestOAuthStateIsSingleUse(t *testing.T) {
	h := newHarness(t)
	hash := StateHash("abc")
	if err := h.w.Store.PutState(h.ctx, hash, OAuthState{UserID: "alice", Verifier: "v", RedirectURI: "r"}, StateTTL); err != nil {
		t.Fatal(err)
	}
	st, err := h.w.Store.TakeState(h.ctx, hash)
	if err != nil || st.UserID != "alice" || st.Verifier != "v" {
		t.Fatalf("take = %+v %v", st, err)
	}
	if _, err := h.w.Store.TakeState(h.ctx, hash); err != ErrNotFound {
		t.Fatalf("second take = %v", err)
	}
	_ = h.w.Store.PutState(h.ctx, StateHash("old"), OAuthState{UserID: "alice", Verifier: "v", RedirectURI: "r"}, StateTTL)
	h.clock = h.clock.Add(StateTTL + time.Second)
	if _, err := h.w.Store.TakeState(h.ctx, StateHash("old")); err != ErrNotFound {
		t.Fatalf("expired take = %v", err)
	}
}

func TestConnectionLimit(t *testing.T) {
	h := newHarness(t)
	for i := 0; i < MaxConnections; i++ {
		if _, err := h.w.Store.Create(h.ctx, &Connection{UserID: "bob", Provider: ProviderCalDAV, ServerURL: "https://x.example"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.w.Store.Create(h.ctx, &Connection{UserID: "bob", Provider: ProviderCalDAV, ServerURL: "https://x.example"}); err != ErrLimit {
		t.Fatalf("fourth = %v", err)
	}
}

func TestEventSnapshotZones(t *testing.T) {
	h := newHarness(t)
	_ = h
	// A floating task moved in a calendar that answers in UTC takes the calendar's wall time.
	berlin, _ := time.LoadLocation("Europe/Berlin")
	body := event("t", "X", "DTSTART:20261021T080000Z", "DTEND:20261021T090000Z", time.Now())
	ev, _ := masterEvent([]byte(body))
	s := EventSnapshot(ev, Snapshot{Date: "2026-10-21", Time: "09:00", Minutes: 30}, berlin)
	if s.Date != "2026-10-21" || s.Time != "10:00" || s.TZ != "" || s.Minutes != 60 {
		t.Fatalf("floating = %+v", s)
	}
	// A zoned task keeps its zone.
	s = EventSnapshot(ev, Snapshot{Date: "2026-10-21", Time: "09:00", TZ: "America/New_York", Minutes: 30}, nil)
	if s.Time != "04:00" || s.TZ != "America/New_York" {
		t.Fatalf("zoned = %+v", s)
	}
	// An all-day event is a date-only due.
	ev, _ = masterEvent([]byte(event("t", "X", "DTSTART;VALUE=DATE:20261023", "DTEND;VALUE=DATE:20261024", time.Now())))
	if s := EventSnapshot(ev, Snapshot{Date: "2026-10-21", Time: "09:00"}, nil); !s.AllDay || s.Date != "2026-10-23" || string(s.Due()) != `{"date":"2026-10-23"}` {
		t.Fatalf("all-day = %+v %s", s, s.Due())
	}
}
