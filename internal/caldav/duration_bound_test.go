package caldav

import (
	"strings"
	"testing"
	"time"
)

// TestParseDurationLongDigitRun: digits were collected one string append at a
// time, so a 1 MB DURATION value from a CalDAV client cost a quadratic number
// of byte copies before it was refused. It is refused at the tenth digit now.
func TestParseDurationLongDigitRun(t *testing.T) {
	v := "P" + strings.Repeat("9", 1<<20) + "D"
	start := time.Now()
	if _, err := ParseDuration(v); err == nil {
		t.Fatal("accepted")
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("took %v", d)
	}
	if n, err := ParseDuration("P123456789D"); err != nil || n != 123456789*86400 {
		t.Fatalf("nine digits: %d, %v", n, err)
	}
}
