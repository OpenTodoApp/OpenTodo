package vault

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// Shared task-line vectors (OpenSpec change obsidian-plugin, task 2.2): each
// line's parse, the fields it sets with LineFields, the problems it reports and
// how it prints back. obsidian/src/vault/line.test.ts runs the same file
// against the TypeScript twin. Regenerate the expectations after a deliberate
// grammar change with UPDATE_LINE_VECTORS=1 go test ./internal/vault -run TestLineVectors
// (the lines themselves are kept; add a case by adding a {"line": …} entry).

const lineVectorsPath = "testdata/lines.vectors.json"

type lineVectorParse struct {
	Indent   string            `json:"indent"`
	Done     bool              `json:"done"`
	Title    string            `json:"title"`
	Trailing string            `json:"trailing"`
	Due      string            `json:"due"`
	Start    string            `json:"start"`
	DoneDate string            `json:"doneDate"`
	Created  string            `json:"created"`
	Recur    string            `json:"recur"`
	Priority int               `json:"priority"`
	ID       string            `json:"id"`
	Blocked  []string          `json:"blocked"`
	Tags     []string          `json:"tags"`
	Time     string            `json:"time"`
	TZ       string            `json:"tz"`
	Deadline string            `json:"deadline"`
	Estimate string            `json:"estimate"`
	Evening  bool              `json:"evening"`
	Span     string            `json:"span"`
	DayPart  string            `json:"dayPart"`
	Energy   string            `json:"energy"`
	ReadOnly map[string]string `json:"readOnly"`
}

type lineVector struct {
	Name     string            `json:"name"`
	Line     string            `json:"line"`
	Task     bool              `json:"task"`
	Parse    *lineVectorParse  `json:"parse,omitempty"`
	Fields   map[string]string `json:"fields,omitempty"`
	Problems []string          `json:"problems,omitempty"`
	Printed  string            `json:"printed,omitempty"`
}

func lineVectorOf(name, raw string) lineVector {
	v := lineVector{Name: name, Line: raw}
	indent, done, content, ok := isTaskLine(raw)
	if !ok {
		return v
	}
	v.Task = true
	l := ParseLine(indent, done, content)
	nonNil := func(s []string) []string {
		if s == nil {
			return []string{}
		}
		return s
	}
	v.Parse = &lineVectorParse{
		Indent: l.Indent, Done: l.Done, Title: l.Title, Trailing: l.Trailing, Due: l.Due, Start: l.Start,
		DoneDate: l.DoneDate, Created: l.Created, Recur: l.Recur, Priority: l.Priority, ID: l.ID,
		Blocked: nonNil(l.Blocked), Tags: nonNil(l.Tags), Time: l.Time, TZ: l.TZ, Deadline: l.Deadline,
		Estimate: l.Estimate, Evening: l.Evening, Span: l.Span, DayPart: l.DayPart, Energy: l.Energy, ReadOnly: l.ReadOnly,
	}
	v.Fields, v.Problems = LineFields(l)
	v.Printed = PrintLine(l)
	return v
}

func TestLineVectors(t *testing.T) {
	raw, err := os.ReadFile(lineVectorsPath)
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Comment string       `json:"comment"`
		Vectors []lineVector `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Vectors) < 30 {
		t.Fatalf("only %d vectors", len(file.Vectors))
	}
	got := make([]lineVector, len(file.Vectors))
	for i, v := range file.Vectors {
		got[i] = lineVectorOf(v.Name, v.Line)
	}
	if os.Getenv("UPDATE_LINE_VECTORS") == "1" {
		file.Vectors = got
		out, err := json.MarshalIndent(file, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(lineVectorsPath, append(out, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	for i, want := range file.Vectors {
		if !reflect.DeepEqual(normVector(got[i]), normVector(want)) {
			g, _ := json.Marshal(got[i])
			w, _ := json.Marshal(want)
			t.Errorf("%s:\n got  %s\n want %s", want.Name, g, w)
		}
	}
}

// normVector compares through JSON so that empty maps and absent ones agree.
func normVector(v lineVector) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}
