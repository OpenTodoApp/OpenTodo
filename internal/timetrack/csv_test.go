package timetrack

import (
	"encoding/json"
	"flag"
	"os"
	"strings"
	"testing"
	"time"
)

var updateCSV = flag.Bool("update-csv", false, "rewrite expected in testdata/csv_fixture.json")

type csvFixture struct {
	Zone     string    `json:"zone"`
	DayStart int       `json:"day_start"`
	Now      int64     `json:"now"`
	From     string    `json:"from"`
	To       string    `json:"to"`
	Projects []Project `json:"projects"`
	Labels   []Label   `json:"labels"`
	Fields   []Field   `json:"fields"`
	Tasks    []Task    `json:"tasks"`
	Entries  []Entry   `json:"entries"`
	Expected string    `json:"expected"`
}

// TestCSVFixture: the server's CSV equals the shared fixture, which
// web/src/lib/time.test.ts checks toCSV against too ("Export a week").
func TestCSVFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/csv_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f csvFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	loc, err := time.LoadLocation(f.Zone)
	if err != nil {
		t.Fatal(err)
	}
	got := CSV(CSVInput{Entries: f.Entries, Tasks: f.Tasks, Projects: f.Projects, Labels: f.Labels, Fields: f.Fields,
		Loc: loc, DayStart: f.DayStart, Now: f.Now, From: f.From, To: f.To})
	if *updateCSV {
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		m["expected"] = got
		out, _ := json.MarshalIndent(m, "", " ")
		out = []byte(strings.ReplaceAll(string(out), BOM, `\ufeff`))
		if err := os.WriteFile("testdata/csv_fixture.json", append(out, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	if got != f.Expected {
		t.Fatalf("CSV differs:\n got %q\nwant %q", got, f.Expected)
	}
	if !strings.HasPrefix(got, BOM+"date,start,end,minutes,task,project,labels,note,") {
		t.Fatalf("header: %q", got[:60])
	}
}

func TestCell(t *testing.T) {
	for in, want := range map[string]string{
		"plain": "plain", "a,b": `"a,b"`, `say "hi"`: `"say ""hi"""`, "=1+1": "'=1+1", "-5": "-5", "+1.5": "+1.5",
		"- note": "'- note", "@x": "'@x", "two\nlines": "\"two\nlines\"",
	} {
		if got := Cell(in); got != want {
			t.Errorf("Cell(%q) = %q, want %q", in, got, want)
		}
	}
}
