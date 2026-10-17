package calfeed

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// OpenSpec change bound-hostile-input: expansion starts at the window, and one
// calendar's expansion has a work budget and a deadline.

func manyDaily(t *testing.T, n int, dtstart string) []Event {
	t.Helper()
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, "BEGIN:VEVENT\r\nUID:e%d\r\nSUMMARY:Daily %d\r\nDTSTART:%s\r\nDTEND:%s\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\n", i, i, dtstart, strings.Replace(dtstart, "T09", "T10", 1))
	}
	b.WriteString("END:VCALENDAR\r\n")
	cal, err := ParseCalendar([]byte(b.String()))
	if err != nil {
		t.Fatal(err)
	}
	return cal.Events
}

func TestExpandOldSeriesIsFastAndComplete(t *testing.T) {
	events := manyDaily(t, 2000, "19700101T090000Z")
	w := StoreWindow(day("2026-10-17"))
	start := time.Now()
	occ, warns := Expand(events, w, MaxOccurrences)
	limit := 2 * time.Second
	if raceEnabled {
		limit = 30 * time.Second
	}
	if took := time.Since(start); took > limit {
		t.Errorf("expansion took %v", took)
	}
	if len(occ) != MaxOccurrences || !strings.Contains(strings.Join(warns, "|"), "5000") {
		t.Fatalf("got %d occurrences, warnings %q", len(occ), warns)
	}
	// A series from 1970 still has its occurrences today (it used to run out
	// of periods before reaching the window).
	occ, warns = Expand(events[:1], w, MaxOccurrences)
	if len(occ) != 462 || len(warns) != 0 {
		t.Fatalf("one series: %d occurrences, warnings %q", len(occ), warns)
	}
	if got := occ[0].Start.T.UTC().Format("2006-01-02 15:04"); got != "2026-08-16 09:00" {
		t.Fatalf("first occurrence %s", got)
	}
}

// Starting at the window gives the same occurrences as walking from DTSTART.
func TestExpandSkipMatchesFullWalk(t *testing.T) {
	rules := []string{
		"FREQ=DAILY;INTERVAL=3",
		"FREQ=DAILY;BYMONTH=2,3;BYDAY=MO,TH",
		"FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SA;WKST=SU",
		"FREQ=MONTHLY;BYDAY=-1FR",
		"FREQ=MONTHLY;INTERVAL=5;BYMONTHDAY=31",
		"FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
		"FREQ=YEARLY;INTERVAL=4;BYMONTH=2;BYMONTHDAY=29",
		"FREQ=YEARLY;BYDAY=20MO",
		"FREQ=DAILY;UNTIL=20261020T000000Z",
	}
	starts := []Point{
		{T: time.Date(2003, 1, 31, 9, 30, 0, 0, time.UTC), Zone: "UTC"},
		{T: time.Date(2004, 2, 29, 0, 0, 0, 0, time.UTC), AllDay: true},
		{T: time.Date(2001, 3, 31, 23, 0, 0, 0, time.UTC)}, // floating
	}
	w := win("2026-09-01", "2027-03-01")
	nonEmpty := 0
	for _, rr := range rules {
		for _, st := range starts {
			r, _, ok := parseRule(rr, st)
			if !ok {
				t.Fatalf("rule %s", rr)
			}
			full := expandRule(r, st, w, st.T, &expansion{ctx: context.Background(), left: maxExpandWork})
			skip := expandRule(r, st, w, w.From.Add(-72*time.Hour), &expansion{ctx: context.Background(), left: maxExpandWork})
			inWin := func(ps []Point) string {
				var out []string
				for _, p := range ps {
					if !p.T.Before(w.From.Add(-48 * time.Hour)) {
						out = append(out, p.T.Format(time.RFC3339))
					}
				}
				return strings.Join(out, " ")
			}
			a, b := inWin(full), inWin(skip)
			if a != b {
				t.Errorf("%s from %v:\nfull %s\nskip %s", rr, st.T, a, b)
			}
			if a != "" {
				nonEmpty++
			}
		}
	}
	if nonEmpty < 20 {
		t.Fatalf("only %d rules have occurrences in the window", nonEmpty)
	}
}

func TestExpandWorkBudget(t *testing.T) {
	events := manyDaily(t, 200, "20260101T090000Z")
	// Twenty-four years of daily events for each: more work than one calendar may cost.
	occ, warns := Expand(events, win("2026-01-01", "2050-01-01"), 0)
	if len(occ) == 0 || len(occ) > maxExpandWork {
		t.Fatalf("got %d occurrences", len(occ))
	}
	if !strings.Contains(strings.Join(warns, "|"), "repeats too much") {
		t.Fatalf("warnings %q", warns)
	}
}

func TestExpandDeadline(t *testing.T) {
	events := manyDaily(t, 50, "20260101T090000Z")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	occ, warns := ExpandContext(ctx, events, win("2026-01-01", "2027-01-01"), 0)
	if len(occ) >= 50*365 || !strings.Contains(strings.Join(warns, "|"), "repeats too much") {
		t.Fatalf("got %d occurrences, warnings %q", len(occ), warns)
	}
}
