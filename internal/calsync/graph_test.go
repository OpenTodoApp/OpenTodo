package calsync

import (
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync/graphtest"
	"github.com/OpenTodoApp/opentodo/internal/config"
)

// Microsoft connections against the in-process Graph fake (OpenSpec change
// outlook-calendar-sync, tasks 3.2 and 4.1–4.5). Nothing leaves the machine.

// microsoft connects alice's Outlook account through the fake, writing into
// its calendar "cal-work"; zone is the mailbox's Windows time zone.
func (h *harness) microsoft(zone string) (*graphtest.Server, *Connection) {
	h.t.Helper()
	ms := graphtest.New()
	h.t.Cleanup(ms.Close)
	ms.Now = func() time.Time { return h.clock }
	ms.MailboxZone = zone
	h.w.Microsoft.Env = config.MicrosoftConfig{ClientID: ms.ClientID, ClientSecret: ms.ClientSecret}
	h.w.MicrosoftToken.Login = ms.URL
	h.w.GraphBase = ms.GraphBase()
	client, err := h.w.Microsoft.Client(h.ctx)
	if err != nil || !client.Complete() || client.Tenant != DefaultTenant {
		h.t.Fatalf("client = %+v %v", client, err)
	}
	tok, err := h.w.MicrosoftToken.Exchange(h.ctx, client, ms.Code, "verifier", "https://todo.example/cb")
	if err != nil || tok.Refresh == "" {
		h.t.Fatalf("exchange = %+v %v", tok, err)
	}
	acct, err := h.w.DiscoverMicrosoft(h.ctx, tok.Access)
	if err != nil {
		h.t.Fatalf("discover: %v", err)
	}
	c, err := h.w.Store.Create(h.ctx, &Connection{UserID: "alice", Provider: ProviderMicrosoft, Name: "Outlook", ServerURL: h.w.GraphBase,
		Username: acct.Address, HomeURL: h.w.GraphBase, Calendars: acct.Calendars})
	if err != nil {
		h.t.Fatal(err)
	}
	if err := h.w.Secrets.Set(c.ID, tok.Refresh); err != nil {
		h.t.Fatal(err)
	}
	h.w.RememberToken(c.ID, *tok)
	target := "cal-work"
	if c, err = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{TargetURL: &target}); err != nil {
		h.t.Fatal(err)
	}
	return ms, c
}

// later moves the clock on, as between two cycles.
func (h *harness) later(d time.Duration) { h.clock = h.clock.Add(d) }

func TestGraphDiscovery(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("Pacific Standard Time")
	ms.AddCalendar(&graphtest.Calendar{ID: "cal-holidays", Name: "Holidays", Color: "#00ff00"})
	if err := h.w.Rediscover(h.ctx, c); err != nil {
		t.Fatal(err)
	}
	c = h.conn(c.ID)
	if c.Username != "me@outlook.com" || len(c.Calendars) != 2 {
		t.Fatalf("connection = %+v", c)
	}
	work, hol := c.Calendars[0], c.Calendars[1]
	if work.URL != "cal-work" || work.ReadOnly || work.TimeZone != "America/Los_Angeles" || work.Color != "#3366cc" ||
		hol.Name != "Holidays" || !hol.ReadOnly {
		t.Fatalf("calendars = %+v", c.Calendars)
	}
}

