package habits

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The shared vectors of web/src/lib/habits.vectors.json, run in place as
// habits.test.ts runs them (docs/contracts.md).

type split struct {
	From      string            `json:"from"`
	Rule      string            `json:"rule"`
	Due       string            `json:"due"`
	Completed bool              `json:"completed"`
	Records   map[string]string `json:"records"`
}

type vectors struct {
	Cases []struct {
		Name    string            `json:"name"`
		Rule    string            `json:"rule"`
		Due     string            `json:"due"`
		Today   string            `json:"today"`
		Records map[string]string `json:"records"`
		Split   *split            `json:"split"`
		Stats   *Stats            `json:"stats"`
		Grids   []struct {
			Month string `json:"month"`
			Days  string `json:"days"`
		} `json:"grids"`
	} `json:"cases"`
	Previous []struct {
		Rule    string   `json:"rule"`
		Due     string   `json:"due"`
		Before  string   `json:"before"`
		Records []string `json:"records"`
		Want    *string  `json:"want"`
	} `json:"previous"`
}

const (
	series = "series-1"
	root   = "root-1"
)

var char = map[string]string{Blank: ".", Done: "D", Tiny: "T", Skipped: "S", Missed: "M", Pending: "P", Upcoming: "U"}

func entity(fields map[string]any) opsync.Entity {
	e := opsync.Entity{}
	for k, v := range fields {
		e[k] = opsync.JSONOf(v)
	}
	return e
}

func recordRows(seriesID string, records map[string]string) []opsync.Entity {
	var out []opsync.Entity
	for date, mark := range records {
		state, movedTo, moved := strings.Cut(mark, ">")
		due := date
		if moved {
			due = movedTo
		}
		f := map[string]any{"id": opsync.OccurrenceID(seriesID, date), "series_id": seriesID, "due": map[string]string{"date": due},
			"completed_at": 100, "skipped": state == "skipped"}
		if state == "open" {
			f["completed_at"] = nil
		}
		if state == "tiny" {
			f["tiny"] = true
		}
		if moved || state == "open" {
			f["occurrence_date"] = date
		}
		out = append(out, entity(f))
	}
	return out
}

func rows(rule, due string, records map[string]string, sp *split) []opsync.Entity {
	f := map[string]any{"id": series, "recurrence": rule, "due": map[string]string{"date": due}, "habit": true, "completed_at": nil, "deleted_at": nil}
	if sp != nil {
		f["split_from"] = map[string]string{"series": root, "date": sp.From}
	}
	out := append([]opsync.Entity{entity(f)}, recordRows(series, records)...)
	if sp == nil {
		return out
	}
	r := map[string]any{"id": root, "recurrence": sp.Rule, "due": map[string]string{"date": sp.Due}, "habit": true, "completed_at": nil, "deleted_at": nil}
	if sp.Completed {
		r["completed_at"] = 100
	}
	return append(append(out, entity(r)), recordRows(root, sp.Records)...)
}

func load(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("../../web/src/lib/habits.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestVectors(t *testing.T) {
	v := load(t)
	if len(v.Cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			all := rows(c.Rule, c.Due, c.Records, c.Split)
			got := Compute(series, all[0], all, c.Today)
			switch {
			case c.Stats == nil && got != nil:
				t.Fatalf("stats = %+v, want nil", *got)
			case c.Stats != nil && got == nil:
				t.Fatalf("stats = nil, want %+v", *c.Stats)
			case c.Stats != nil && *got != *c.Stats:
				t.Fatalf("stats = %+v, want %+v", *got, *c.Stats)
			}
			for _, g := range c.Grids {
				from := g.Month + "-01"
				to := AddDays(time.Date(atoi(g.Month[:4]), time.Month(atoi(g.Month[5:])+1), 1, 0, 0, 0, 0, time.UTC).Format(time.DateOnly), -1)
				var b strings.Builder
				for _, d := range Days(series, all[0], all, from, to, c.Today) {
					b.WriteString(char[d.State])
				}
				if b.String() != g.Days {
					t.Fatalf("%s: %s, want %s", g.Month, b.String(), g.Days)
				}
			}
		})
	}
	for _, p := range v.Previous {
		r, err := recurrence.Parse(p.Rule)
		if err != nil {
			t.Fatal(err)
		}
		recs := map[string]bool{}
		for _, d := range p.Records {
			recs[d] = true
		}
		want := ""
		if p.Want != nil {
			want = *p.Want
		}
		if got := PreviousScheduled(r, p.Due, p.Before, recs); got != want {
			t.Errorf("previous %s before %s = %q, want %q", p.Rule, p.Before, got, want)
		}
	}
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}

func TestScheduled(t *testing.T) {
	cases := []struct {
		rule, due, date string
		want            bool
	}{
		{"every weekday", "2026-10-14", "2026-10-17", false},
		{"every weekday", "2026-10-14", "2026-10-16", true},
		{"every last day", "", "2026-02-28", true},
		{"every last weekday", "", "2026-10-30", true},
		{"every last weekday", "", "2026-10-31", false},
		{"every 1st weekday", "", "2026-03-02", true},
		{"every 2nd weekday", "", "2027-01-04", true},
		{"every 2nd tuesday", "", "2026-10-13", true},
		{"every last friday", "", "2026-10-23", false},
		{"every 3 days", "2026-10-14", "2026-10-08", true},
		{"every 3 days", "2026-10-14", "2026-10-09", false},
		{"every year", "2026-02-28", "2024-02-28", true},
		{"every day", "", "2026-10-14", false},
		{"every day until 2026-10-20", "2026-10-14", "2026-10-21", false},
	}
	for _, c := range cases {
		r, err := recurrence.Parse(c.rule)
		if err != nil {
			t.Fatal(err)
		}
		if got := r.Scheduled(c.due, c.date); got != c.want {
			t.Errorf("%s (%s) on %s = %v", c.rule, c.due, c.date, got)
		}
	}
}

func TestLogicalToday(t *testing.T) {
	at := time.Date(2026, 10, 15, 1, 30, 0, 0, time.UTC)
	if got := LogicalToday(at, time.UTC, 240); got != "2026-10-14" {
		t.Fatalf("got %s", got)
	}
	if got := LogicalToday(at, time.UTC, 0); got != "2026-10-15" {
		t.Fatalf("got %s", got)
	}
}
