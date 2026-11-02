package caldav

import (
	"os"
	"strings"
	"testing"
)

// An Apple location alarm (PROXIMITY with the 1976 placeholder trigger) is
// never a time reminder: it stays client data (OpenSpec change
// location-reminders, design D6).
func TestProximityAlarmIsClientData(t *testing.T) {
	raw, err := os.ReadFile("testdata/apple-proximity.ics")
	if err != nil {
		t.Fatal(err)
	}
	in, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Alarms) != 1 || in.Alarms[0].Mappable {
		t.Fatalf("proximity alarm mappable: %+v", in.Alarms)
	}
	lines := strings.Join(in.Alarms[0].Lines, "\r\n")
	if !strings.Contains(lines, "PROXIMITY:ARRIVE") || !strings.Contains(lines, "TRIGGER;VALUE=DATE-TIME:19760401T005545Z") {
		t.Fatalf("lines %q", lines)
	}
}
