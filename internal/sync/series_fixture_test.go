package sync

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

// The occurrence-planning fixture is shared with web/src/lib/series.fixture.test.ts
// (OpenSpec change series-exceptions, design D2).
const seriesFixturePath = "../../web/src/lib/series.fixture.json"

type seriesFixtureRecord struct {
	Date   string          `json:"date"`
	State  string          `json:"state"`
	Due    json.RawMessage `json:"due"`
	Title  *string         `json:"title"`
	Legacy bool            `json:"legacy"`
}

type seriesFixtureCase struct {
	Name       string                     `json:"name"`
	ClientOnly bool                       `json:"client_only"`
	Today      string                     `json:"today"`
	Series     map[string]json.RawMessage `json:"series"`
	Records    []seriesFixtureRecord      `json:"records"`
	Act        *struct {
		Date  *string                    `json:"date"`
		Kind  string                     `json:"kind"`
		Due   json.RawMessage            `json:"due"`
		Patch map[string]json.RawMessage `json:"patch"`
	} `json:"act"`
	Repair bool `json:"repair"`
	Expect struct {
		OK         *bool           `json:"ok"`
		End        bool            `json:"end"`
		RecordDate string          `json:"record_date"`
		Record     json.RawMessage `json:"record"`
		Series     json.RawMessage `json:"series"`
	} `json:"expect"`
}

const fixtureNow = 1000

func (c seriesFixtureCase) rows() (Entity, []Entity) {
	series := Entity{
		"id": JSONOf("s"), "title": JSONOf("Study"), "description": JSONOf(""), "project_id": json.RawMessage("null"),
		"parent_id": json.RawMessage("null"), "priority": JSONOf(4), "labels": json.RawMessage("[]"), "position": JSONOf(1),
		"created_at": JSONOf(0), "completed_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"),
	}
	for k, v := range c.Series {
		series[k] = v
	}
	cur := decodeRecurringDue(series["due"])
	tasks := []Entity{series}
	for _, r := range c.Records {
		rec := Entity{}
		for k, v := range series {
			rec[k] = v
		}
		due := r.Due
		if len(due) == 0 {
			d := recurringDue{Date: r.Date}
			if cur != nil {
				d.Time = cur.Time
			}
			due = JSONOf(d)
		}
		rec["id"], rec["recurrence"], rec["series_id"], rec["due"], rec["habit"] = JSONOf(OccurrenceID("s", r.Date)), json.RawMessage("null"), JSONOf("s"), due, json.RawMessage("false")
		if r.Title != nil {
			rec["title"] = JSONOf(*r.Title)
		}
		rec["completed_at"], rec["skipped"] = json.RawMessage("null"), JSONOf(r.State == RecordSkipped)
		if r.State != RecordOpen {
			rec["completed_at"] = JSONOf(1)
		}
		if !r.Legacy {
			rec["occurrence_date"] = JSONOf(r.Date)
		}
		tasks = append(tasks, rec)
	}
	return series, tasks
}

// subset reports whether every field of want has the same JSON value in got.
func subset(t *testing.T, what string, got map[string]json.RawMessage, want json.RawMessage) {
	t.Helper()
	var w map[string]any
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatalf("%s: %v", what, err)
	}
	for k, v := range w {
		var g any
		if raw, ok := got[k]; ok {
			_ = json.Unmarshal(raw, &g)
		}
		if !reflect.DeepEqual(g, v) {
			t.Errorf("%s.%s = %v, want %v", what, k, g, v)
		}
	}
}

func TestSeriesSharedFixture(t *testing.T) {
	raw, err := os.ReadFile(seriesFixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var f struct {
		Cases []seriesFixtureCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if len(f.Cases) < 20 {
		t.Fatalf("fixture looks truncated: %d cases", len(f.Cases))
	}
	for _, c := range f.Cases {
		if c.ClientOnly {
			continue
		}
		t.Run(c.Name, func(t *testing.T) {
			series, tasks := c.rows()
			if c.Repair {
				got, err := PlanRepair("s", series, tasks, c.Today, fixtureNow)
				if err != nil {
					t.Fatal(err)
				}
				if string(c.Expect.Series) == "null" {
					if got != nil {
						t.Fatalf("repair = %v, want nothing", got)
					}
					return
				}
				subset(t, "series", got, c.Expect.Series)
				return
			}
			date := ""
			if c.Act.Date != nil {
				date = *c.Act.Date
			}
			action := OccurrenceAction{Kind: c.Act.Kind, Patch: c.Act.Patch}
			if c.Act.Kind == "move" {
				action.Patch = map[string]json.RawMessage{"due": c.Act.Due}
			}
			plan, err := PlanActOn("s", series, date, action, tasks, fixtureNow, c.Today)
			if c.Expect.OK != nil && !*c.Expect.OK {
				if !errors.Is(err, ErrNotAnOccurrence) {
					t.Fatalf("err = %v, want ErrNotAnOccurrence", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if plan.EndSeries != c.Expect.End {
				t.Fatalf("EndSeries = %v, want %v", plan.EndSeries, c.Expect.End)
			}
			if c.Expect.End {
				return
			}
			if string(c.Expect.Series) == "null" {
				if plan.Series != nil {
					t.Errorf("series = %v, want nothing", plan.Series)
				}
			} else {
				subset(t, "series", plan.Series, c.Expect.Series)
			}
			if string(c.Expect.Record) == "null" {
				if plan.Record != nil {
					t.Errorf("record = %v, want nothing", plan.Record)
				}
				return
			}
			if want := OccurrenceID("s", c.Expect.RecordDate); plan.RecordID != want {
				t.Fatalf("record id = %s, want the record of %s", plan.RecordID, c.Expect.RecordDate)
			}
			subset(t, "record", plan.Record, c.Expect.Record)
		})
	}
}
