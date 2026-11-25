package calfeed

import (
	"context"
	"testing"
	"time"
)

func TestManagedRefs(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	if _, err := s.db.Exec(`INSERT INTO calsync_connections(id,user_id,provider,name,server_url,username,principal_url,home_url,calendars,enabled,next_sync_at,created_at,updated_at)
		VALUES('c','u1','caldav','C','https://x/','me','','','[]',1,0,1,1)`); err != nil {
		t.Fatal(err)
	}
	m, err := s.EnsureManaged(ctx, "u1", "c", "https://x/cal/", "Cal", "")
	if err != nil {
		t.Fatal(err)
	}
	at := func(h int) Point { return Point{T: time.Date(2026, 11, 12, h, 0, 0, 0, time.UTC), Zone: "UTC"} }
	occ := []Occurrence{
		{UID: "a", Instance: "20261112T090000Z", Summary: "A", Start: at(9), End: at(10)},
		{UID: "w", Instance: "20261112T110000Z", Summary: "W", Start: at(11), End: at(12)},
		{UID: "w", Instance: "20261119T110000Z", Summary: "W", Start: at(11).add(7), End: at(12).add(7)},
	}
	refs := map[string]EventRemote{"a": {Href: "https://x/cal/a.ics", ETag: `"1"`}, "w": {Href: "https://x/cal/w.ics", ETag: `"2"`, Locked: "recurring"}}
	if err := s.StoreManagedRefs(ctx, m.SubscriptionID, "st:1", occ, nil, refs); err != nil {
		t.Fatal(err)
	}
	rows, err := s.EventsOf(ctx, "u1", "2026-11-01", "2026-11-30", false, true)
	if err != nil || len(rows) != 3 {
		t.Fatalf("rows = %d %v", len(rows), err)
	}
	for _, r := range rows {
		if r.Ref == nil || !r.Ref.Known || r.Ref.ConnectionID != "c" || r.ID != EventID(m.SubscriptionID, r.UID, r.Ref.Instance) {
			t.Fatalf("row %+v ref %+v", r, r.Ref)
		}
		got, err := s.ManagedEvent(ctx, "c", r.ID)
		if err != nil || got.UID != r.UID || got.Ref.Href != refs[r.UID].Href {
			t.Fatalf("ManagedEvent(%s) = %+v %v", r.ID, got, err)
		}
	}
	// A re-read replaces the refs with the events.
	if err := s.StoreManagedRefs(ctx, m.SubscriptionID, "st:2", occ[:1], nil, map[string]EventRemote{"a": {Href: "https://x/cal/a.ics", ETag: `"3"`}}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM calendar_event_remote`).Scan(&n)
	if n != 1 {
		t.Fatalf("refs after re-read = %d", n)
	}
	// Feeds have no ref and are never served one.
	sub, _ := s.Create(ctx, "u1", "https://cal.example/f.ics", "", "")
	_ = s.Success(ctx, sub.ID, &Result{Replaced: true, Occurrences: occ[:1]})
	rows, _ = s.EventsOf(ctx, "u1", "2026-11-01", "2026-11-30", true, false)
	if len(rows) != 1 || rows[0].Ref != nil {
		t.Fatalf("feed rows = %+v", rows)
	}
	// Deleting the managed subscription removes its refs.
	if _, err := s.DropManaged(ctx, "c", nil); err != nil {
		t.Fatal(err)
	}
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM calendar_event_remote`).Scan(&n)
	if n != 0 {
		t.Fatalf("refs after the subscription went = %d", n)
	}
}

func (p Point) add(days int) Point { p.T = p.T.AddDate(0, 0, days); return p }

func TestGuestsAndOrganizer(t *testing.T) {
	cal, err := ParseCalendar([]byte("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20261112T090000Z\r\nORGANIZER;CN=Me:MAILTO:Me@Example.org\r\nATTENDEE:mailto:b@example.org\r\nEND:VEVENT\r\n" +
		"BEGIN:VEVENT\r\nUID:y\r\nDTSTART:20261112T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"))
	if err != nil {
		t.Fatal(err)
	}
	if e := cal.Events[0]; !e.Guests || e.Organizer != "me@example.org" {
		t.Fatalf("first = %+v", e)
	}
	if e := cal.Events[1]; e.Guests || e.Organizer != "" {
		t.Fatalf("second = %+v", e)
	}
}
