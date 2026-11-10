package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// find_free_time on the device against the server's (OpenSpec change
// assistant-time-blocks, task 1.2): freeTimeRead.vectors.json holds the rows,
// the calls and the registry's answers, written by `go test ./internal/assistant
// -run Device -update`; web/src/lib/assistantDevice/readFreeTime.test.ts runs
// the same calls over the same rows. The free stretches themselves are pinned
// by web/src/lib/freeTime.vectors.json; these pin the arguments, the defaults,
// the exclusions and the result's shape. Neither side has calendar events here.

type freeReadCase struct {
	Name   string          `json:"name"`
	Args   json.RawMessage `json:"args"`
	Error  string          `json:"error,omitempty"`
	Result map[string]any  `json:"result,omitempty"`
}

type freeReadVectors struct {
	Comment  string                      `json:"_comment"`
	User     string                      `json:"user"`
	Now      int64                       `json:"now"`
	KeptAway []string                    `json:"kept_away"`
	Rows     map[string][]map[string]any `json:"rows"`
	Cases    []freeReadCase              `json:"cases"`
}

func freeTimeRows() map[string][]map[string]any {
	task := func(id, title, pid string, due map[string]any, est any, done any) map[string]any {
		var p any
		if pid != "" {
			p = pid
		}
		return map[string]any{"id": id, "title": title, "project_id": p, "priority": 4, "labels": []string{}, "due": due, "estimate_minutes": est,
			"created_at": 1, "deleted_at": nil, "completed_at": done}
	}
	at := func(date, clock string) map[string]any { return map[string]any{"date": date, "time": clock} }
	return map[string][]map[string]any{
		"project": {
			{"id": "work", "name": "Work", "color": "#2563eb", "position": 1, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": nil},
			{"id": "private", "name": "Private", "color": "#16a34a", "position": 2, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": nil},
		},
		"task": {
			task("t1", "Review", "work", at("2026-10-13", "09:00"), 90, nil),
			task("t2", "Call", "", at("2026-10-13", "14:00"), nil, nil),
			task("t3", "Done", "", at("2026-10-13", "16:00"), 60, 5),
			task("t4", "Secret", "private", at("2026-10-13", "17:00"), 60, nil),
			task("t5", "Untimed", "", map[string]any{"date": "2026-10-13"}, 120, nil),
			task("t6", "Abroad", "", map[string]any{"date": "2026-10-13", "time": "12:00", "tz": "America/New_York"}, 60, nil),
			task("t7", "This morning", "", at("2026-10-12", "11:00"), 60, nil),
		},
		"frame": {
			{"id": "f1", "title": "Deep work", "weekdays": "2,4", "start": "07:00", "end": "08:30", "color": "#2563eb", "source": "", "from_date": nil, "until_date": nil, "position": 1, "created_at": 1, "deleted_at": nil},
			{"id": "f2", "title": "Gone", "weekdays": "2", "start": "19:00", "end": "20:00", "color": "", "source": "", "from_date": nil, "until_date": nil, "position": 2, "created_at": 1, "deleted_at": 9},
		},
		"slot": {
			{"id": "s1", "title": "Admin", "date": "2026-10-13", "start": "20:00", "minutes": 45, "color": "", "task_ids": []string{}, "created_at": 1, "deleted_at": nil},
			{"id": "s2", "title": "Trashed", "date": "2026-10-13", "start": "06:00", "minutes": 60, "color": "", "task_ids": []string{}, "created_at": 1, "deleted_at": 9},
		},
	}
}

var freeReadCalls = []struct {
	name string
	args map[string]any
}{
	{"today from now", map[string]any{}},
	{"a day with everything", map[string]any{"from": "2026-10-13", "timezone": "UTC"}},
	{"the working day given", map[string]any{"from": "2026-10-13", "day_start_hour": 8, "day_end_hour": 18, "min_minutes": 60}},
	{"in another zone", map[string]any{"from": "2026-10-13", "timezone": "Europe/Berlin", "min_minutes": 45}},
	{"a week of two hours", map[string]any{"from": "2026-10-12", "to": "2026-10-18", "min_minutes": 120}},
	{"fourteen days", map[string]any{"from": "2026-10-12", "to": "2026-10-25", "min_minutes": 720}},
	{"fifteen days", map[string]any{"from": "2026-10-12", "to": "2026-10-26"}},
	{"to before from", map[string]any{"from": "2026-10-13", "to": "2026-10-12"}},
	{"a minimum of zero", map[string]any{"min_minutes": 0}},
	{"hours the wrong way round", map[string]any{"day_start_hour": 18, "day_end_hour": 9}},
	{"a fractional hour", map[string]any{"day_start_hour": 8.5}},
	{"a bad date", map[string]any{"from": "2026-02-30"}},
	{"an unknown argument", map[string]any{"days": 3}},
}

func TestDeviceFreeTimeVectors(t *testing.T) {
	f := newFixture(t)
	x := withExclusions(f)
	rows := freeTimeRows()
	for _, entity := range []string{"project", "task", "frame", "slot"} {
		for _, r := range rows[entity] {
			fields := map[string]any{}
			for k, v := range r {
				if k != "id" {
					fields[k] = v
				}
			}
			f.put("u1", entity, r["id"].(string), fields)
		}
	}
	if err := x.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	v := freeReadVectors{User: "u1", Now: f.loop.Now().UnixMilli(), KeptAway: []string{"private"}, Rows: rows,
		Comment: "Generated by go test ./internal/assistant -run DeviceFreeTimeVectors -update. Results leave out server_time; an invalid_arguments error keeps its code only."}
	for _, call := range freeReadCalls {
		args, _ := json.Marshal(call.args)
		c := freeReadCase{Name: call.name, Args: args}
		p, err := f.loop.Tools.Plan(context.Background(), Caller("u1"), "find_free_time", args, nil)
		var ae *agenttools.ArgError
		switch {
		case errors.As(err, &ae):
			c.Error = "invalid_arguments"
		case err != nil:
			t.Fatalf("%s: %v", call.name, err)
		default:
			c.Result = deviceResult(p.Result)
		}
		v.Cases = append(v.Cases, c)
	}
	checkFile(t, "freeTimeRead.vectors.json", v)
}
