package caldav

import (
	"strings"
	"testing"
)

// OpenSpec change task-energy, design D7: X-OPENTODO-ENERGY out and in; an
// unknown value is kept in ical_extra, the mapped property never is.
func TestEnergyProperty(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, Energy: "deep"}))
	if !strings.Contains(out, "\r\nX-OPENTODO-ENERGY:DEEP\r\n") {
		t.Fatalf("deep served: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4})); strings.Contains(out, "ENERGY") {
		t.Fatalf("none served: %s", out)
	}
	in, _ := Decode(vtodo("X-OPENTODO-ENERGY:low"))
	if in.Energy == nil || *in.Energy != "low" || !in.EnergySent || strings.Contains(in.Extra, "ENERGY") {
		t.Fatalf("decoded: %+v", in)
	}
	in, _ = Decode(vtodo("X-OPENTODO-ENERGY:HIGH"))
	if in.Energy != nil || !in.EnergySent || !strings.Contains(in.Extra, "X-OPENTODO-ENERGY:HIGH") {
		t.Fatalf("unknown kept: %+v", in)
	}
	in, _ = Decode(vtodo("SUMMARY:x"))
	if in.Energy != nil || in.EnergySent {
		t.Fatalf("absent: %+v", in)
	}
}
