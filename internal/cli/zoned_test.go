package cli

import (
	"testing"
	"time"
)

// absolute-datetimes: `ot` shows a zoned due in the machine's zone with the
// original as a hint, and edits it as shown while keeping its zone.
func TestZonedDueInCLI(t *testing.T) {
	la, err := time.LoadLocation("America/Los_Angeles")
	if err != nil {
		t.Fatal(err)
	}
	nine, berlin := "09:00", "Europe/Berlin"
	d := &due{Date: "2026-10-11", Time: &nine, TZ: &berlin}
	v := d.inZone(la)
	if v.Date != "2026-10-11" || *v.Time != "00:00" || v.hint != "09:00 Berlin" {
		t.Fatalf("inZone = %+v", v)
	}
	if s, _ := describeDue(v, "2026-10-01"); s != "2026-10-11 00:00 (09:00 Berlin)" {
		t.Fatalf("describeDue = %q", s)
	}
	// Same zone: no hint.
	bl, _ := time.LoadLocation(berlin)
	if v := d.inZone(bl); v.hint != "" || *v.Time != "09:00" {
		t.Fatalf("same zone = %+v", v)
	}
	// Edit the shown time to 01:00 in Los Angeles: stored as 10:00 Berlin.
	one := "01:00"
	v.Time = &one
	r := v.rezone(la)
	if r.Date != "2026-10-11" || *r.Time != "10:00" || r.TZ == nil || *r.TZ != berlin {
		t.Fatalf("rezone = %+v", r)
	}
	// Clearing the time drops the zone.
	v.Time = nil
	if r := v.rezone(la); r.TZ != nil || r.Time != nil || r.Date != "2026-10-11" {
		t.Fatalf("rezone without time = %+v", r)
	}
	// Floating dues pass through.
	f := &due{Date: "2026-10-11", Time: &nine}
	if f.inZone(la) != f {
		t.Fatal("floating due converted")
	}
}
