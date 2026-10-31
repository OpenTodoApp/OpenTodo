package sync

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// The occurrence-planning fixture is shared with web/src/lib/series.fixture.test.ts
// (OpenSpec changes series-exceptions D2, series-split D1 and D3).
const seriesFixturePath = "../../web/src/lib/series.fixture.json"

type seriesFixtureRecord struct {
	Date   string          `json:"date"`
	State  string          `json:"state"`
	Due    json.RawMessage `json:"due"`
	Title  *string         `json:"title"`
	Legacy bool            `json:"legacy"`
	Series string          `json:"series"`
}

type seriesFixturePiece struct {
	ID          string          `json:"id"`
	Recurrence  string          `json:"recurrence"`
	Due         json.RawMessage `json:"due"`
	SplitFrom   json.RawMessage `json:"split_from"`
	CompletedAt json.RawMessage `json:"completed_at"`
}

type seriesFixtureCase struct {
	Name       string                     `json:"name"`
	ClientOnly bool                       `json:"client_only"`
	Today      string                     `json:"today"`
	Series     map[string]json.RawMessage `json:"series"`
	Pieces     []seriesFixturePiece       `json:"pieces"`
	Target     string                     `json:"target"`
	Records    []seriesFixtureRecord      `json:"records"`
	Act        *struct {
		Date  *string                    `json:"date"`
		Kind  string                     `json:"kind"`
		Due   json.RawMessage            `json:"due"`
		Patch map[string]json.RawMessage `json:"patch"`
	} `json:"act"`
	Repair bool `json:"repair"`
	Range  *struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"range"`
	Expect struct {
		OK          *bool                      `json:"ok"`
		Invalid     bool                       `json:"invalid"`
		End         bool                       `json:"end"`
		RecordDate  string                     `json:"record_date"`
		Record      json.RawMessage            `json:"record"`
		Series      json.RawMessage            `json:"series"`
		Piece       json.RawMessage            `json:"piece"`
		Carries     map[string]json.RawMessage `json:"carries"`
		Occurrences map[string][]string        `json:"occurrences"`
	} `json:"expect"`
}

const fixtureNow = 1000

func copyEntity(e Entity) Entity {
	out := Entity{}
	for k, v := range e {
		out[k] = v
	}
	return out
}

// rows builds the series rows (the base series "s" and the pieces) and every task.
func (c seriesFixtureCase) rows() (map[string]Entity, []Entity) {
	series := Entity{
		"id": JSONOf("s"), "title": JSONOf("Study"), "description": JSONOf(""), "project_id": json.RawMessage("null"),
		"parent_id": json.RawMessage("null"), "priority": JSONOf(4), "labels": json.RawMessage("[]"), "position": JSONOf(1),
		"created_at": JSONOf(0), "completed_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"),
	}
	for k, v := range c.Series {
		series[k] = v
	}
	byID := map[string]Entity{"s": series}
	tasks := []Entity{series}
	for _, p := range c.Pieces {
		row := copyEntity(series)
		row["id"], row["recurrence"], row["due"], row["split_from"] = JSONOf(p.ID), JSONOf(p.Recurrence), p.Due, p.SplitFrom
		row["completed_at"] = json.RawMessage("null")
		if len(p.CompletedAt) > 0 {
			row["completed_at"] = p.CompletedAt
		}
		byID[p.ID] = row
		tasks = append(tasks, row)
	}
	for _, r := range c.Records {
		sid := r.Series
		if sid == "" {
			sid = "s"
		}
		of := byID[sid]
		rec := copyEntity(of)
		due := r.Due
		if len(due) == 0 {
			d := recurringDue{Date: r.Date}
			if cur := decodeRecurringDue(of["due"]); cur != nil {
				d.Time = cur.Time
			}
			due = JSONOf(d)
		}
		rec["id"], rec["recurrence"], rec["series_id"], rec["due"], rec["habit"] = JSONOf(OccurrenceID(sid, r.Date)), json.RawMessage("null"), JSONOf(sid), due, json.RawMessage("false")
		rec["split_from"] = json.RawMessage("null")
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
	return byID, tasks
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

func readSeriesFixture(t *testing.T) []seriesFixtureCase {
	t.Helper()
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
	if len(f.Cases) < 40 {
		t.Fatalf("fixture looks truncated: %d cases", len(f.Cases))
	}
	return f.Cases
}

func TestSeriesSharedFixture(t *testing.T) {
	for _, c := range readSeriesFixture(t) {
		if c.ClientOnly {
			continue
		}
		t.Run(c.Name, func(t *testing.T) {
			byID, tasks := c.rows()
			target := c.Target
			if target == "" {
				target = "s"
			}
			row := byID[target]
			switch {
			case c.Range != nil:
				fixtureOccurrences(t, c, byID, tasks)
			case c.Repair:
				got, err := PlanRepair(target, row, tasks, c.Today, fixtureNow)
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
				var want map[string]any
				_ = json.Unmarshal(c.Expect.Series, &want)
				if len(got) != len(want) {
					t.Errorf("repair writes %d fields, want %d", len(got), len(want))
				}
			case c.Act.Kind == "split":
				fixtureSplit(t, c, target, row, tasks)
			default:
				fixtureAct(t, c, target, row, tasks)
			}
		})
	}
}

func fixtureOccurrences(t *testing.T, c seriesFixtureCase, byID map[string]Entity, tasks []Entity) {
	t.Helper()
	for id, want := range c.Expect.Occurrences {
		row := byID[id]
		due := decodeRecurringDue(row["due"])
		rule, err := recurrence.Parse(StringOf(row["recurrence"]))
		if err != nil {
			t.Fatal(err)
		}
		b := SeriesBudget(id, row, tasks, due.Date, c.Today)
		got, _, err := rule.Bounded(b.End).OccurrencesExcept(due.Date, c.Today, b.Taken, c.Range.From, c.Range.To, b.Except)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s occurrences = %v, want %v", id, got, want)
		}
	}
}

func fixtureSplit(t *testing.T, c seriesFixtureCase, id string, row Entity, tasks []Entity) {
	t.Helper()
	plan, err := PlanSplit(id, row, *c.Act.Date, c.Act.Patch, tasks, fixtureNow, c.Today)
	if c.Expect.OK != nil && !*c.Expect.OK {
		want := ErrNotAnOccurrence
		if c.Expect.Invalid {
			want = ErrInvalidSplitChange
		}
		if !errors.Is(err, want) {
			t.Fatalf("err = %v, want %v", err, want)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if want := PieceID(id, *c.Act.Date); plan.PieceID != want {
		t.Fatalf("piece id = %s, want %s", plan.PieceID, want)
	}
	subset(t, "series", plan.Series, c.Expect.Series)
	subset(t, "piece", plan.Piece, c.Expect.Piece)
	if len(plan.Carries) != len(c.Expect.Carries) {
		t.Errorf("carries = %v, want %v", plan.Carries, c.Expect.Carries)
	}
	for date, want := range c.Expect.Carries {
		subset(t, "carry "+date, plan.Carries[OccurrenceID(id, date)], want)
	}
}

func fixtureAct(t *testing.T, c seriesFixtureCase, id string, row Entity, tasks []Entity) {
	t.Helper()
	date := ""
	if c.Act.Date != nil {
		date = *c.Act.Date
	}
	action := OccurrenceAction{Kind: c.Act.Kind, Patch: c.Act.Patch}
	if c.Act.Kind == "move" {
		action.Patch = map[string]json.RawMessage{"due": c.Act.Due}
	}
	plan, err := PlanActOn(id, row, date, action, tasks, fixtureNow, c.Today)
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
	if want := OccurrenceID(id, c.Expect.RecordDate); plan.RecordID != want {
		t.Fatalf("record id = %s, want the record of %s", plan.RecordID, c.Expect.RecordDate)
	}
	subset(t, "record", plan.Record, c.Expect.Record)
}
