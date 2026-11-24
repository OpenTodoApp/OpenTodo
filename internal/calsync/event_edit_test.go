package calsync

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// editFix is alice's CalDAV connection showing the calendar "home", with
// "Edit events in OpenTodo" on (calendar-event-edits).
type editFix struct {
	*harness
	c        *Connection
	notified int
	mu       sync.Mutex
}

func newEditFix(t *testing.T) *editFix {
	t.Helper()
	h := newHarness(t)
	h.srv.Addresses = []string{"mailto:Me@Example.org"}
	h.srv.AddCalendar("home", &calsynctest.Calendar{Name: "Home"})
	f := &editFix{harness: h}
	h.w.Notify = func(string) { f.mu.Lock(); f.notified++; f.mu.Unlock() }
	c := h.connect(false)
	read, on := []string{h.srv.CalendarURL("home")}, true
	c, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{ReadURLs: &read, EditEvents: &on})
	if err != nil {
		t.Fatal(err)
	}
	f.c = c
	return f
}

const plain = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fake//EN\r\nX-WR-CALNAME:Home\r\nBEGIN:VEVENT\r\nUID:standup\r\nDTSTAMP:20261001T000000Z\r\n" +
	"SEQUENCE:3\r\nSUMMARY:Standup\r\nDESCRIPTION:Daily\\, short\r\nX-CUSTOM;X-P=1:kept\r\nDTSTART;TZID=Europe/Berlin:20261112T090000\r\nDTEND;TZID=Europe/Berlin:20261112T093000\r\n" +
	"BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT10M\r\nDESCRIPTION:Soon\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"

// add stores an object in "home" and reads the calendar again.
func (f *editFix) add(member, data string) {
	f.t.Helper()
	f.srv.Put("home", member, data)
	f.cycle(f.conn(f.c.ID))
}

// row is the cached event with uid, as the events route serves it.
func (f *editFix) row(uid string) calfeed.EventRow {
	f.t.Helper()
	rows, err := f.w.Feeds.EventsOf(f.ctx, "alice", "2026-10-01", "2027-01-31", false, true)
	if err != nil {
		f.t.Fatal(err)
	}
	for i := range rows {
		if rows[i].UID == uid {
			Decorate([]*calfeed.EventRow{&rows[i]}, []Connection{*f.conn(f.c.ID)})
			return rows[i]
		}
	}
	f.t.Fatalf("no cached event %s", uid)
	return calfeed.EventRow{}
}

func (f *editFix) gone(uid string) bool {
	rows, _ := f.w.Feeds.EventsOf(f.ctx, "alice", "2026-10-01", "2027-01-31", false, true)
	for _, r := range rows {
		if r.UID == uid {
			return false
		}
	}
	return true
}

func when(t *testing.T, date, start, end, tz string) *EventWhen {
	t.Helper()
	var z *string
	if tz != "" {
		z = &tz
	}
	w, err := WhenOf(calfeed.When{Date: date, Time: &start, TZ: z}, calfeed.When{Date: date, Time: &end, TZ: z}, false)
	if err != nil {
		t.Fatal(err)
	}
	return &w
}

func (f *editFix) edit(r calfeed.EventRow, e EventEdit, by *Assistant) (*EventResult, error) {
	return f.w.EditEvent(f.ctx, EditRequest{UserID: "alice", ConnID: f.c.ID, EventID: r.ID, Rev: r.Rev, Edit: e, Assistant: by})
}

func code(err error) string {
	var e *EventError
	if errors.As(err, &e) {
		return e.Code + ":" + e.Reason
	}
	if err == nil {
		return ""
	}
	return "error:" + err.Error()
}