func TestGraphTimedTaskAndDrag(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Write report", "description": "Draft first",
		"due": map[string]string{"date": "2026-11-03", "time": "09:00", "tz": "Europe/Berlin"}, "estimate_minutes": 45})
	if n := h.cycle(h.conn(c.ID)); n.Written != 1 {
		t.Fatalf("first cycle = %+v", n)
	}
	evs := ms.ByTask("t1")
	if len(evs) != 1 {
		t.Fatalf("events = %+v", evs)
	}
	ev := evs[0]
	if ev.Subject != "Write report" || ev.Body != "Draft first" || ev.Start.DateTime != "2026-11-03T09:00:00" || ev.End.DateTime != "2026-11-03T09:45:00" ||
		ev.Start.TimeZone != "W. Europe Standard Time" || ev.IsAllDay || !strings.HasPrefix(ev.TransactionID, "opentodo-"+c.ID+"-t1") {
		t.Fatalf("event = %+v", ev)
	}
	for _, p := range ms.Prefers() {
		if !strings.Contains(p, `IdType="ImmutableId"`) {
			t.Fatalf("prefer = %q", p)
		}
	}
	// Nothing changed: no write the second time.
	if n := h.cycle(h.conn(c.ID)); n.Written != 0 || n.Moved != 0 {
		t.Fatalf("idle cycle = %+v", n)
	}
	// Dragged in Outlook on the web to 14:00 the next day.
	h.later(time.Minute)
	ms.Change(ev.ID, func(e *graphtest.Event) {
		e.Start = graphtest.DT{DateTime: "2026-11-04T14:00:00.0000000", TimeZone: "W. Europe Standard Time"}
		e.End = graphtest.DT{DateTime: "2026-11-04T14:45:00.0000000", TimeZone: "W. Europe Standard Time"}
	})
	if n := h.cycle(h.conn(c.ID)); n.Moved != 1 || n.Written != 0 {
		t.Fatalf("drag cycle = %+v", n)
	}
	if d := due(h.get("alice", "t1")); d["date"] != "2026-11-04" || d["time"] != "14:00" || d["tz"] != "Europe/Berlin" {
		t.Fatalf("due = %v", d)
	}
	// Renamed in Outlook: the title follows.
	h.later(time.Minute)
	ms.Change(ev.ID, func(e *graphtest.Event) { e.Subject = "Write the report" })
	h.cycle(h.conn(c.ID))
	if title := str(h.get("alice", "t1")["title"]); title != "Write the report" {
		t.Fatalf("title = %q", title)
	}
	// Removed in Outlook: the task loses its date.
	h.later(time.Minute)
	ms.Delete(ev.ID)
	if n := h.cycle(h.conn(c.ID)); n.Unscheduled != 1 {
		t.Fatalf("delete cycle = %+v", n)
	}
	if raw := string(h.get("alice", "t1")["due"]); raw != "null" && raw != "" {
		t.Fatalf("due after delete = %s", raw)
	}
}

func TestGraphFloatingAndAllDayRoundTrip(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("Pacific Standard Time")
	dateOnly := true
	if _, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{IncludeDateOnly: &dateOnly}); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "float", map[string]any{"title": "Call", "due": map[string]string{"date": "2026-11-05", "time": "08:30"}})
	h.task("alice", "day", map[string]any{"title": "Birthday", "due": map[string]string{"date": "2026-11-06"}})
	h.cycle(h.conn(c.ID))
	fl, day := ms.ByTask("float"), ms.ByTask("day")
	if len(fl) != 1 || fl[0].Start.DateTime != "2026-11-05T08:30:00" || fl[0].Start.TimeZone != "Pacific Standard Time" {
		t.Fatalf("floating = %+v", fl)
	}
	if len(day) != 1 || !day[0].IsAllDay || day[0].Start.DateTime != "2026-11-06T00:00:00" || day[0].End.DateTime != "2026-11-07T00:00:00" {
		t.Fatalf("all-day = %+v", day)
	}
	h.later(time.Minute)
	ms.Change(fl[0].ID, func(e *graphtest.Event) {
		e.Start = graphtest.DT{DateTime: "2026-11-05T10:00:00", TimeZone: "Pacific Standard Time"}
		e.End = graphtest.DT{DateTime: "2026-11-05T10:30:00", TimeZone: "Pacific Standard Time"}
	})
	ms.Change(day[0].ID, func(e *graphtest.Event) {
		e.Start = graphtest.DT{DateTime: "2026-11-08T00:00:00", TimeZone: "Pacific Standard Time"}
		e.End = graphtest.DT{DateTime: "2026-11-09T00:00:00", TimeZone: "Pacific Standard Time"}
	})
	if n := h.cycle(h.conn(c.ID)); n.Moved != 2 {
		t.Fatalf("moves = %+v", n)
	}
	if d := due(h.get("alice", "float")); d["date"] != "2026-11-05" || d["time"] != "10:00" || d["tz"] != "" {
		t.Fatalf("floating due = %v", d)
	}
	if d := due(h.get("alice", "day")); d["date"] != "2026-11-08" || d["time"] != "" {
		t.Fatalf("all-day due = %v", d)
	}
}

