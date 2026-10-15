package calfeed

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newStore(t *testing.T) (*Store, *clock) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, u := range []string{"u1", "u2"} {
		if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,1)`, u, u+"@example.com", "h"); err != nil {
			t.Fatal(err)
		}
	}
	c := &clock{t: time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)}
	s := NewStore(db)
	s.now = c.now
	return s, c
}

func TestStoreSubscriptionsAndEvents(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	for i := 0; i < MaxSubscriptions; i++ {
		if _, err := s.Create(ctx, "u1", fmt.Sprintf("https://cal.example/%d.ics", i), "", ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Create(ctx, "u1", "https://cal.example/x.ics", "", ""); !errors.Is(err, ErrLimit) {
		t.Fatalf("eleventh = %v", err)
	}
	list, _ := s.List(ctx, "u1")
	sub := list[0]
	if _, err := s.Get(ctx, "u2", sub.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign id = %v", err)
	}
	// A floating 23:00 event and a zoned one; a replace leaves only the new rows.
	cal, _ := ParseCalendar([]byte("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:late\r\nDTSTART:20261020T230000\r\nDTEND:20261021T003000\r\nSUMMARY:Late show\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nUID:z\r\nDTSTART;TZID=Asia/Tokyo:20261021T080000\r\nDURATION:PT1H\r\nSUMMARY:Tokyo call\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"))
	occ, _ := Expand(cal.Events, StoreWindow(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)), MaxOccurrences)
	if err := s.Success(ctx, sub.ID, &Result{Replaced: true, Occurrences: occ}); err != nil {
		t.Fatal(err)
	}
	ev, err := s.Events(ctx, "u1", "2026-10-20", "2026-10-20")
	if err != nil {
		t.Fatal(err)
	}
	var titles []string
	for _, e := range ev {
		titles = append(titles, e.Summary)
	}
	// The Tokyo call is 23:00 UTC on the 20th: some zone's 20th, so it is included.
	if strings.Join(titles, ",") != "Late show,Tokyo call" {
		t.Fatalf("20th = %v", titles)
	}
	if ev[0].Start.Time == nil || *ev[0].Start.Time != "23:00" || ev[0].Start.TZ != nil {
		t.Fatalf("floating = %+v", ev[0].Start)
	}
	if ev, _ := s.Events(ctx, "u1", "2026-10-19", "2026-10-19"); len(ev) != 0 {
		t.Fatalf("19th = %+v", ev)
	}
	if err := s.Success(ctx, sub.ID, &Result{Replaced: true, Occurrences: occ[:1]}); err != nil {
		t.Fatal(err)
	}
	if ev, _ := s.Events(ctx, "u1", "2026-10-01", "2026-10-31"); len(ev) != 1 {
		t.Fatalf("after replace = %d", len(ev))
	}
	if ev, _ := s.Events(ctx, "u2", "2026-10-01", "2026-10-31"); len(ev) != 0 {
		t.Fatal("another user sees events")
	}
}

func TestFeedToken(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	secret, _, err := s.RotateFeed(ctx, "u1")
	if err != nil || !strings.HasPrefix(secret, FeedPrefix) {
		t.Fatalf("secret %q %v", secret, err)
	}
	if uid, ok := s.FeedUser(ctx, secret); !ok || uid != "u1" {
		t.Fatalf("lookup = %q %v", uid, ok)
	}
	newer, _, _ := s.RotateFeed(ctx, "u1")
	if _, ok := s.FeedUser(ctx, secret); ok {
		t.Fatal("the old secret still works after rotation")
	}
	if _, ok := s.FeedUser(ctx, newer); !ok {
		t.Fatal("the new secret does not work")
	}
	if f, _ := s.Feed(ctx, "u1"); f == nil || f.LastUsedAt == nil {
		t.Fatalf("feed = %+v", f)
	}
	if _, err := s.db.Exec(`INSERT INTO user_status(user_id, deactivated_at) VALUES('u1', 1)`); err == nil {
		if _, ok := s.FeedUser(ctx, newer); ok {
			t.Fatal("a deactivated account's feed works")
		}
	}
	if ok, _ := s.RevokeFeed(ctx, "u1"); !ok {
		t.Fatal("revoke")
	}
	if ok, _ := s.RevokeFeed(ctx, "u1"); ok {
		t.Fatal("second revoke found a token")
	}
}

func serve(t *testing.T, h http.HandlerFunc) *httptest.Server {
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv
}

func localFetcher() *Fetcher {
	f := NewFetcher(func(context.Context) bool { return true }, "test")
	f.now = func() time.Time { return time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC) }
	return f
}

func TestFetchOutcomes(t *testing.T) {
	google, _ := os.ReadFile("testdata/google.ics")
	f := localFetcher()
	ctx := context.Background()
	ok := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"v1"`)
		w.Write(google)
	})
	res, err := f.Fetch(ctx, &Subscription{URL: ok.URL})
	if err != nil || !res.Replaced || res.Name != "Work" || res.ETag != `"v1"` || len(res.Occurrences) == 0 {
		t.Fatalf("200 = %+v %v", res, err)
	}
	if res, err := f.Fetch(ctx, &Subscription{URL: ok.URL, ETag: `"v1"`}); err != nil || res.Replaced {
		t.Fatalf("304 = %+v %v", res, err)
	}
	big := serve(t, func(w http.ResponseWriter, r *http.Request) { w.Write(make([]byte, MaxFeedBytes+1)) })
	if _, err := f.Fetch(ctx, &Subscription{URL: big.URL}); err == nil || err.Error() != "too_large" {
		t.Fatalf("too large = %v", err)
	}
	fail := serve(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	if _, err := f.Fetch(ctx, &Subscription{URL: fail.URL}); err == nil || err.Error() != "http_500" {
		t.Fatalf("500 = %v", err)
	}
	html := serve(t, func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "<html><body>Sign in</body></html>") })
	if _, err := f.Fetch(ctx, &Subscription{URL: html.URL}); err == nil || err.Error() != "invalid_calendar" {
		t.Fatalf("html = %v", err)
	}
	slow := serve(t, func(w http.ResponseWriter, r *http.Request) { time.Sleep(300 * time.Millisecond) })
	quick := localFetcher()
	quick.Client.Timeout = 50 * time.Millisecond
	if _, err := quick.Fetch(ctx, &Subscription{URL: slow.URL}); err == nil || err.Error() != "timeout" {
		t.Fatalf("timeout = %v", err)
	}
	ttl := serve(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "BEGIN:VCALENDAR\r\nX-PUBLISHED-TTL:PT1H\r\nEND:VCALENDAR\r\n")
	})
	if res, err := f.Fetch(ctx, &Subscription{URL: ttl.URL}); err != nil || res.RefreshSeconds == nil || *res.RefreshSeconds != 3600 {
		t.Fatalf("ttl = %+v %v", res, err)
	}
	if u, err := FetchURL("webcal://cal.example/a.ics"); err != nil || u != "https://cal.example/a.ics" {
		t.Fatalf("webcal = %q %v", u, err)
	}
	// Without the owner's permission a local address is a private target.
	strict := NewFetcher(func(context.Context) bool { return false }, "test")
	if _, err := strict.Fetch(ctx, &Subscription{URL: ok.URL}); err == nil || err.Error() != "private_target" {
		t.Fatalf("private = %v", err)
	}
}

