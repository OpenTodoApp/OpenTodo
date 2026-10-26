package calfeed

import (
	"strings"
	"testing"
	"time"
)

// TestParseDurationLongDigitRun: a remote calendar's DURATION or
// REFRESH-INTERVAL with a long digit run cost a quadratic number of byte copies
// (2 MB feeds are read) and a big number overflowed into a negative duration.
// More than nine digits, or more than a century, are refused now.
func TestParseDurationLongDigitRun(t *testing.T) {
	start := time.Now()
	if _, _, err := parseDuration("PT" + strings.Repeat("9", 1<<20) + "S"); err == nil {
		t.Fatal("accepted")
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("took %v", d)
	}
	if _, _, err := parseDuration("PT999999999H"); err == nil {
		t.Fatal("an overflowing duration was accepted")
	}
	if d, days, err := parseDuration("P2D"); err != nil || days != 2 || d != 48*time.Hour {
		t.Fatalf("P2D = %v %d %v", d, days, err)
	}
}
