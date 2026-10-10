package sync

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// TestValidateZonedDue pins the absolute-datetimes contract for due.tz: optional,
// only with a time, a known IANA zone of at most 64 characters.
func TestValidateZonedDue(t *testing.T) {
	long := `{"date":"2026-10-11","time":"09:00","tz":"` + strings.Repeat("A", 65) + `"}`
	cases := []struct {
		value string
		ok    bool
	}{
		{`{"date":"2026-10-11"}`, true},
		{`{"date":"2026-10-11","time":"09:00"}`, true},
		{`{"date":"2026-10-11","time":"09:00","tz":"Europe/Berlin"}`, true},
		{`{"date":"2026-10-11","time":"09:00","tz":"UTC"}`, true},
		{`{"date":"2026-10-11","tz":"Europe/Berlin"}`, false},
		{`{"date":"2026-10-11","time":"09:00","tz":"Mars/Olympus"}`, false},
		{`{"date":"2026-10-11","time":"09:00","tz":""}`, false},
		{`{"date":"2026-10-11","time":"09:00","tz":"Local"}`, false},
		{`{"date":"2026-10-11","time":"09:00","tz":42}`, false},
		{long, false},
	}
	for _, c := range cases {
		err := Validate(op("1", "task", "t1", "due", c.value, 1, "A"))
		if (err == nil) != c.ok {
			t.Errorf("due %s: ok=%v, err=%v", c.value, c.ok, err)
		}
	}
}

// The whole due is one register: concurrent floating and zoned edits converge on
// the complete value of the later edit, never a mix (scenario "Concurrent
// floating and zoned edits").
func TestZonedDueConvergesAsOneValue(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	base := op("c1", "task", "t1", "title", `"Stand-up"`, 100, "A")
	a := op("a1", "task", "t1", "due", `{"date":"2026-10-11","time":"10:00"}`, 200, "A")
	b := op("b1", "task", "t1", "due", `{"date":"2026-10-11","time":"10:00","tz":"America/New_York"}`, 300, "B")
	for user, order := range map[string][]Op{"u1": {base, a, b}, "u2": {b, a, base}} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		var d map[string]string
		if err := json.Unmarshal(row["due"], &d); err != nil {
			t.Fatal(err)
		}
		if d["tz"] != "America/New_York" || d["time"] != "10:00" {
			t.Errorf("%s: due = %s", user, row["due"])
		}
	}
}
