package frames

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The shared vectors (docs/contracts.md "Calendar frame occurrences") are run
// here and by web/src/lib/frames.test.ts.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/frames.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Cases []struct {
			Name        string       `json:"name"`
			Frames      []Frame      `json:"frames"`
			From        string       `json:"from"`
			To          string       `json:"to"`
			Occurrences []Occurrence `json:"occurrences"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Cases) < 10 {
		t.Fatalf("only %d cases", len(v.Cases))
	}
	for _, c := range v.Cases {
		got := Occurrences(c.Frames, c.From, c.To)
		if !reflect.DeepEqual(got, c.Occurrences) {
			t.Errorf("%s:\n got %+v\nwant %+v", c.Name, got, c.Occurrences)
		}
	}
}

func TestClockAndTimes(t *testing.T) {
	for s, want := range map[string]int{"00:00": 0, "09:30": 570, "23:59": 1439, "24:00": -1, "9:5": -1, "10:60": -1, "": -1} {
		if got := Clock(s); got != want {
			t.Errorf("Clock(%q) = %d, want %d", s, got, want)
		}
	}
	if TimesValid("12:00", "11:00") || TimesValid("10:00", "10:00") || !TimesValid("09:00", "09:15") {
		t.Error("TimesValid")
	}
	if Occurrences([]Frame{{ID: "x", Weekdays: "1", Start: "09:00", End: "10:00"}}, "bad", "2026-01-01") != nil {
		t.Error("an unreadable range has no occurrences")
	}
}
