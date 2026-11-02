package caldav

import (
	"strings"
	"testing"
)

// OpenSpec change time-sectors, design D9: X-OPENTODO-SECTOR out and in; an
// invalid value is kept in ical_extra, absence leaves the sector alone.
func TestSectorProperty(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, Sector: "2026-W45"}))
	if !strings.Contains(out, "\r\nX-OPENTODO-SECTOR:2026-W45\r\n") || strings.Contains(out, "\r\nDUE") {
		t.Fatalf("sector served: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4})); strings.Contains(out, "SECTOR") {
		t.Fatalf("none served: %s", out)
	}
	in, _ := Decode(vtodo("X-OPENTODO-SECTOR:2026-Q1"))
	if in.Sector == nil || *in.Sector != "2026-Q1" || strings.Contains(in.Extra, "SECTOR") {
		t.Fatalf("decoded: %+v", in)
	}
	in, _ = Decode(vtodo("X-OPENTODO-SECTOR:SOON"))
	if in.Sector != nil || !strings.Contains(in.Extra, "X-OPENTODO-SECTOR:SOON") {
		t.Fatalf("invalid kept: %+v", in)
	}
	in, _ = Decode(vtodo("SUMMARY:x"))
	if in.Sector != nil {
		t.Fatalf("absent: %+v", in)
	}
}
