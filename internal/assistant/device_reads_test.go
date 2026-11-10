package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The on-device read tools against the server's (OpenSpec change
// assistant-device-reads, D1): read.vectors.json holds the writes behind the
// rows, the calls and the server's answers. `go test ./internal/assistant -run
// Device -update` rewrites it; web/src/lib/assistantDevice/readTools.test.ts
// runs the same calls over the same rows on the device.

// readWrite is one write of the rows: every field at the clock ts by device "dev".
type readWrite struct {
	Entity string         `json:"entity"`
	ID     string         `json:"id"`
	TS     int64          `json:"ts"`
	Fields map[string]any `json:"fields"`
}

type readCase struct {
	Name   string          `json:"name"`
	Tool   string          `json:"tool"`
	Args   json.RawMessage `json:"args"`
	Error  string          `json:"error,omitempty"`
	Result map[string]any  `json:"result,omitempty"`
}

type readVectors struct {
	Comment  string      `json:"_comment"`
	User     string      `json:"user"`
	Now      int64       `json:"now"`
	KeptAway []string    `json:"kept_away"`
	Writes   []readWrite `json:"writes"`
	Cases    []readCase  `json:"cases"`
}

const ts0 = int64(1_790_000_000_000) // 2026-09-21

// at is a write clock n minutes after ts0.
func at(n int64) int64 { return ts0 + n*60_000 }

