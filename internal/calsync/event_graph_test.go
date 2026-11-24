package calsync

import (
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync/graphtest"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

type graphFix struct {
	*harness
	ms *graphtest.Server
	c  *Connection
}

func newGraphFix(t *testing.T) *graphFix {
	t.Helper()
	h := newHarness(t)
	ms, c := h.microsoft("W. Europe Standard Time")
	on := true
	c, err := h.w.Store.Update(h.ctx, "alice", c.ID, Patch{EditEvents: &on})
	if err != nil {
		t.Fatal(err)
	}
	return &graphFix{harness: h, ms: ms, c: c}
}

func (f *graphFix) add(e graphtest.Event) string {
	e.Calendar = "cal-work"
	if e.Start.DateTime == "" {
		e.Start, e.End = graphtest.DT{DateTime: "2026-11-12T09:00:00", TimeZone: "UTC"}, graphtest.DT{DateTime: "2026-11-12T09:30:00", TimeZone: "UTC"}
	}
	id := f.ms.Add(e)
	f.later(time.Minute)
	f.cycle(f.conn(f.c.ID))
	return id
}

func (f *graphFix) row(subject string) calfeed.EventRow {
	f.t.Helper()
	rows, _ := f.w.Feeds.EventsOf(f.ctx, "alice", "2026-10-01", "2027-01-31", false, true)
	for i := range rows {
		if rows[i].Summary == subject {
			Decorate([]*calfeed.EventRow{&rows[i]}, []Connection{*f.conn(f.c.ID)})
			return rows[i]
		}
	}
	f.t.Fatalf("no event %q", subject)
	return calfeed.EventRow{}
}

func (f *graphFix) edit(r calfeed.EventRow, e EventEdit) (*EventResult, error) {
	return f.w.EditEvent(f.ctx, EditRequest{UserID: "alice", ConnID: f.c.ID, EventID: r.ID, Rev: r.Rev, Edit: e})
}

func TestGraphEventMove(t *testing.T) {
	f := newGraphFix(t)
	f.add(graphtest.Event{Subject: "One on one"})
	r := f.row("One on one")
	if !r.Access.Update || r.Rev == "" {
		t.Fatalf("access = %+v", r.Access)
	}
	res, err := f.edit(r, EventEdit{When: when(t, "2026-11-12", "10:00", "10:30", "Europe/Berlin")})
	if err != nil {
		t.Fatal(err)
	}
	if res.Event.Rev == r.Rev || res.Replaces != r.ID || res.Provider != ProviderMicrosoft {
		t.Fatalf("result = %+v", res)
	}
	if f.ms.Count("PATCH /v1.0/me/events/") != 1 {
		t.Fatalf("requests = %v", f.ms.Requests())
	}
	e := f.ms.ByTask("")
	if len(e) != 1 || e[0].Start.DateTime != "2026-11-12T10:00:00" || e[0].Start.TimeZone != "W. Europe Standard Time" || e[0].Subject != "One on one" {
		t.Fatalf("stored = %+v", e)
	}
	name := "Renamed"
	if _, err := f.edit(f.row("One on one"), EventEdit{Summary: &name}); err != nil {
		t.Fatal(err)
	}
	if e = f.ms.ByTask(""); e[0].Subject != "Renamed" || e[0].Start.DateTime != "2026-11-12T10:00:00" {
		t.Fatalf("a rename changed the time: %+v", e)
	}
}

func TestGraphEventRefusals(t *testing.T) {
	f := newGraphFix(t)
	f.add(graphtest.Event{Subject: "Series", Type: "occurrence"})
	f.add(graphtest.Event{Subject: "Meeting", Attendees: []string{"bob@example.org"}})
	f.add(graphtest.Event{Subject: "Theirs", NotOrganizer: true})
	for subject, want := range map[string]string{"Series": LockRecurring, "Meeting": LockHasGuests, "Theirs": LockNotOrganizer} {
		r := f.row(subject)
		name := "x"
		if r.Access.Reason != want {
			t.Errorf("%s access = %+v", subject, r.Access)
		}
		if _, err := f.edit(r, EventEdit{Summary: &name}); code(err) != CodeNotEditable+":"+want {
			t.Errorf("%s edit = %v", subject, err)
		}
	}
	if n := f.ms.Count("PATCH"); n != 0 {
		t.Fatalf("a locked event was written (%d)", n)
	}
	f.add(graphtest.Event{Subject: "Plain"})
	name := "x"
	f.ms.RaceNextPatch()
	if _, err := f.edit(f.row("Plain"), EventEdit{Summary: &name}); code(err) != CodeChanged+":" {
		t.Fatalf("412 = %v", err)
	}
	f.cycle(f.conn(f.c.ID))
	f.ms.RedirectNext("PATCH")
	before := f.ms.Count("PATCH")
	if _, err := f.edit(f.row("Plain"), EventEdit{Summary: &name}); code(err) != CodeUnreachable+":"+ReasonRedirect || f.ms.Count("PATCH") != before+1 {
		t.Fatalf("redirect = %v", err)
	}
	f.ms.RedirectNext("DELETE")
	r := f.row("Plain")
	if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); code(err) != CodeUnreachable+":"+ReasonRedirect {
		t.Fatalf("delete redirect = %v", err)
	}
	f.ms.SetCanEdit("cal-work", false)
	if _, err := f.edit(f.row("Plain"), EventEdit{Summary: &name}); code(err) != CodeReadOnly+":" {
		t.Fatalf("403 = %v", err)
	}
	if got := f.row("Plain").Access; got.Update || got.Reason != CodeReadOnly {
		t.Fatalf("caps after a 403 = %+v", got)
	}
	f.ms.SetCanEdit("cal-work", true)
	if err := f.w.Rediscover(f.ctx, f.conn(f.c.ID)); err != nil {
		t.Fatal(err)
	}
	for _, e := range f.ms.ByTask("") {
		if e.Subject == "Plain" {
			f.ms.Delete(e.ID)
		}
	}
	if _, err := f.edit(f.row("Plain"), EventEdit{Summary: &name}); code(err) != CodeGone+":" {
		t.Fatalf("404 = %v", err)
	}
}

