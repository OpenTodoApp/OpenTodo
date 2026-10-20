package e2ee

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"
)

// FitText is shared by email to task and issue import (issue-import D7).
func TestFitText(t *testing.T) {
	const limit = 64 << 10
	note := func(b string, cut bool) string {
		if cut {
			return b + "\n\n[cut]"
		}
		return b
	}
	short := "a short body"
	if got := FitText(short, limit, note); got != short {
		t.Fatalf("short = %q", got)
	}
	long := strings.Repeat("äbcdefghij\n", 20000)
	got := FitText(long, limit, note)
	enc, _ := json.Marshal(got)
	if !strings.HasSuffix(got, "[cut]") || !utf8.ValidString(got) || len(enc) > limit || len(got) > MaxEncryptableBytes(limit) {
		t.Fatalf("long: %d bytes, %d encoded", len(got), len(enc))
	}
	if len(got) < MaxEncryptableBytes(limit)-64 && len(enc) < limit-64 {
		t.Fatalf("cut too early: %d bytes", len(got))
	}
}
