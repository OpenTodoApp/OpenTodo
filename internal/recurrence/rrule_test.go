package recurrence

import "testing"

func TestRRULERoundTrip(t *testing.T) {
	cases := map[string]string{
		"every day":                    "FREQ=DAILY",
		"every 3 days":                 "FREQ=DAILY;INTERVAL=3",
		"every 2 weeks":                "FREQ=WEEKLY;INTERVAL=2",
		"every weekday":                "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		"every monday, wednesday":      "FREQ=WEEKLY;BYDAY=MO,WE",
		"every 15th":                   "FREQ=MONTHLY;BYMONTHDAY=15",
		"every last day":               "FREQ=MONTHLY;BYMONTHDAY=-1",
		"every last weekday":           "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
		"every 2nd tuesday":            "FREQ=MONTHLY;BYDAY=2TU",
		"every last friday":            "FREQ=MONTHLY;BYDAY=-1FR",
		"every year":                   "FREQ=YEARLY",
		"every day until 2026-12-31":   "FREQ=DAILY;UNTIL=20261231",
		"every weekday for 10 times":   "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=10",
		"every 6 months":               "FREQ=MONTHLY;INTERVAL=6",
		"every saturday and sunday":    "FREQ=WEEKLY;BYDAY=SA,SU",
		"every 4th thursday":           "FREQ=MONTHLY;BYDAY=4TH",
		"every month until 2027-01-01": "FREQ=MONTHLY;UNTIL=20270101",
	}
	for text, rrule := range cases {
		r, err := Parse(text)
		if err != nil {
			t.Fatal(err)
		}
		if got := r.RRULE(); got != rrule {
			t.Fatalf("%s: RRULE %q, want %q", text, got, rrule)
		}
		back, ok := FromRRULE(rrule, "2026-10-13")
		if !ok || back.Canonical() != r.Canonical() {
			t.Fatalf("%s: back %q ok=%v", rrule, back.Canonical(), ok)
		}
	}
}

func TestFromRRULEClientSpellings(t *testing.T) {
	// 2026-10-13 is a Tuesday.
	ok := map[string]string{
		"FREQ=WEEKLY;INTERVAL=1;WKST=MO":                "every week",
		"freq=weekly;byday=TU;interval=2":               "every 2 weeks",
		"FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=13":         "every 3 months",
		"FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=13":          "every year",
		"FREQ=DAILY;UNTIL=20261231T225959Z":             "every day until 2026-12-31",
		"FREQ=WEEKLY;BYDAY=FR,MO,TH,TU,WE":              "every weekday",
		"FREQ=MONTHLY;BYDAY=+1MO":                       "every 1st monday",
		"FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR": "every last weekday",
	}
	for rr, want := range ok {
		r, good := FromRRULE(rr, "2026-10-13")
		if !good || r.Canonical() != want {
			t.Fatalf("%s: %q ok=%v, want %q", rr, r.Canonical(), good, want)
		}
	}
	for _, rr := range []string{
		"FREQ=HOURLY", "FREQ=DAILY;BYHOUR=9", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "FREQ=MONTHLY;BYDAY=5MO",
		"FREQ=MONTHLY;BYDAY=1MO,3MO", "FREQ=YEARLY;BYMONTH=3", "FREQ=DAILY;COUNT=2;UNTIL=20261231", "FREQ=SECONDLY", "",
		"FREQ=DAILY;INTERVAL=0", "FREQ=MONTHLY;BYMONTHDAY=40",
	} {
		if r, good := FromRRULE(rr, "2026-10-13"); good {
			t.Fatalf("%s accepted as %q", rr, r.Canonical())
		}
	}
	if !SameRRULE("FREQ=WEEKLY;INTERVAL=1;BYDAY=WE,MO", "byday=MO,WE;freq=WEEKLY") || SameRRULE("FREQ=DAILY", "FREQ=WEEKLY") {
		t.Fatal("SameRRULE")
	}
	// A completion-relative rule is served as its interval and recognised again.
	r, _ := Parse("every 3 days after completion")
	if r.RRULE() != "FREQ=DAILY;INTERVAL=3" {
		t.Fatal(r.RRULE())
	}
}