func readWrites() []readWrite {
	day := func(h, m int) int64 { return 1_791_763_200_000 + int64(h)*3_600_000 + int64(m)*60_000 } // 2026-10-12 00:00 UTC
	w := func(entity, id string, ts int64, fields map[string]any) readWrite {
		return readWrite{Entity: entity, ID: id, TS: ts, Fields: fields}
	}
	project := func(name string, extra map[string]any) map[string]any {
		f := map[string]any{"name": name, "color": "#2563eb", "position": 1, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": nil}
		for k, v := range extra {
			f[k] = v
		}
		return f
	}
	task := func(title, pid string, extra map[string]any) map[string]any {
		f := map[string]any{"title": title, "project_id": nil, "priority": 4, "labels": []string{}, "created_at": 2, "deleted_at": nil, "completed_at": nil}
		if pid != "" {
			f["project_id"] = pid
		}
		for k, v := range extra {
			f[k] = v
		}
		return f
	}
	note := func(title, pid, text string, extra map[string]any) map[string]any {
		f := map[string]any{"title": title, "description": text, "project_id": nil, "labels": []string{}, "created_at": 3, "deleted_at": nil}
		if pid != "" {
			f["project_id"] = pid
		}
		for k, v := range extra {
			f[k] = v
		}
		return f
	}
	entry := func(tid string, start int64, end any, extra map[string]any) map[string]any {
		f := map[string]any{"task_id": tid, "user_id": "u1", "started_at": start, "ended_at": end, "note": "", "created_at": start, "deleted_at": nil}
		for k, v := range extra {
			f[k] = v
		}
		return f
	}
	return []readWrite{
		w("user_prefs", "me", ts0, map[string]any{"day_start": "01:00"}),
		w("project", "move", at(10), project("Moving house", map[string]any{"description": "Everything about the move to Leeds."})),
		w("project", "work", at(11), project("Work", nil)),
		w("project", "attic", at(12), project("Attic", map[string]any{"archived": true, "description": "Old boxes, keep for the move?"})),
		w("project", "private", at(13), project("Private", map[string]any{"description": "Move money"})),
		w("project", "old", at(14), project("Old", map[string]any{"deleted_at": 5, "description": "Move gone"})),
		w("label", "ideas", at(15), map[string]any{"name": "Ideas", "color": "#dc2626", "position": 1, "created_at": 1, "deleted_at": nil}),
		w("task", "t1", at(20), task("Book the movers", "move", map[string]any{"description": "Call **Swift Movers** about the van.\n\n- quote\n- date", "estimate_minutes": 30, "due": map[string]any{"date": "2026-10-14"}})),
		w("task", "t2", at(21), task("Pay rent", "", map[string]any{"estimate_minutes": 10})),
		w("task", "t3", at(22), task("Pack books", "move", map[string]any{"description": "Done: twelve boxes", "completed_at": day(7, 0)})),
		w("task", "hidden", at(23), task("Secret plan", "private", map[string]any{"description": "Move the savings"})),
		w("task", "orphan", at(24), task("Lost", "old", map[string]any{"description": "Move it"})),
		w("task", "t4", at(25), task("Label the boxes", "move", map[string]any{"labels": []string{"ideas"}, "due": map[string]any{"date": "2026-10-20"}})),
		w("task", "t4", at(400), map[string]any{"appends.a1": "Use the green tape"}),
		w("task", "gone", at(26), task("Deleted", "", map[string]any{"description": "Move deleted", "deleted_at": 9})),
		w("note", "n1", at(30), note("Moving checklist", "move", "# Before\n\nBook the van, cancel the internet, *move* the plants.", map[string]any{"labels": []string{"ideas"}})),
		w("note", "n2", at(31), note("", "", "A note without a title about nothing", nil)),
		w("note", "n3", at(32), note("Private thoughts", "private", "Move abroad?", nil)),
		w("note", "n4", at(33), note("Trashed", "", "Move", map[string]any{"deleted_at": 9})),
		w("note", "n5", at(34), note("Café ideas", "", "", map[string]any{"labels": []string{"ideas"}})),
		w("note", "n5", at(500), map[string]any{"appends.b1": "Try the crème brûlée", "appends.b2": "Ask about the moving sale"}),
		w("note", "n1", at(600), map[string]any{"title": "Moving checklist (v2)"}),
		w("time_entry", "e1", at(40), entry("t1", day(8, 0), day(9, 30), map[string]any{"note": "Phoned three firms"})),
		w("time_entry", "e2", at(41), entry("t2", day(0, 30), day(0, 50), nil)),
		w("time_entry", "e3", at(42), entry("t1", day(9, 40), nil, map[string]any{"focus_mode": "pomodoro", "focus_session": 2, "planned_end_at": day(10, 5)})),
		w("time_entry", "e4", at(43), entry("hidden", day(6, 0), day(7, 0), nil)),
		w("time_entry", "e5", at(44), entry("t2", day(5, 0), day(6, 0), map[string]any{"deleted_at": 9})),
		w("time_entry", "e6", at(45), entry("t3", day(-20, 0), day(-19, 15), nil)),
		w("time_entry", "e7", at(46), entry("t2", day(8, 0), day(8, 45), nil)),
		w("frame", "f1", at(50), map[string]any{"title": "Deep work", "weekdays": "1,2,3,4,5", "start": "09:00", "end": "11:00", "color": "#2563eb", "source": "project:work", "from_date": nil, "until_date": nil, "position": 1, "created_at": 1, "deleted_at": nil}),
		w("frame", "f2", at(51), map[string]any{"title": "Packing", "weekdays": "6,7", "start": "10:00", "end": "12:30", "color": "#16a34a", "source": "project:move", "from_date": "2026-10-17", "until_date": "2026-10-25", "position": 2, "created_at": 1, "deleted_at": nil}),
		w("frame", "f3", at(52), map[string]any{"title": "Gone", "weekdays": "1", "start": "09:00", "end": "10:00", "color": "", "source": "", "position": 3, "created_at": 1, "deleted_at": 9}),
		w("frame", "f4", at(53), map[string]any{"title": "Broken", "weekdays": "1", "start": "11:00", "end": "10:00", "color": "", "source": "", "position": 4, "created_at": 1, "deleted_at": nil}),
		w("frame", "f5", at(54), map[string]any{"title": "Early", "weekdays": "1,3", "start": "07:30", "end": "08:00", "color": "#64748b", "source": "label:ideas", "from_date": nil, "until_date": nil, "position": 5, "created_at": 1, "deleted_at": nil}),
		w("slot", "s1", at(60), map[string]any{"title": "Admin", "date": "2026-10-14", "start": "16:00", "minutes": 45, "color": "#2563eb", "task_ids": []string{"t3", "t2", "hidden", "t4", "missing", "t1", "gone"}, "created_at": 1, "deleted_at": nil}),
		w("slot", "s2", at(61), map[string]any{"title": "", "date": "2026-10-12", "start": "13:00", "minutes": 30, "color": "", "task_ids": []string{"orphan"}, "created_at": 1, "deleted_at": nil}),
		w("slot", "s3", at(62), map[string]any{"title": "Trashed", "date": "2026-10-13", "start": "09:00", "minutes": 30, "color": "", "task_ids": []string{}, "created_at": 1, "deleted_at": 9}),
		w("slot", "s4", at(63), map[string]any{"title": "Later", "date": "2026-11-30", "start": "08:00", "minutes": 60, "color": "", "task_ids": []string{"t2"}, "created_at": 1, "deleted_at": nil}),
		w("slot", "s5", at(64), map[string]any{"title": "Morning", "date": "2026-10-14", "start": "08:30", "minutes": 15, "color": "", "task_ids": []string{}, "created_at": 1, "deleted_at": nil}),
	}
}

var readCalls = []struct {
	name, tool string
	args       any
}{
	{"notes: all", "list_notes", map[string]any{}},
	{"notes: standalone", "list_notes", map[string]any{"source": "note"}},
	{"notes: task notes", "list_notes", map[string]any{"source": "task"}},
	{"notes: project notes", "list_notes", map[string]any{"source": "project"}},
	{"notes: one project", "list_notes", map[string]any{"project_id": "move"}},
	{"notes: label by name", "list_notes", map[string]any{"label_id": " IDEAS "}},
	{"notes: unknown label", "list_notes", map[string]any{"label_id": "nope"}},
	{"notes: limit", "list_notes", map[string]any{"limit": 2}},
	{"notes: limit above the maximum", "list_notes", map[string]any{"limit": 500, "source": "project"}},
	{"notes: limit zero", "list_notes", map[string]any{"limit": 0}},
	{"notes: bad source", "list_notes", map[string]any{"source": "everything"}},
	{"notes: unknown argument", "list_notes", map[string]any{"cursor": "x", "page": 2}},
	{"search: one word", "search_notes", map[string]any{"query": "move"}},
	{"search: accents", "search_notes", map[string]any{"query": "creme"}},
	{"search: phrase", "search_notes", map[string]any{"query": `"the van"`}},
	{"search: two words", "search_notes", map[string]any{"query": "move plants"}},
	{"search: in task notes", "search_notes", map[string]any{"query": "move", "source": "task"}},
	{"search: limit", "search_notes", map[string]any{"query": "move", "limit": 1}},
	{"search: nothing", "search_notes", map[string]any{"query": "zebra"}},
	{"search: empty", "search_notes", map[string]any{"query": "  "}},
	{"search: no query", "search_notes", map[string]any{}},
	{"note: standalone", "get_note", map[string]any{"id": "n1"}},
	{"note: untitled", "get_note", map[string]any{"id": "n2", "kind": "note"}},
	{"note: appended", "get_note", map[string]any{"id": "n5"}},
	{"note: a task's", "get_note", map[string]any{"id": "t4", "kind": "task"}},
	{"note: a completed task's", "get_note", map[string]any{"id": "t3", "kind": "task"}},
	{"note: a project's", "get_note", map[string]any{"id": "attic", "kind": "project"}},
	{"note: kept away", "get_note", map[string]any{"id": "n3"}},
	{"note: kept-away task", "get_note", map[string]any{"id": "hidden", "kind": "task"}},
	{"note: deleted", "get_note", map[string]any{"id": "n4"}},
	{"note: unknown", "get_note", map[string]any{"id": "nope"}},
	{"note: bad kind", "get_note", map[string]any{"id": "n1", "kind": "comment"}},
	{"note: no id", "get_note", map[string]any{"kind": "note"}},
	{"time: all", "list_time_entries", map[string]any{}},
	{"time: today with the day start", "list_time_entries", map[string]any{"from": "2026-10-12", "to": "2026-10-12"}},
	{"time: yesterday", "list_time_entries", map[string]any{"to": "2026-10-11"}},
	{"time: in a zone", "list_time_entries", map[string]any{"from": "2026-10-12", "timezone": "America/New_York"}},
	{"time: running", "list_time_entries", map[string]any{"running": true}},
	{"time: one task", "list_time_entries", map[string]any{"task_id": "t2"}},
	{"time: kept-away task", "list_time_entries", map[string]any{"task_id": "hidden"}},
	{"time: limit", "list_time_entries", map[string]any{"limit": 2}},
	{"time: to before from", "list_time_entries", map[string]any{"from": "2026-10-12", "to": "2026-10-11"}},
	{"time: bad date", "list_time_entries", map[string]any{"from": "2026-13-01"}},
	{"time: bad zone", "list_time_entries", map[string]any{"timezone": "Mars/Olympus"}},
	{"frames: this week", "list_frames", map[string]any{}},
	{"frames: a range", "list_frames", map[string]any{"from": "2026-10-16", "to": "2026-10-19"}},
	{"frames: in a zone", "list_frames", map[string]any{"to": "2026-10-13", "timezone": "Pacific/Auckland"}},
	{"frames: 31 days", "list_frames", map[string]any{"from": "2026-10-01", "to": "2026-10-31"}},
	{"frames: 32 days", "list_frames", map[string]any{"from": "2026-10-01", "to": "2026-11-01"}},
	{"frames: to before from", "list_frames", map[string]any{"from": "2026-10-12", "to": "2026-10-11"}},
	{"frames: unknown argument", "list_frames", map[string]any{"days": 3}},
	{"slots: this week", "list_slots", map[string]any{}},
	{"slots: one day", "list_slots", map[string]any{"from": "2026-10-14", "to": "2026-10-14"}},
	{"slots: far ahead", "list_slots", map[string]any{"from": "2026-11-29"}},
	{"slots: 32 days", "list_slots", map[string]any{"from": "2026-10-01", "to": "2026-11-01"}},
}

// deviceResult is a server answer as the device gives it: no server_time, and
// no cursor (the device does not page; a next page reads as truncated: true).
func deviceResult(res map[string]any) map[string]any {
	b, _ := json.Marshal(res)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	delete(out, "server_time")
	if c, ok := out["next_cursor"]; ok {
		delete(out, "next_cursor")
		if c != nil {
			out["truncated"] = true
		}
	}
	return out
}

func TestDeviceReadVectors(t *testing.T) {
	f := newFixture(t)
	x := withExclusions(f)
	writes := readWrites()
	for _, w := range writes {
		keys := make([]string, 0, len(w.Fields))
		for k := range w.Fields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var ops []opsync.Op
		for _, k := range keys {
			raw, _ := json.Marshal(w.Fields[k])
			ops = append(ops, opsync.Op{ID: ids.New(), Entity: w.Entity, EntityID: w.ID, Field: k, Value: raw, TS: w.TS, Device: "dev"})
		}
		if _, err := f.sync.ApplyStrict(context.Background(), "u1", ops); err != nil {
			t.Fatalf("%s %s: %v", w.Entity, w.ID, err)
		}
	}
	if err := x.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	rv := readVectors{User: "u1", Now: f.loop.Now().UnixMilli(), KeptAway: []string{"private"}, Writes: writes,
		Comment: "Generated by go test ./internal/assistant -run DeviceReadVectors -update. Results leave out server_time; the device has no cursor, so a next page reads as truncated: true. The server answers as for an account with end-to-end encryption (no note links), except search_notes, which the device runs over its decrypted notes."}
	for _, call := range readCalls {
		args, _ := json.Marshal(call.args)
		c := Caller("u1")
		c.Encrypted = call.tool != "search_notes"
		p, err := f.loop.Tools.Plan(context.Background(), c, call.tool, args, nil)
		rc := readCase{Name: call.name, Tool: call.tool, Args: args}
		if err != nil {
			var te *agenttools.ToolError
			var ae *agenttools.ArgError
			switch {
			case errors.As(err, &ae):
				rc.Error = "invalid_arguments"
			case errors.As(err, &te) && te.Code != "":
				rc.Error = te.Code
			case errors.As(err, &te):
				rc.Error = te.Message
			default:
				t.Fatalf("%s: %v", call.name, err)
			}
		} else {
			rc.Result = deviceResult(p.Result)
		}
		rv.Cases = append(rv.Cases, rc)
	}
	// The vectors must show what they claim: a kept-away note never matches.
	raw, _ := json.Marshal(rv.Cases)
	for _, gone := range []string{"Private thoughts", "Secret plan", "Move the savings"} {
		if strings.Contains(string(raw), gone) {
			t.Fatalf("a result shows %q", gone)
		}
	}
	checkFile(t, "read.vectors.json", rv)
}

// The device's descriptions keep the registry's, less a sentence named to drop.
func TestDeviceToolDescriptions(t *testing.T) {
	f := newFixture(t)
	for _, dt := range deviceTools {
		if dt.drop == "" {
			continue
		}
		d, ok := f.loop.Tools.Lookup(dt.name, Caller("device"))
		if !ok || !strings.Contains(d.Description, dt.drop) {
			t.Fatalf("%s: the description no longer has %q", dt.name, dt.drop)
		}
	}
}