func TestGraphUnknownMailboxZoneIsUTC(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("")
	if c.mailboxZone() != "" {
		t.Fatalf("zone = %q", c.mailboxZone())
	}
	h.task("alice", "t1", map[string]any{"title": "Call", "due": map[string]string{"date": "2026-11-05", "time": "08:30"}})
	h.cycle(h.conn(c.ID))
	if ev := ms.ByTask("t1"); len(ev) != 1 || ev[0].Start.TimeZone != "UTC" || ev[0].Start.DateTime != "2026-11-05T08:30:00" {
		t.Fatalf("events = %+v", ev)
	}
}

func TestGraphOtherEventsUntouched(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	meeting := ms.Add(graphtest.Event{Calendar: "cal-work", Subject: "Team meeting",
		Start: graphtest.DT{DateTime: "2026-10-21T10:00:00", TimeZone: "UTC"}, End: graphtest.DT{DateTime: "2026-10-21T11:00:00", TimeZone: "UTC"}})
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-21", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	h.later(time.Minute)
	ms.Change(meeting, func(e *graphtest.Event) { e.Subject = "Team meeting (moved)" })
	h.cycle(h.conn(c.ID))
	for _, r := range ms.Requests() {
		if strings.Contains(r, meeting) && !strings.HasPrefix(r, "GET") {
			t.Fatalf("the meeting was written: %s", r)
		}
	}
	if list, _ := h.sync.List(h.ctx, "alice", "task", false); len(list) != 1 {
		t.Fatalf("tasks = %d (the meeting must not become a task)", len(list))
	}
	events, err := h.w.Feeds.EventsOf(h.ctx, "alice", "2026-10-20", "2026-10-25", false, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Summary != "Team meeting (moved)" {
		t.Fatalf("shown events = %+v (OpenTodo's own events are left out)", events)
	}
}

func TestGraphRetriedCreateMakesOneEvent(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	ms.LoseCreates(1)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("a lost answer must fail the cycle")
	}
	h.later(10 * time.Minute)
	h.cycle(h.conn(c.ID))
	if evs := ms.ByTask("t1"); len(evs) != 1 {
		t.Fatalf("events = %d, want 1", len(evs))
	}
	h.later(10 * time.Minute)
	if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
		t.Fatalf("third cycle = %+v", n)
	}
}

func TestGraphConcurrentChangeIsNotForced(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	h.edit("alice", "t1", map[string]any{"title": "Plan the week"})
	ms.RaceNextPatch()
	if n := h.cycle(h.conn(c.ID)); !n.Partial || n.Written != 0 {
		t.Fatalf("raced cycle = %+v", n)
	}
	if ev := ms.ByTask("t1"); ev[0].Subject != "Plan" {
		t.Fatalf("the write was forced: %+v", ev)
	}
	h.later(time.Minute)
	if n := h.cycle(h.conn(c.ID)); n.Written != 1 {
		t.Fatalf("next cycle = %+v", n)
	}
	if ev := ms.ByTask("t1"); ev[0].Subject != "Plan the week" {
		t.Fatalf("event = %+v", ev)
	}
}

func TestGraphCursorRebuilds(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	cur, err := h.w.Store.Cursor(h.ctx, c.ID, "cal-work")
	if err != nil || cur == nil || !strings.Contains(cur.DeltaLink, "deltatoken") {
		t.Fatalf("cursor = %+v %v", cur, err)
	}
	// The stored link is followed next time.
	h.later(time.Minute)
	h.cycle(h.conn(c.ID))
	if n := ms.CountContaining("$deltatoken"); n == 0 {
		t.Fatal("the delta link was not used")
	}
	// Microsoft no longer accepts it: a full listing, the same result.
	ms.ExpireDeltas = true
	h.later(time.Minute)
	id := ms.ByTask("t1")[0].ID
	ms.Change(id, func(e *graphtest.Event) {
		e.Start = graphtest.DT{DateTime: "2026-10-23T07:00:00", TimeZone: "UTC"}
		e.End = graphtest.DT{DateTime: "2026-10-23T07:30:00", TimeZone: "UTC"}
	})
	if n := h.cycle(h.conn(c.ID)); n.Moved != 1 || n.Written != 0 {
		t.Fatalf("rebuilt cycle = %+v", n)
	}
	ms.ExpireDeltas = false
	if d := due(h.get("alice", "t1")); d["date"] != "2026-10-23" || d["time"] != "09:00" {
		t.Fatalf("due = %v (07:00 UTC is 09:00 in Berlin)", d)
	}
	if n := ms.Count("POST /v1.0/me/calendars/cal-work/events"); n != 1 || len(ms.ByTask("t1")) != 1 {
		t.Fatalf("creates = %d (no duplicate)", n)
	}
	// The window moved by a day: rebuilt from a fresh listing.
	starts := func() int { return ms.CountContaining("calendarView/delta?endDateTime") }
	before := starts()
	h.later(24 * time.Hour)
	h.cycle(h.conn(c.ID))
	if starts() <= before {
		t.Fatal("the cursor was not rebuilt after the window moved")
	}
	if cur, _ := h.w.Store.Cursor(h.ctx, c.ID, "cal-work"); cur.From != calfeedWindowFrom(h.clock) {
		t.Fatalf("cursor window = %+v", cur)
	}
}

