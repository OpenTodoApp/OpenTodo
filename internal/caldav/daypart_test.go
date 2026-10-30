package caldav

import (
	"strings"
	"testing"
)

// OpenSpec change day-parts, design D6: Morning and Afternoon are
// X-OPENTODO-DAY-PART, Evening stays X-OPENTODO-EVENING only.
func TestDayPartProperty(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, DayPart: "morning"}))
	if !strings.Contains(out, "\r\nX-OPENTODO-DAY-PART:MORNING\r\n") || strings.Contains(out, "X-OPENTODO-EVENING") {
		t.Fatalf("morning served: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4, DayPart: "evening", Evening: true})); strings.Contains(out, "DAY-PART") || !strings.Contains(out, "X-OPENTODO-EVENING:TRUE") {
		t.Fatalf("evening served: %s", out)
	}
	in, _ := Decode(vtodo("X-OPENTODO-DAY-PART:AFTERNOON"))
	if in.DayPart == nil || *in.DayPart != "afternoon" || strings.Contains(in.Extra, "DAY-PART") {
		t.Fatalf("decoded: %+v", in)
	}
	in, _ = Decode(vtodo("X-OPENTODO-DAY-PART:NIGHT"))
	if in.DayPart != nil || !strings.Contains(in.Extra, "X-OPENTODO-DAY-PART:NIGHT") {
		t.Fatalf("unknown kept: %+v", in)
	}
}
