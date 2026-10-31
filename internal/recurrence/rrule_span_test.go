package recurrence

import "testing"

// TestRRULEEarlier (multi-day-tasks D7): the first days of a recurring span.
func TestRRULEEarlier(t *testing.T) {
	cases := []struct {
		rule string
		days int
		want string
		ok   bool
	}{
		{"every monday", 1, "FREQ=WEEKLY;BYDAY=SU", true},
		{"every monday, wednesday", 2, "FREQ=WEEKLY;BYDAY=MO,SA", true},
		{"every weekday", 0, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", true},
		{"every sunday", 8, "FREQ=WEEKLY;BYDAY=SA", true},
		{"every 3 days", 2, "FREQ=DAILY;INTERVAL=3", true},
		{"every week until 2026-12-31", 2, "FREQ=WEEKLY;UNTIL=20261229", true},
		{"every month", 2, "", false},
		{"every 15th", 1, "", false},
		{"every 2nd tuesday", 1, "", false},
	}
	for _, c := range cases {
		r, err := Parse(c.rule)
		if err != nil {
			t.Fatal(err)
		}
		got, ok := r.RRULEEarlier(c.days)
		if got != c.want || ok != c.ok {
			t.Errorf("%s -%d: %q %v, want %q %v", c.rule, c.days, got, ok, c.want, c.ok)
		}
	}
}