func TestWorkerBackoffAndStop(t *testing.T) {
	s, c := newStore(t)
	ctx := context.Background()
	failing := serve(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	google, _ := os.ReadFile("testdata/google.ics")
	healthy := true
	flaky := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if !healthy {
			w.WriteHeader(500)
			return
		}
		w.Write(google)
	})
	notified := 0
	w := &Worker{Store: s, Fetcher: localFetcher(), Notify: func(string) { notified++ }}
	sub, _ := s.Create(ctx, "u1", failing.URL, "", "")
	var gaps []time.Duration
	for i := 0; i < 6; i++ {
		w.RunOnce(ctx)
		got, _ := s.Get(ctx, "u1", sub.ID)
		gaps = append(gaps, time.Duration(got.NextFetchAt-c.t.UnixMilli())*time.Millisecond)
		c.t = time.UnixMilli(got.NextFetchAt).UTC()
	}
	want := []time.Duration{30 * time.Minute, time.Hour, 2 * time.Hour, 4 * time.Hour, 6 * time.Hour, 6 * time.Hour}
	if fmt.Sprint(gaps) != fmt.Sprint(want) {
		t.Fatalf("backoff = %v", gaps)
	}
	// A success resets the interval and notifies; a failure after it starts again at 30 min.
	ok, _ := s.Create(ctx, "u1", flaky.URL, "", "")
	w.RunOnce(ctx)
	got, _ := s.Get(ctx, "u1", ok.ID)
	if got.LastError != "" || got.EventCount == 0 || got.Name != "Work" || notified != 1 {
		t.Fatalf("success = %+v notified %d", got, notified)
	}
	healthy = false
	c.t = time.UnixMilli(got.NextFetchAt).UTC()
	w.RunOnce(ctx)
	got, _ = s.Get(ctx, "u1", ok.ID)
	if got.IntervalSeconds != int64(BackoffStart/time.Second) || got.EventCount == 0 {
		t.Fatalf("after failure = %+v", got)
	}
	// A private target stops the subscription: it is never picked again.
	strict := &Worker{Store: s, Fetcher: NewFetcher(func(context.Context) bool { return false }, "test")}
	p, _ := s.Create(ctx, "u2", flaky.URL, "", "")
	strict.RunOnce(ctx)
	got, _ = s.Get(ctx, "u2", p.ID)
	if got.StoppedReason != "private_target" {
		t.Fatalf("stopped = %+v", got)
	}
	c.t = c.t.Add(48 * time.Hour)
	due, _ := s.Due(ctx, 50)
	for _, d := range due {
		if d.ID == p.ID {
			t.Fatal("a stopped subscription is due")
		}
	}
	// The owner switch off: nothing is fetched.
	off := &Worker{Store: s, Fetcher: localFetcher(), Enabled: func(context.Context) bool { return false }, Notify: func(string) { notified++ }}
	before := notified
	off.RunOnce(ctx)
	if notified != before {
		t.Fatal("fetched while off")
	}
}
