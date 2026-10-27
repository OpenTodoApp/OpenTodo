package zoned

import (
	"testing"
	"time"
)

// The Windows ids the importer (Microsoft To Do) and calendar feeds (Outlook,
// Exchange) meet, and every zone of the table loads.
func TestWindowsZones(t *testing.T) {
	for win, iana := range map[string]string{
		"Pacific Standard Time":          "America/Los_Angeles",
		"W. Europe Standard Time":        "Europe/Berlin",
		"UTC":                            "Etc/UTC",
		"British Columbia Standard Time": "America/Vancouver",
	} {
		if got, ok := WindowsZone(win); !ok || got != iana {
			t.Errorf("%s: got %q, want %s", win, got, iana)
		}
	}
	if _, ok := WindowsZone("Mars Standard Time"); ok {
		t.Error("an unknown id has no zone")
	}
	for _, z := range windowsZones {
		if _, err := time.LoadLocation(z); err != nil {
			t.Errorf("zone %s does not load: %v", z, err)
		}
	}
}