func TestGraphEventDelete(t *testing.T) {
	f := newGraphFix(t)
	f.add(graphtest.Event{Subject: "Drop"})
	r := f.row("Drop")
	if _, err := f.w.DeleteEvent(f.ctx, "alice", f.c.ID, r.ID, r.Rev); err != nil {
		t.Fatal(err)
	}
	if len(f.ms.ByTask("")) != 0 {
		t.Fatal("not deleted")
	}
	for _, req := range f.ms.Requests() {
		if strings.HasPrefix(req, "DELETE") && !strings.Contains(req, "/me/events/") {
			t.Fatalf("unexpected %s", req)
		}
	}
}

func TestGraphPointZones(t *testing.T) {
	at := time.Date(2026, 11, 12, 9, 0, 0, 0, time.UTC)
	if g := graphPoint(calfeed.Point{T: at, AllDay: true}, true, "Europe/Berlin"); g.DateTime != "2026-11-12T00:00:00" {
		t.Fatalf("all-day = %+v", g)
	}
	if g := graphPoint(calfeed.Point{T: at}, false, "Europe/Berlin"); g.DateTime != "2026-11-12T09:00:00" || g.TimeZone != "W. Europe Standard Time" {
		t.Fatalf("floating = %+v", g)
	}
	for _, zone := range []string{"Antarctica/Troll", "Asia/Famagusta", "America/Nuuk", "Europe/Kirov"} {
		loc, err := zoned.Load(zone)
		if err != nil {
			continue
		}
		if _, ok := zoned.WindowsName(loc.String()); ok {
			continue
		}
		g := graphPoint(calfeed.Point{T: at.In(loc), Zone: zone}, false, "")
		if g.TimeZone != "UTC" || g.DateTime != "2026-11-12T09:00:00" {
			t.Fatalf("a zone without a Windows id = %+v", g)
		}
		return
	}
	t.Skip("every zone tried has a Windows id")
}
