package caldav

import (
	"strings"
	"testing"
)

// TestSpanProperty (OpenSpec change multi-day-tasks, D7): a span serves
// X-OPENTODO-SPAN:TRUE beside X-OPENTODO-START, DUE keeps the do-on date and
// no DTSTART is added; TRUE and FALSE are read, anything else is kept.
func TestSpanProperty(t *testing.T) {
	out := string(Encode(Task{UID: "u", Priority: 4, Start: "2026-11-03", Span: true, Due: &Due{Date: "2026-11-05"}}))
	for _, want := range []string{"\r\nDUE;VALUE=DATE:20261105\r\n", "\r\nX-OPENTODO-START:20261103\r\n", "\r\nX-OPENTODO-SPAN:TRUE\r\n"} {
		if !strings.Contains(out, want) {
			t.Fatalf("span served without %q: %s", want, out)
		}
	}
	if strings.Contains(out, "DTSTART") {
		t.Fatalf("span served a DTSTART: %s", out)
	}
	if out = string(Encode(Task{UID: "u", Priority: 4, Start: "2026-11-03", Due: &Due{Date: "2026-11-05"}})); strings.Contains(out, "X-OPENTODO-SPAN") {
		t.Fatalf("plain task served the flag: %s", out)
	}
	for v, want := range map[string]bool{"TRUE": true, "false": false} {
		in, _ := Decode(vtodo("X-OPENTODO-START:20261103", "DUE;VALUE=DATE:20261105", "X-OPENTODO-SPAN:"+v))
		if in.Span == nil || *in.Span != want || strings.Contains(in.Extra, "X-OPENTODO-SPAN") || in.Evening != nil {
			t.Fatalf("%s decoded: %+v", v, in)
		}
	}
	in, _ := Decode(vtodo("X-OPENTODO-SPAN:MAYBE"))
	if in.Span != nil || !strings.Contains(in.Extra, "X-OPENTODO-SPAN:MAYBE") {
		t.Fatalf("invalid kept: %+v", in)
	}
	if in, _ = Decode(vtodo("SUMMARY:x")); in.Span != nil {
		t.Fatalf("absent: %+v", in)
	}
}
