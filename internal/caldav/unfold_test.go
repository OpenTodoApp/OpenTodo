package caldav

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// foldBomb is a body of n continuation lines folded into one property, the
// worst case for unfolding (OpenSpec change bound-hostile-input).
func foldBomb(size int) []byte {
	head, tail := "BEGIN:VCALENDAR\r\nX-A:a\r\n", "END:VCALENDAR\r\n"
	n := (size - len(head) - len(tail)) / 3
	return []byte(head + strings.Repeat(" x\n", n) + tail)
}

func TestUnfoldWorstCaseIsFast(t *testing.T) {
	cases := []struct {
		name string
		body []byte
		lim  Limits
	}{
		{"caldav resource", foldBomb(MaxBodyBytes), Limits{Bytes: MaxBodyBytes, Props: maxProps}},
		{"feed", foldBomb(2 << 20), Limits{Bytes: 2 << 20, Props: 200_000}},
	}
	for _, c := range cases {
		start := time.Now()
		_, err := ParseWithLimits(c.body, c.lim)
		if took := time.Since(start); took > time.Second {
			t.Errorf("%s: parse took %v", c.name, took)
		}
		if !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", c.name, err)
		}
	}
	// Unfold itself has no limits but stays linear.
	start := time.Now()
	lines := Unfold(foldBomb(MaxBodyBytes))
	if took := time.Since(start); took > time.Second {
		t.Errorf("Unfold took %v", took)
	}
	if len(lines) != 3 {
		t.Errorf("Unfold gave %d lines, want 3", len(lines))
	}
}

func TestParseLineLengthLimit(t *testing.T) {
	body := func(value int) []byte {
		v := strings.Repeat("a", value)
		var b strings.Builder
		b.WriteString("BEGIN:VCALENDAR\r\nX-A:")
		for len(v) > 70 {
			b.WriteString(v[:70] + "\r\n ")
			v = v[70:]
		}
		b.WriteString(v + "\r\nEND:VCALENDAR\r\n")
		return []byte(b.String())
	}
	if _, err := Parse(body(MaxLineBytes - len("X-A:"))); err != nil {
		t.Fatalf("line at the limit refused: %v", err)
	}
	if _, err := Parse(body(MaxLineBytes)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("over-long line: err = %v, want ErrInvalid", err)
	}
}

func TestUnfoldKeepsSemantics(t *testing.T) {
	got := Unfold([]byte("A:1\r\n 2\r\n\r\n\t3\rB:x\n\nC:y"))
	want := []string{"A:123", "B:x", "C:y"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("Unfold = %q, want %q", got, want)
	}
}

func BenchmarkParseFoldBomb(b *testing.B) {
	body := foldBomb(MaxBodyBytes)
	for i := 0; i < b.N; i++ {
		_, _ = Parse(body)
	}
}