// props lists a component tree's property names, VEVENT first, for comparing
// what an edit changed.
func props(t *testing.T, data string) map[string]string {
	t.Helper()
	root, err := caldav.Parse([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	var walk func(prefix string, c *caldav.Component)
	walk = func(prefix string, c *caldav.Component) {
		for _, p := range c.Props {
			out[prefix+c.Name+"."+p.Name] += p.Line() + "|"
		}
		for _, ch := range c.Children {
			walk(prefix+c.Name+"/", ch)
		}
	}
	walk("", root)
	return out
}

func TestEditEventMoveKeepsEverythingElse(t *testing.T) {
	f := newEditFix(t)
	f.add("standup.ics", plain)
	r := f.row("standup")
	if r.Access == nil || !r.Access.Update || !r.Access.Delete || r.Rev == "" {
		t.Fatalf("access = %+v rev %q, want editable", r.Access, r.Rev)
	}
	before := props(t, f.srv.Get("home", "standup.ics"))
	puts, notified := f.srv.Count(http.MethodPut), f.notified
	res, err := f.edit(r, EventEdit{When: when(t, "2026-11-12", "10:00", "10:30", "Europe/Berlin")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Replaces != r.ID || res.Event.ID == r.ID || res.Event.Rev == r.Rev || *res.Event.Start.Time != "10:00" || *res.Event.Start.TZ != "Europe/Berlin" {
		t.Fatalf("result = %+v", res)
	}
	if f.srv.Count(http.MethodPut)-puts != 1 || f.notified-notified != 1 {
		t.Fatalf("puts %d, notified %d; want one each", f.srv.Count(http.MethodPut)-puts, f.notified-notified)
	}
	after := props(t, f.srv.Get("home", "standup.ics"))
	for k, v := range before {
		switch k {
		case "VCALENDAR/VEVENT.DTSTART", "VCALENDAR/VEVENT.DTEND", "VCALENDAR/VEVENT.SEQUENCE", "VCALENDAR/VEVENT.DTSTAMP", "VCALENDAR/VEVENT.LAST-MODIFIED":
			continue
		}
		if after[k] != v {
			t.Errorf("%s changed: %q -> %q", k, v, after[k])
		}
	}
	if after["VCALENDAR/VEVENT.SEQUENCE"] != "SEQUENCE:4|" || after["VCALENDAR/VEVENT.DTSTART"] != "DTSTART;TZID=Europe/Berlin:20261112T100000|" {
		t.Fatalf("written %v", after)
	}
	if after["VCALENDAR/VTIMEZONE.TZID"] == "" {
		t.Fatalf("a new TZID needs a VTIMEZONE: %v", after)
	}
	if !f.gone("standup") && f.row("standup").ID != res.Event.ID {
		t.Fatalf("cache not swapped")
	}
}

// A time sent without tz keeps the event's zone (review fixes): a zoned event
// never turns floating because a client left tz out.
func TestEditEventWithoutZoneKeepsTheEventsZone(t *testing.T) {
	f := newEditFix(t)
	f.add("standup.ics", plain)
	r := f.row("standup")
	res, err := f.edit(r, EventEdit{When: when(t, "2026-11-12", "11:00", "11:45", "")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Event.Start.TZ == nil || *res.Event.Start.TZ != "Europe/Berlin" || *res.Event.Start.Time != "11:00" || *res.Event.End.Time != "11:45" {
		t.Fatalf("result = %+v %+v", res.Event.Start, res.Event.End)
	}
	if got := props(t, f.srv.Get("home", "standup.ics"))["VCALENDAR/VEVENT.DTSTART"]; got != "DTSTART;TZID=Europe/Berlin:20261112T110000|" {
		t.Fatalf("written %q", got)
	}
	// A floating event stays floating.
	f.add("float.ics", strings.NewReplacer("UID:standup", "UID:float", "DTSTART;TZID=Europe/Berlin:", "DTSTART:", "DTEND;TZID=Europe/Berlin:", "DTEND:").Replace(plain))
	res, err = f.edit(f.row("float"), EventEdit{When: when(t, "2026-11-12", "12:00", "12:30", "")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Event.Start.TZ != nil {
		t.Fatalf("a floating event got a zone: %+v", res.Event.Start)
	}
}

func TestSameETagIsWeak(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{{`"x"`, `"x"`, true}, {`W/"x"`, `"x"`, true}, {`"x"`, `W/"x"`, true}, {`"x"`, `"y"`, false}, {`W/"x"`, `W/"y"`, false}} {
		if got := sameETag(c.a, c.b); got != c.want {
			t.Errorf("sameETag(%s, %s) = %v", c.a, c.b, got)
		}
	}
}

func TestEditEventRenameAndDuration(t *testing.T) {
	f := newEditFix(t)
	f.add("d.ics", strings.Replace(plain, "DTEND;TZID=Europe/Berlin:20261112T093000", "DURATION:PT45M", 1))
	r := f.row("standup")
	name := "Planning"
	if _, err := f.edit(r, EventEdit{Summary: &name}, nil); err != nil {
		t.Fatal(err)
	}
	got := props(t, f.srv.Get("home", "d.ics"))
	if got["VCALENDAR/VEVENT.SUMMARY"] != "SUMMARY:Planning|" || got["VCALENDAR/VEVENT.DURATION"] == "" {
		t.Fatalf("rename changed the time or not the title: %v", got)
	}
	r = f.row("standup")
	if _, err := f.edit(r, EventEdit{When: when(t, "2026-11-13", "08:00", "09:00", "")}, nil); err != nil {
		t.Fatal(err)
	}
	got = props(t, f.srv.Get("home", "d.ics"))
	if got["VCALENDAR/VEVENT.DURATION"] != "" || got["VCALENDAR/VEVENT.DTEND"] != "DTEND;TZID=Europe/Berlin:20261113T090000|" || got["VCALENDAR/VEVENT.DTSTART"] != "DTSTART;TZID=Europe/Berlin:20261113T080000|" {
		t.Fatalf("DURATION must become DTEND and a time without tz keep the event's zone: %v", got)
	}
}

func TestEditEventAllDayAndBack(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	w, err := WhenOf(calfeed.When{Date: "2026-11-12"}, calfeed.When{Date: "2026-11-13"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.edit(f.row("standup"), EventEdit{When: &w}, nil); err != nil {
		t.Fatal(err)
	}
	got := props(t, f.srv.Get("home", "s.ics"))
	if got["VCALENDAR/VEVENT.DTSTART"] != "DTSTART;VALUE=DATE:20261112|" || !f.row("standup").AllDay {
		t.Fatalf("all-day = %v", got)
	}
	if _, err := f.edit(f.row("standup"), EventEdit{When: when(t, "2026-11-12", "09:00", "10:00", "UTC")}, nil); err != nil {
		t.Fatal(err)
	}
	if got = props(t, f.srv.Get("home", "s.ics")); got["VCALENDAR/VEVENT.DTSTART"] != "DTSTART:20261112T090000Z|" {
		t.Fatalf("timed again = %v", got)
	}
}

func TestEditEventLocks(t *testing.T) {
	f := newEditFix(t)
	ev := func(uid, extra string) string {
		return strings.Replace(strings.Replace(plain, "UID:standup", "UID:"+uid, 1), "SUMMARY:Standup\r\n", "SUMMARY:Standup\r\n"+extra, 1)
	}
	f.srv.Put("home", "weekly.ics", ev("weekly", "RRULE:FREQ=WEEKLY;COUNT=3\r\n"))
	f.srv.Put("home", "guests.ics", ev("guests", "ATTENDEE:mailto:bob@example.org\r\n"))
	f.srv.Put("home", "boss.ics", ev("boss", "ORGANIZER:mailto:boss@example.org\r\n"))
	f.add("mine.ics", ev("mine", "ORGANIZER:mailto:ME@example.org\r\n"))
	for uid, want := range map[string]string{"weekly": LockRecurring, "guests": LockHasGuests, "boss": LockNotOrganizer, "mine": ""} {
		r := f.row(uid)
		if r.Access.Reason != want || (want == "") != r.Access.Update {
			t.Errorf("%s: access %+v, want reason %q", uid, r.Access, want)
		}
		if want == "" {
			continue
		}
		puts := f.srv.Count(http.MethodPut)
		name := "x"
		if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeNotEditable+":"+want {
			t.Errorf("%s: edit = %v", uid, err)
		}
		if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); code(err) != CodeNotEditable+":"+want {
			t.Errorf("%s: delete = %v", uid, err)
		}
		if f.srv.Count(http.MethodPut) != puts || f.srv.Count(http.MethodDelete) != 0 {
			t.Errorf("%s: a locked event was written", uid)
		}
	}
	// With no address known, any ORGANIZER locks.
	if err := f.w.Store.SetAddresses(f.ctx, f.c.ID, nil); err != nil {
		t.Fatal(err)
	}
	f.srv.Put("home", "touch.ics", ev("touch", ""))
	f.cycle(f.conn(f.c.ID))
	if r := f.row("mine"); r.Access.Reason != LockNotOrganizer {
		t.Fatalf("no address known: %+v", r.Access)
	}
}

func TestEditEventRefusalsWriteNothing(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	r := f.row("standup")
	name := "x"
	gets := f.srv.Count(http.MethodGet)
	// A stale rev is refused without asking the calendar.
	stale := r
	stale.Rev = "0000000000000000"
	if _, err := f.edit(stale, EventEdit{Summary: &name}, nil); code(err) != CodeChanged+":" {
		t.Fatalf("stale rev = %v", err)
	}
	// Another user's connection, an unknown id.
	if _, err := f.w.EditEvent(f.ctx, EditRequest{UserID: "bob", ConnID: f.c.ID, EventID: r.ID, Rev: r.Rev, Edit: EventEdit{Summary: &name}}); code(err) != CodeNotFound+":" {
		t.Fatalf("bob = %v", err)
	}
	if _, err := f.w.EditEvent(f.ctx, EditRequest{UserID: "alice", ConnID: f.c.ID, EventID: "nope", Rev: r.Rev, Edit: EventEdit{Summary: &name}}); code(err) != CodeNotFound+":" {
		t.Fatalf("unknown = %v", err)
	}
	// Assistants need their own switch.
	if _, err := f.edit(r, EventEdit{Summary: &name}, &Assistant{TokenID: "t"}); code(err) != CodeAssistantEditsOff+":" {
		t.Fatalf("assistant = %v", err)
	}
	off := false
	if _, err := f.w.Store.Update(f.ctx, "alice", f.c.ID, Patch{EditEvents: &off}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeEditsOff+":" {
		t.Fatalf("edits off = %v", err)
	}
	if f.row("standup").Access.Reason != "edits_off" {
		t.Fatalf("access with edits off = %+v", f.row("standup").Access)
	}
	if f.srv.Count(http.MethodGet) != gets || f.srv.Count(http.MethodPut) != 0 {
		t.Fatalf("a refused edit contacted the calendar")
	}
}

func TestEditEventConflictGoneAndReadOnly(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	r := f.row("standup")
	name := "x"
	// Changed in another app since OpenTodo read it: the pre-read sees it.
	f.srv.Put("home", "s.ics", strings.Replace(plain, "Standup", "Moved elsewhere", 1))
	if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeChanged+":" || f.srv.Count(http.MethodPut) != 0 {
		t.Fatalf("changed = %v (puts %d)", err, f.srv.Count(http.MethodPut))
	}
	f.cycle(f.conn(f.c.ID))
	r = f.row("standup")
	// Deleted in the calendar app: the row is dropped and devices are woken.
	f.srv.Delete("home", "s.ics")
	before := f.notified
	if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeGone+":" || !f.gone("standup") || f.notified != before+1 {
		t.Fatalf("gone = %v, cached %v", err, !f.gone("standup"))
	}
	// The calendar refuses the write: caps become false.
	f.add("t.ics", plain)
	r = f.row("standup")
	f.srv.SetReadOnly("home", true)
	if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeReadOnly+":" {
		t.Fatalf("read-only = %v", err)
	}
	if got := f.row("standup").Access; got.Update || got.Reason != CodeReadOnly {
		t.Fatalf("access after a 403 = %+v", got)
	}
	// Only that event is locked: the calendar keeps its capabilities, and
	// the next read of the calendar with changes clears the lock.
	if c := f.conn(f.c.ID); !c.Calendars[0].CapsOf().Update {
		t.Fatal("one 403 made the whole calendar read-only")
	}
	f.srv.SetReadOnly("home", false)
	f.srv.Put("home", "t.ics", strings.Replace(plain, "Standup", "Standup again", 1))
	f.cycle(f.conn(f.c.ID))
	if got := f.row("standup").Access; !got.Update {
		t.Fatalf("access after the next cycle = %+v", got)
	}
}

func TestEditEventRedirectsAreNeverFollowed(t *testing.T) {
	for _, status := range []int{301, 302, 307, 308} {
		f := newEditFix(t)
		f.add("s.ics", plain)
		r := f.row("standup")
		name := "x"
		f.srv.RedirectNext(http.MethodPut, status, "")
		puts := f.srv.Count(http.MethodPut)
		if _, err := f.edit(r, EventEdit{Summary: &name}, nil); code(err) != CodeUnreachable+":"+ReasonRedirect {
			t.Fatalf("%d put = %v", status, err)
		}
		if f.srv.Count(http.MethodPut)-puts != 1 || f.row("standup").ID != r.ID || !strings.Contains(f.srv.Get("home", "s.ics"), "SUMMARY:Standup") {
			t.Fatalf("%d: the redirect was followed or the cache changed", status)
		}
		f.srv.RedirectNext(http.MethodDelete, status, "")
		if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); code(err) != CodeUnreachable+":"+ReasonRedirect {
			t.Fatalf("%d delete = %v", status, err)
		}
		if f.srv.Count(http.MethodDelete) != 1 || f.gone("standup") {
			t.Fatalf("%d: delete followed the redirect or dropped the row", status)
		}
	}
}

func TestDoOnceKeepsSiteAndOutboundChecks(t *testing.T) {
	f := newEditFix(t)
	sent := 0
	d := NewDAV(&http.Client{Transport: roundTrip(func(*http.Request) { sent++ })}, "https://dav.example.com/", func(h http.Header) { h.Set("Authorization", "secret") }, "t")
	if _, err := d.DoOnce(f.ctx, http.MethodPut, "https://evil.example.net/x.ics", nil, nil); reasonOf(err) != ReasonRedirect || sent != 0 {
		t.Fatalf("another host = %v (sent %d)", err, sent)
	}
	// A private address is refused by the outbound dialer before anything is sent.
	priv := NewDAV(NewHTTPClient(func(context.Context) bool { return false }), f.srv.URL, func(h http.Header) { h.Set("Authorization", "secret") }, "t")
	before := f.srv.Count(http.MethodPut)
	if _, err := priv.DoOnce(f.ctx, http.MethodPut, f.srv.CalendarURL("home")+"x.ics", nil, nil); reasonOf(err) != ReasonPrivateTarget || f.srv.Count(http.MethodPut) != before {
		t.Fatalf("private = %v", err)
	}
}

type roundTrip func(*http.Request)

func (rt roundTrip) RoundTrip(r *http.Request) (*http.Response, error) {
	rt(r)
	return nil, errors.New("sent")
}

func TestEditEventSummaryCannotAddProperties(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	before := props(t, f.srv.Get("home", "s.ics"))
	for _, s := range []string{"Lunch\r\nATTENDEE:mailto:x@example.com", "A\nEND:VEVENT\nBEGIN:VEVENT\nUID:evil", "lone\rCR", "sep line x", "tab\tnul\x00"} {
		r := f.row("standup")
		if _, err := f.edit(r, EventEdit{Summary: &s}, nil); err != nil {
			t.Fatalf("%q: %v", s, err)
		}
		data := f.srv.Get("home", "s.ics")
		after := props(t, data)
		for k := range after {
			if _, ok := before[k]; !ok && k != "VCALENDAR/VEVENT.LAST-MODIFIED" {
				t.Errorf("%q added %s", s, k)
			}
		}
		root, _ := caldav.Parse([]byte(data))
		if len(root.Children) != 1 || strings.Count(after["VCALENDAR/VEVENT.SUMMARY"], "|") != 1 || strings.ContainsAny(strings.TrimSuffix(after["VCALENDAR/VEVENT.SUMMARY"], "|"), "\r\n") {
			t.Fatalf("%q injected: %s", s, data)
		}
	}
	for _, s := range []string{"", "\r\n\t", strings.Repeat("a", 501)} {
		if _, err := f.edit(f.row("standup"), EventEdit{Summary: &s}, nil); code(err) != CodeInvalid+":"+ErrSummary.Error() {
			t.Fatalf("%q = %v", s[:min(len(s), 10)], err)
		}
	}
}

func TestEditEventSummaryEscapingRoundTrips(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	for _, tc := range []struct{ in, line string }{
		{`back\slash`, `SUMMARY:back\\slash`}, {"semi;colon", `SUMMARY:semi\;colon`}, {"com,ma", `SUMMARY:com\,ma`}, {`two \n chars`, `SUMMARY:two \\n chars`},
	} {
		if _, err := f.edit(f.row("standup"), EventEdit{Summary: &tc.in}, nil); err != nil {
			t.Fatal(err)
		}
		data := f.srv.Get("home", "s.ics")
		if !strings.Contains(data, tc.line+"\r\n") {
			t.Fatalf("%q written as %s", tc.in, data)
		}
		cal, _ := calfeed.ParseCalendar([]byte(data))
		if cal.Events[0].Summary != tc.in || f.row("standup").Summary != tc.in {
			t.Fatalf("%q read back as %q", tc.in, cal.Events[0].Summary)
		}
	}
}

func TestDeleteEvent(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	r := f.row("standup")
	if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); err != nil {
		t.Fatal(err)
	}
	if f.srv.Get("home", "s.ics") != "" || !f.gone("standup") {
		t.Fatalf("delete left the event")
	}
}

func TestEditEventDeleteCapability(t *testing.T) {
	f := newEditFix(t)
	f.srv.AddCalendar("nodel", &calsynctest.Calendar{Name: "No delete", Privileges: []string{"write-content", "bind"}})
	if err := f.w.Rediscover(f.ctx, f.conn(f.c.ID)); err != nil {
		t.Fatal(err)
	}
	read := []string{f.srv.CalendarURL("nodel")}
	if _, err := f.w.Store.Update(f.ctx, "alice", f.c.ID, Patch{ReadURLs: &read}); err != nil {
		t.Fatal(err)
	}
	f.srv.Put("nodel", "s.ics", plain)
	f.cycle(f.conn(f.c.ID))
	r := f.row("standup")
	if !r.Access.Update || r.Access.Delete || r.Access.Reason != CodeReadOnly {
		t.Fatalf("access = %+v", r.Access)
	}
	if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); code(err) != CodeReadOnly+":" {
		t.Fatalf("delete = %v", err)
	}
}

func TestEditEventNeverInterleaves(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	r := f.row("standup")
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			name := []string{"One", "Two"}[i]
			_, errs[i] = f.edit(r, EventEdit{Summary: &name}, nil)
		}()
	}
	wg.Wait()
	ok, changed := 0, 0
	for _, err := range errs {
		switch code(err) {
		case "":
			ok++
		case CodeChanged + ":":
			changed++
		}
	}
	if ok != 1 || changed != 1 || f.srv.Count(http.MethodPut) != 1 {
		t.Fatalf("results %v, puts %d", errs, f.srv.Count(http.MethodPut))
	}
}

func TestAssistantEditUndo(t *testing.T) {
	f := newEditFix(t)
	on := true
	if _, err := f.w.Store.Update(f.ctx, "alice", f.c.ID, Patch{AssistantEdits: &on}); err != nil {
		t.Fatal(err)
	}
	f.add("s.ics", plain)
	r := f.row("standup")
	by := &Assistant{TokenID: "tok", TokenName: "Claude"}
	res, err := f.edit(r, EventEdit{When: when(t, "2026-11-12", "11:00", "11:30", "Europe/Berlin")}, by)
	if err != nil {
		t.Fatal(err)
	}
	if res.Event.ChangedBy == nil || res.Event.ChangedBy.Name != "Claude" {
		t.Fatalf("changedBy = %+v", res.Event.ChangedBy)
	}
	puts := f.srv.Count(http.MethodPut)
	back, err := f.w.UndoEvent(f.ctx, "alice", f.c.ID, res.Event.ID)
	if err != nil {
		t.Fatal(err)
	}
	if *back.Event.Start.Time != "09:00" || back.Event.ChangedBy != nil || f.srv.Count(http.MethodPut) != puts+1 {
		t.Fatalf("undo = %+v", back.Event)
	}
	if _, err := f.w.UndoEvent(f.ctx, "alice", f.c.ID, back.Event.ID); code(err) != CodeNotFound+":no undo is kept for this event" {
		t.Fatalf("second undo = %v", err)
	}
	// Changed in the calendar since the assistant's edit: 409, nothing written.
	res, _ = f.edit(f.row("standup"), EventEdit{When: when(t, "2026-11-12", "12:00", "12:30", "Europe/Berlin")}, by)
	f.srv.Put("home", "s.ics", strings.Replace(f.srv.Get("home", "s.ics"), "SUMMARY:Standup", "SUMMARY:Elsewhere", 1))
	f.cycle(f.conn(f.c.ID))
	puts = f.srv.Count(http.MethodPut) - 1 // the fake counts its own Put
	if _, err := f.w.UndoEvent(f.ctx, "alice", f.c.ID, res.Event.ID); code(err) != CodeChanged+":the event changed since the assistant's edit" {
		t.Fatalf("changed since = %v", err)
	}
	// The person's own edit replaces the undo.
	res, _ = f.edit(f.row("standup"), EventEdit{When: when(t, "2026-11-12", "13:00", "13:30", "Europe/Berlin")}, by)
	mine, err := f.edit(f.row("standup"), EventEdit{When: when(t, "2026-11-12", "14:00", "14:30", "Europe/Berlin")}, nil)
	if err != nil || mine.Event.ChangedBy != nil {
		t.Fatalf("own edit = %+v %v", mine, err)
	}
	for _, id := range []string{res.Event.ID, mine.Event.ID} {
		if _, err := f.w.UndoEvent(f.ctx, "alice", f.c.ID, id); code(err) != CodeNotFound+":no undo is kept for this event" {
			t.Fatalf("after own edit = %v", err)
		}
	}
	// Undo rows expire after 30 days.
	res, _ = f.edit(f.row("standup"), EventEdit{When: when(t, "2026-11-12", "15:00", "15:30", "Europe/Berlin")}, by)
	f.later(UndoTTL + time.Minute)
	if err := f.w.Store.ExpireUndos(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := f.w.UndoEvent(f.ctx, "alice", f.c.ID, res.Event.ID); code(err) != CodeNotFound+":no undo is kept for this event" {
		t.Fatalf("expired = %v", err)
	}
	_ = puts
}

func TestEditOptions(t *testing.T) {
	f := newEditFix(t)
	c := f.conn(f.c.ID)
	if !c.EditEvents || c.AssistantEdits {
		t.Fatalf("after turning edits on: %+v", c)
	}
	on, off := true, false
	if _, err := f.w.Store.Update(f.ctx, "alice", c.ID, Patch{AssistantEdits: &on}); err != nil {
		t.Fatal(err)
	}
	if c = f.conn(c.ID); !c.AssistantEdits {
		t.Fatal("assistant edits not on")
	}
	if _, err := f.w.Store.Update(f.ctx, "alice", c.ID, Patch{EditEvents: &off}); err != nil {
		t.Fatal(err)
	}
	if c = f.conn(c.ID); c.EditEvents || c.AssistantEdits {
		t.Fatalf("edits off must turn both off: %+v", c)
	}
	if _, err := f.w.Store.Update(f.ctx, "alice", c.ID, Patch{AssistantEdits: &on}); !errors.Is(err, ErrAssistantsNeedEdits) {
		t.Fatalf("assistants without edits = %v", err)
	}
	if got := f.conn(c.ID).Addresses; len(got) != 1 || got[0] != "me@example.org" {
		t.Fatalf("addresses = %v", got)
	}
}

func TestCapsOfPrivileges(t *testing.T) {
	f := newEditFix(t)
	for id, priv := range map[string][]string{"w": {"write"}, "a": {"all"}, "b": {"bind"}, "wc": {"write-content", "unbind"}} {
		f.srv.AddCalendar(id, &calsynctest.Calendar{Name: id, Privileges: priv})
	}
	d, err := f.w.Client(f.ctx, f.c)
	if err != nil {
		t.Fatal(err)
	}
	cals, err := d.ListCalendars(f.ctx, f.srv.Home())
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]Caps{"w": {true, true, true}, "a": {true, true, true}, "b": {true, false, false}, "wc": {false, true, true}, "Work": {true, true, true}}
	for _, c := range cals {
		if w, ok := want[c.Name]; ok && *c.Caps != w {
			t.Errorf("%s caps = %+v, want %+v", c.Name, *c.Caps, w)
		}
	}
	old := Calendar{ReadOnly: false}
	if old.CapsOf() != (Caps{true, true, true}) || (Calendar{ReadOnly: true}).CapsOf() != (Caps{}) {
		t.Fatal("a calendar saved before caps derives them from read_only")
	}
}

func TestCleanSummary(t *testing.T) {
	for in, want := range map[string]string{"  a\tb\r\nc\x00 d  ": "abcd", "é 👍 á": "é 👍 á", strings.Repeat("x", 500): strings.Repeat("x", 500)} {
		if got, err := CleanSummary(in); err != nil || got != want {
			t.Errorf("%q = %q %v", in, got, err)
		}
	}
	for _, in := range []string{"", " \r\n", strings.Repeat("x", 501), "\x7f\x01"} {
		if _, err := CleanSummary(in); !errors.Is(err, ErrSummary) {
			t.Errorf("%q accepted", in)
		}
	}
}

// A cache read before the upgrade has no refs: refresh_pending until the
// migration's version reset makes the next cycle read the calendar again.
func TestEditEventRefreshPending(t *testing.T) {
	f := newEditFix(t)
	f.add("s.ics", plain)
	if _, err := f.db.Exec(`DELETE FROM calendar_event_remote`); err != nil {
		t.Fatal(err)
	}
	if r := f.row("standup"); r.Access.Reason != "refresh_pending" || r.Access.Update || r.Rev != "" {
		t.Fatalf("access = %+v", r.Access)
	}
	if _, err := f.db.Exec(`UPDATE calendar_subscriptions SET etag = '' WHERE id IN (SELECT subscription_id FROM calsync_calendars)`); err != nil {
		t.Fatal(err)
	}
	f.cycle(f.conn(f.c.ID))
	if r := f.row("standup"); !r.Access.Update {
		t.Fatalf("after the read: %+v", r.Access)
	}
}