func TestGraphEncryptedAccount(t *testing.T) {
	h := newHarness(t)
	if _, err := h.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES('alice', 1, 1, 's', 1, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	ms, c := h.microsoft("W. Europe Standard Time")
	h.task("alice", "t1", map[string]any{"title": "Secret plan", "description": "Hidden", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	h.cycle(h.conn(c.ID))
	ev := ms.ByTask("t1")[0]
	if ev.Subject != "Encrypted item" || ev.Body != "" {
		t.Fatalf("event = %+v", ev)
	}
	h.later(time.Minute)
	ms.Change(ev.ID, func(e *graphtest.Event) {
		e.Subject = "Renamed"
		e.Start = graphtest.DT{DateTime: "2026-11-03T10:00:00", TimeZone: "W. Europe Standard Time"}
		e.End = graphtest.DT{DateTime: "2026-11-03T10:30:00", TimeZone: "W. Europe Standard Time"}
	})
	h.cycle(h.conn(c.ID))
	task := h.get("alice", "t1")
	if str(task["title"]) != "Secret plan" || due(task)["time"] != "10:00" {
		t.Fatalf("task = %v %v", str(task["title"]), due(task))
	}
}

func TestGraphThrottled(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	for _, id := range []string{"a", "b", "c"} {
		h.task("alice", id, map[string]any{"title": id, "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	}
	// The delta listing and two creations pass; the third creation is throttled.
	ms.ThrottleAfter(3, 1, 429, "120")
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil || err.(*CycleError).Reason != ReasonRateLimited {
		t.Fatalf("cycle = %v", err)
	}
	got := h.conn(c.ID)
	if got.LastError != ReasonRateLimited || got.NextSyncAt < h.clock.Add(5*time.Minute).UnixMilli() {
		t.Fatalf("connection = %+v", got)
	}
	if n := len(ms.ByTask("a")) + len(ms.ByTask("b")) + len(ms.ByTask("c")); n != 2 {
		t.Fatalf("events written before = %d", n)
	}
	links, _ := h.w.Store.Links(h.ctx, c.ID)
	if len(links) != 2 {
		t.Fatalf("links = %d (what was written is kept)", len(links))
	}
	// A 503 is waited out the same way.
	ms.Throttle(1, 503, "600")
	h.later(10 * time.Minute)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("503 must fail the cycle")
	}
	if got := h.conn(c.ID); got.NextSyncAt < h.clock.Add(10*time.Minute).UnixMilli() {
		t.Fatalf("next = %d, want ≥ now+10m (backoff doubled, Retry-After 10m)", got.NextSyncAt)
	}
}

func TestGraphRefreshRotatesAndRevoked(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	old, _ := h.w.Secrets.Get(c.ID)
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	h.later(2 * time.Hour) // the access token from the sign-in expired
	h.cycle(h.conn(c.ID))
	rotated, _ := h.w.Secrets.Get(c.ID)
	if ms.Refreshes() != 1 || rotated == old || !ms.ValidRefresh(rotated) {
		t.Fatalf("refresh token = %q (was %q), %d refreshes", rotated, old, ms.Refreshes())
	}
	h.cycle(h.conn(c.ID))
	if ms.Refreshes() != 1 {
		t.Fatalf("refreshes = %d (the access token is cached)", ms.Refreshes())
	}
	// The user removed OpenTodo's access.
	ms.Revoked = true
	h.later(2 * time.Hour)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("cycle with a revoked grant succeeded")
	}
	if got := h.conn(c.ID); got.State() != StateReconnect {
		t.Fatalf("state = %s", got.State())
	}
}

func TestGraphClientSecretRefused(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	// A second Microsoft connection of bob.
	tok, err := h.w.MicrosoftToken.Exchange(h.ctx, MicrosoftClient{ID: ms.ClientID, Secret: ms.ClientSecret, Tenant: "common"}, ms.Code, "v", "https://x/cb")
	if err != nil {
		t.Fatal(err)
	}
	other, err := h.w.Store.Create(h.ctx, &Connection{UserID: "bob", Provider: ProviderMicrosoft, ServerURL: h.w.GraphBase, Calendars: c.Calendars})
	if err != nil {
		t.Fatal(err)
	}
	_ = h.w.Secrets.Set(other.ID, tok.Refresh)
	target := "cal-work"
	_, _ = h.w.Store.Update(h.ctx, "bob", other.ID, Patch{TargetURL: &target})

	ms.RefuseClient = true
	h.later(2 * time.Hour)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil || err.(*CycleError).Reason != ReasonMicrosoftClient {
		t.Fatalf("cycle = %v", err)
	}
	for _, id := range []string{c.ID, other.ID} {
		if got := h.conn(id); got.StoppedReason != ReasonMicrosoftClient || got.State() != StateStopped {
			t.Fatalf("%s = %q %s", id, got.StoppedReason, got.State())
		}
	}
	client, _ := h.w.Microsoft.Client(h.ctx)
	if client.RefusedAt == 0 {
		t.Fatal("the refusal is not shown to the owner")
	}
	// Enabling the connection again does not clear an owner's stop.
	off, on := false, true
	_, _ = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{Enabled: &off})
	_, _ = h.w.Store.Update(h.ctx, "alice", c.ID, Patch{Enabled: &on})
	if got := h.conn(c.ID); got.StoppedReason != ReasonMicrosoftClient {
		t.Fatalf("after re-enabling = %q", got.StoppedReason)
	}
	// The owner saves a new secret: every connection resumes now.
	ms.RefuseClient = false
	h.w.Microsoft.Env = config.MicrosoftConfig{}
	secret := ms.ClientSecret
	if err := h.w.Microsoft.Save(h.ctx, ms.ClientID, "", &secret); err != nil {
		t.Fatal(err)
	}
	if err := h.w.MicrosoftClientSaved(h.ctx); err != nil {
		t.Fatal(err)
	}
	if client, _ := h.w.Microsoft.Client(h.ctx); client.RefusedAt != 0 || !client.Complete() {
		t.Fatalf("client = %+v", client)
	}
	for _, id := range []string{c.ID, other.ID} {
		if got := h.conn(id); got.StoppedReason != "" || got.NextSyncAt > h.clock.UnixMilli() {
			t.Fatalf("%s not resumed: %+v", id, got)
		}
	}
	h.cycle(h.conn(c.ID))
}

func TestGraphCalendarMissingAndReadOnly(t *testing.T) {
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	h.cycle(h.conn(c.ID))
	ms.SetCanEdit("cal-work", false)
	h.task("alice", "t1", map[string]any{"title": "Plan", "due": map[string]string{"date": "2026-10-22", "time": "09:00"}})
	h.later(time.Minute)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("a read-only target must stop the cycle")
	}
	if got := h.conn(c.ID); got.StoppedReason != ReasonCalendarReadOnly {
		t.Fatalf("stopped = %q", got.StoppedReason)
	}
	// Choosing another calendar clears the stop.
	ms.AddCalendar(&graphtest.Calendar{ID: "cal-two", Name: "Two", CanEdit: true})
	if err := h.w.Rediscover(h.ctx, h.conn(c.ID)); err != nil {
		t.Fatal(err)
	}
	two := "cal-two"
	if got, _ := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{TargetURL: &two}); got.StoppedReason != "" {
		t.Fatalf("after choosing = %q", got.StoppedReason)
	}
	ms.RemoveCalendar("cal-two")
	h.later(time.Minute)
	if _, err := h.w.Cycle(h.ctx, h.conn(c.ID)); err == nil {
		t.Fatal("a missing target must stop the cycle")
	}
	if got := h.conn(c.ID); got.StoppedReason != ReasonCalendarMissing {
		t.Fatalf("stopped = %q", got.StoppedReason)
	}
}

func calfeedWindowFrom(now time.Time) int64 { return calfeed.StoreWindow(now).From.UnixMilli() }
