package rules

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// routines-dynamic-data D5: a schedule on days of the month.

func TestMonthDaysValidation(t *testing.T) {
	for raw, ok := range map[string]bool{
		`{"kind":"schedule","at":"09:00","month_days":[1,15]}`:                     true,
		`{"kind":"schedule","at":"09:00","month_days":["last"]}`:                   true,
		`{"kind":"schedule","at":"09:00","month_days":[0]}`:                        false,
		`{"kind":"schedule","at":"09:00","month_days":[32]}`:                       false,
		`{"kind":"schedule","at":"09:00","month_days":[]}`:                         false,
		`{"kind":"schedule","at":"09:00","month_days":[1,1]}`:                      false,
		`{"kind":"schedule","at":"09:00","month_days":["first"]}`:                  false,
		`{"kind":"schedule","at":"09:00","weekdays":[1],"month_days":[1]}`:         false,
		`{"kind":"schedule","at":"09:00"}`:                                         false,
		`{"kind":"schedule","at":"09:00","weekdays":[1,2]}`:                        true,
		`{"kind":"task.created","month_days":[1]}`:                                 false,
		`{"kind":"schedule","at":"09:00","month_days":["last",1,"last"]}`:          false,
		`{"kind":"schedule","at":"09:00","month_days":[1,2,3,4,5,6,7,8,9,"last"]}`: true,
	} {
		if _, err := ruleval.ParseTrigger(json.RawMessage(raw)); (err == nil) != ok {
			t.Errorf("%s: err %v, want ok %v", raw, err, ok)
		}
	}
	tr, _ := ruleval.ParseTrigger(json.RawMessage(`{"kind":"schedule","at":"09:00","month_days":[1,"last"]}`))
	if b, _ := json.Marshal(tr); string(b) != `{"kind":"schedule","at":"09:00","month_days":[1,"last"]}` {
		t.Fatalf("round trip %s", b)
	}
}

// fires lists the days a schedule fires on, walking minute windows a day apart.
func fires(t *testing.T, raw string, from, to time.Time) []string {
	t.Helper()
	tr, err := ruleval.ParseTrigger(json.RawMessage(raw))
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for at := from; at.Before(to); at = at.Add(time.Hour) {
		if got, ok := lastScheduled(tr, time.UTC, at.UnixMilli(), at.Add(time.Hour).UnixMilli()); ok {
			out = append(out, got.Format("2006-01-02 15:04"))
		}
	}
	return out
}

func TestMonthDaysFirstAndLast(t *testing.T) {
	got := fires(t, `{"kind":"schedule","at":"09:00","month_days":[1,"last"]}`, time.Date(2027, 1, 31, 12, 0, 0, 0, time.UTC), time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC))
	if want := []string{"2027-02-01 09:00", "2027-02-28 09:00"}; !equal(got, want) {
		t.Fatalf("fires %v, want %v", got, want)
	}
}

func TestMonthDaysADayTheMonthLacks(t *testing.T) {
	got := fires(t, `{"kind":"schedule","at":"09:00","month_days":[31]}`, time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC), time.Date(2027, 6, 1, 0, 0, 0, 0, time.UTC))
	if want := []string{"2027-03-31 09:00", "2027-05-31 09:00"}; !equal(got, want) {
		t.Fatalf("fires %v, want %v", got, want)
	}
}

func TestMonthDaysServerDownCatchesUpOnce(t *testing.T) {
	tr, _ := ruleval.ParseTrigger(json.RawMessage(`{"kind":"schedule","at":"09:00","month_days":[1]}`))
	// The server was down from 31 October to 20 November: one firing, for 1 November.
	at, ok := lastScheduled(tr, time.UTC, time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC).UnixMilli(), time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC).UnixMilli())
	if !ok || at.Format("2006-01-02") != "2026-11-01" {
		t.Fatalf("catch up %v %v", at, ok)
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
