package ruleval

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestParseTrigger(t *testing.T) {
	ok := []string{
		`{"kind":"task.created"}`, `{"kind":"task.completed"}`, `{"kind":"task.reopened"}`,
		`{"kind":"label.added","label_id":"l1"}`, `{"kind":"label.removed","label_id":"l1"}`,
		`{"kind":"assigned.to_me"}`, `{"kind":"task.moved","project_id":"p"}`,
		`{"kind":"task.moved","project_id":"p","section_id":"s"}`, `{"kind":"due.reached"}`, `{"kind":"overdue"}`,
		`{"kind":"schedule","at":"18:00","weekdays":[7]}`, `{"kind":"schedule","at":"00:05","weekdays":[1,2,3,4,5,6,7]}`,
	}
	for _, s := range ok {
		if _, err := ParseTrigger(json.RawMessage(s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
	bad := map[string]string{
		"unknown kind":          `{"kind":"task.starred"}`,
		"schedule no weekday":   `{"kind":"schedule","at":"18:00","weekdays":[]}`,
		"schedule 6pm":          `{"kind":"schedule","at":"6pm","weekdays":[1]}`,
		"weekday 8":             `{"kind":"schedule","at":"18:00","weekdays":[8]}`,
		"repeated weekday":      `{"kind":"schedule","at":"18:00","weekdays":[1,1]}`,
		"label without id":      `{"kind":"label.added"}`,
		"extra member":          `{"kind":"task.created","label_id":"l"}`,
		"moved without project": `{"kind":"task.moved"}`,
		"not an object":         `"task.created"`,
		"null":                  `null`,
	}
	for name, s := range bad {
		if _, err := ParseTrigger(json.RawMessage(s)); err == nil {
			t.Errorf("%s: accepted %s", name, s)
		}
	}
}

func TestParseCondition(t *testing.T) {
	ok := []string{
		`{}`, `{"project":"none"}`, `{"project":{"in":["p"],"descendants":true}}`, `{"section":{"in":["s"]}}`,
		`{"labels":{"any":["a"],"none":["b"]}}`, `{"priority":{"in":[1,2]}}`, `{"due":"overdue"}`, `{"due":{"within_days":3}}`,
		`{"deadline":"set"}`, `{"start":"deferred"}`, `{"evening":true}`, `{"blocked":false}`, `{"assignee":"me"}`,
		`{"origin":{"kind":"issue"}}`, `{"origin":"none"}`, `{"habit":true}`, `{"estimate":{"max_minutes":30}}`,
		`{"tracked":{"min_minutes":60}}`, `{"tracked":"none"}`,
	}
	for _, s := range ok {
		if _, err := ParseCondition(json.RawMessage(s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
	bad := []string{
		`{"title":"x"}`, `{"due":"tomorrow"}`, `{"deadline":"today"}`, `{"due":{"within_days":400}}`, `{"priority":{"in":[5]}}`,
		`{"project":{"in":[]}}`, `{"labels":{}}`, `{"origin":{"kind":"fax"}}`, `{"tracked":{"max_minutes":10}}`,
		`{"estimate":{"min_minutes":1,"max_minutes":2}}`, `{"assignee":"bob"}`, `[]`,
		`{"labels":{"any":["` + strings.Repeat("x", 65) + `"]}}`,
	}
	for _, s := range bad {
		if _, err := ParseCondition(json.RawMessage(s)); err == nil {
			t.Errorf("accepted %s", s)
		}
	}
	many := make([]string, 33)
	for i := range many {
		many[i] = "l"
	}
	b, _ := json.Marshal(map[string]any{"labels": map[string]any{"any": many}})
	if _, err := ParseCondition(b); err == nil {
		t.Error("accepted 33 label ids")
	}
}

func TestParseActions(t *testing.T) {
	ok := []string{
		`{"add_labels":["a"],"remove_labels":["b"]}`, `{"priority":1}`, `{"due":"next-week"}`, `{"due":{"in_days":3}}`,
		`{"due":"clear"}`, `{"start":"someday"}`, `{"section":{"project_id":"p","section_id":null}}`, `{"state":"complete"}`,
		`{"deadline":{"in_days":7}}`, `{"deadline":"clear"}`, `{"assignee":"me"}`, `{"comment":{"text":"Picked up"}}`,
		`{"notify":true}`, `{"webhook":{"webhook_id":"w1"}}`,
	}
	for _, s := range ok {
		if _, err := ParseActions(json.RawMessage(s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
	bad := []string{
		`{}`, `{"colour":"red"}`, `{"priority":5}`, `{"due":"soon"}`, `{"deadline":"today"}`, `{"notify":false}`,
		`{"comment":{"text":""}}`, `{"comment":{"text":"` + strings.Repeat("x", 2001) + `"}}`, `{"assignee":"bob"}`,
		`{"webhook":{}}`, `{"section":{"project_id":""}}`, `{"due":{"in_days":366}}`, `null`,
	}
	for _, s := range bad {
		if _, err := ParseActions(json.RawMessage(s)); err == nil {
			t.Errorf("accepted %s", s)
		}
	}
	a, _ := ParseActions(json.RawMessage(`{"due":{"in_days":3},"assignee":"clear","notify":true}`))
	if a.Due.Word != "in_days" || a.Due.InDays != 3 || *a.Assignee != "clear" || !a.Notify {
		t.Fatalf("decoded %+v", a)
	}
}

type vector struct {
	Name      string          `json:"name"`
	Now       int64           `json:"now"`
	Offset    int             `json:"offset_minutes"`
	DayStart  string          `json:"day_start"`
	Condition json.RawMessage `json:"condition"`
	Task      struct {
		ProjectID  *string                `json:"project_id"`
		SectionID  *string                `json:"section_id"`
		Labels     []string               `json:"labels"`
		Priority   int                    `json:"priority"`
		Due        *struct{ Date string } `json:"due"`
		Deadline   *string                `json:"deadline"`
		Start      *string                `json:"start"`
		Evening    bool                   `json:"evening"`
		BlockedBy  []string               `json:"blocked_by"`
		AssigneeID *string                `json:"assignee_id"`
		Origin     json.RawMessage        `json:"origin"`
		Habit      bool                   `json:"habit"`
		Estimate   *int                   `json:"estimate_minutes"`
	} `json:"task"`
	Projects map[string]string `json:"projects"`
	Open     []string          `json:"open"`
	Tracked  map[string]int    `json:"tracked"`
	Match    bool              `json:"match"`
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// TestVectors: the matcher agrees with web/src/lib/rules/match.ts on every vector.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/rules/match.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vs []vector
	if err := json.Unmarshal(raw, &vs); err != nil {
		t.Fatal(err)
	}
	if len(vs) < 40 {
		t.Fatalf("only %d vectors", len(vs))
	}
	for _, v := range vs {
		var cond *Condition
		if string(v.Condition) != "null" && len(v.Condition) > 0 {
			c, err := ParseCondition(v.Condition)
			if err != nil {
				t.Fatalf("%s: condition: %v", v.Name, err)
			}
			cond = &c
		}
		task := Task{ID: "t", ProjectID: deref(v.Task.ProjectID), SectionID: deref(v.Task.SectionID), Labels: v.Task.Labels,
			Priority: v.Task.Priority, Deadline: deref(v.Task.Deadline), Start: deref(v.Task.Start), Evening: v.Task.Evening,
			BlockedBy: v.Task.BlockedBy, AssigneeID: deref(v.Task.AssigneeID), Habit: v.Task.Habit, Estimate: v.Task.Estimate,
			OriginKind: OriginKindOf(v.Task.Origin)}
		if v.Task.Due != nil {
			task.DueDate = v.Task.Due.Date
		}
		open := map[string]bool{}
		for _, id := range v.Open {
			open[id] = true
		}
		ctx := Context{UserID: "me", Today: LogicalDate(v.Now, v.Offset, v.DayStart), Parent: v.Projects,
			Open: func(id string) bool { return open[id] }, Tracked: func(id string) int { return v.Tracked[id] }}
		if got := Matches(cond, task, ctx); got != v.Match {
			t.Errorf("%s: Matches = %v, want %v (today %s)", v.Name, got, v.Match, ctx.Today)
		}
	}
}

func TestLogicalDate(t *testing.T) {
	// 2026-10-20T01:30Z with the day starting at 03:00 is still the 19th.
	if d := LogicalDate(1792459800000, 0, "03:00"); d != "2026-10-19" {
		t.Fatalf("got %s", d)
	}
	if d := LogicalDate(1792459800000, 0, "garbage"); d != "2026-10-20" {
		t.Fatalf("got %s", d)
	}
	if d := LogicalDate(1792623600000, 120, "00:00"); d != "2026-10-22" {
		t.Fatalf("got %s", d)
	}
}
