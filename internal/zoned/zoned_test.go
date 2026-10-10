package zoned

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// The vectors are shared with web/src/lib/dates.test.ts so the Go and
// TypeScript conversions agree.
const vectorsPath = "../../web/src/lib/zoned.vectors.json"

type vectors struct {
	Instant []struct {
		Note, Date, Time, TZ, UTC string
	} `json:"instant"`
	Local []struct {
		Note, UTC, Zone, Date, Time string
	} `json:"local"`
}

func TestSharedVectors(t *testing.T) {
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Instant) == 0 || len(v.Local) == 0 {
		t.Fatal("no vectors")
	}
	for _, c := range v.Instant {
		loc, err := Load(c.TZ)
		if err != nil {
			t.Fatalf("%s: %v", c.Note, err)
		}
		got, err := Instant(c.Date, c.Time, loc)
		if err != nil {
			t.Fatalf("%s: %v", c.Note, err)
		}
		if s := got.UTC().Format(time.RFC3339); s != c.UTC {
			t.Errorf("%s: Instant = %s, want %s", c.Note, s, c.UTC)
		}
	}
	for _, c := range v.Local {
		loc, err := Load(c.Zone)
		if err != nil {
			t.Fatalf("%s: %v", c.Note, err)
		}
		at, _ := time.Parse(time.RFC3339, c.UTC)
		d, tm := Local(at, loc)
		if d != c.Date || tm != c.Time {
			t.Errorf("%s: Local = %s %s, want %s %s", c.Note, d, tm, c.Date, c.Time)
		}
	}
}

func TestLoad(t *testing.T) {
	for _, ok := range []string{"Europe/Berlin", "America/Los_Angeles", "UTC", "Asia/Kolkata"} {
		if !Valid(ok) {
			t.Errorf("Valid(%q) = false", ok)
		}
	}
	for _, bad := range []string{"", "Local", "Mars/Olympus", "../etc/passwd", strings.Repeat("A", 65), "Europe/Berlin "} {
		if Valid(bad) {
			t.Errorf("Valid(%q) = true", bad)
		}
	}
}
