package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/url"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/activity"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The activity feed reads entities newest first instead of every project's
// whole history (OpenSpec change `server-query-costs`). These tests check that
// every page is the one the whole history gives, and what a first page costs.

// feedReference is the feed as it was computed before: every shared project's
// whole history derived, filtered and ordered newest first.
func feedReference(t *testing.T, e *env, uid, project, actor, kind string) []activity.Event {
	t.Helper()
	ms, err := e.sync.Memberships(context.Background(), uid)
	if err != nil {
		t.Fatal(err)
	}
	var events []activity.Event
	for _, m := range ms {
		if project != "" && m.ProjectID != project {
			continue
		}
		ops, err := e.sync.ActivityOps(context.Background(), uid, "project", m.ProjectID)
		if err != nil {
			t.Fatal(err)
		}
		for _, ev := range activity.Derive(toActivityOps(ops), nil) {
			if (actor == "" || ev.Actor == actor) && (kind == "" || activity.FeedKindOf(ev.Kind) == kind) {
				events = append(events, ev)
			}
		}
	}
	activity.Newest(events)
	return events
}

func eventKey(e activity.Event) string {
	b, _ := json.Marshal(e)
	return string(b)
}

func TestFeedPagesMatchWholeHistory(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	ctx := context.Background()
	alice, bob := se.ids["alice"], se.ids["bob"]
	// A second shared project, and one private project that never shows.
	resp, out := se.alice.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	se.alice.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = se.alice.do("POST", "/api/v1/projects/"+work+"/members", map[string]any{"email": "bob@example.com", "role": "editor"})
	se.alice.mustStatus(resp, 201, out)

	rng := rand.New(rand.NewPCG(7, 11))
	base := time.Now().Add(-48 * time.Hour).UnixMilli()
	seq := 0
	opID := func() string { seq++; return fmt.Sprintf("feedop-%05d", seq) }
	type task struct{ id, project string }
	var tasks []task
	for i := range 40 {
		p := se.project
		if i%3 == 0 {
			p = work
		}
		tasks = append(tasks, task{fmt.Sprintf("ft%02d", i), p})
	}
	var create []opsync.Op
	for _, tk := range tasks {
		for _, f := range [][2]string{{"title", `"New"`}, {"project_id", fmt.Sprintf("%q", tk.project)}} {
			create = append(create, opsync.Op{ID: opID(), Entity: "task", EntityID: tk.id, Field: f[0], Value: json.RawMessage(f[1]), TS: base - 1000, Device: "A"})
		}
	}
	if _, err := se.alice.sync.Apply(ctx, alice, create); err != nil {
		t.Fatal(err)
	}
	users := []string{alice, bob}
	applied, refused := 0, 0
	devices := []string{"A", "B", "public:link1"}
	for round := range 60 {
		user := users[rng.IntN(2)]
		var ops []opsync.Op
		// Clustered times: ops land within the 5 s window of each other often.
		ts := base + int64(round)*int64(rng.IntN(9000)+1) + int64(rng.IntN(3))*1000
		for range rng.IntN(6) + 1 {
			tk := tasks[rng.IntN(len(tasks))]
			dev := devices[rng.IntN(len(devices))]
			if user == alice && dev == "public:link1" {
				dev = "A"
			}
			ts += int64(rng.IntN(4000))
			add := func(field, value string) {
				ops = append(ops, opsync.Op{ID: opID(), Entity: "task", EntityID: tk.id, Field: field, Value: json.RawMessage(value), TS: ts, Device: dev})
			}
			switch rng.IntN(7) {
			case 0:
				add("title", fmt.Sprintf(`"Task %d"`, rng.IntN(3)))
				add("project_id", fmt.Sprintf("%q", tk.project))
				add("created_at", fmt.Sprint(ts))
			case 1:
				add("completed_at", fmt.Sprint(ts))
			case 2:
				add("completed_at", "null")
			case 3:
				add("due", fmt.Sprintf(`{"date":"2026-10-%02d"}`, rng.IntN(3)+10))
			case 4:
				add("notes_doc", fmt.Sprintf(`"yjs:v1:%s"`, strings.Repeat("QUFB", 25)))
				add("description", fmt.Sprintf(`"d%d"`, rng.IntN(2)))
			case 5:
				add("priority", fmt.Sprint(rng.IntN(4)+1))
			case 6:
				cid := fmt.Sprintf("fc%03d", seq)
				for _, f := range [][2]string{{"task_id", fmt.Sprintf("%q", tk.id)}, {"author_id", fmt.Sprintf("%q", user)}, {"body", `"hi"`}, {"created_at", fmt.Sprint(ts)}} {
					ops = append(ops, opsync.Op{ID: opID(), Entity: "comment", EntityID: cid, Field: f[0], Value: json.RawMessage(f[1]), TS: ts, Device: dev})
				}
			}
		}
		res, err := se.alice.sync.Apply(ctx, user, ops)
		if err != nil {
			t.Fatal(err)
		}
		applied, refused = applied+res.Applied, refused+len(res.Rejected)
	}
	all := feedReference(t, se.alice, alice, "", "", "")
	kinds := map[string]int{}
	for _, ev := range all {
		kinds[ev.Kind]++
	}
	t.Logf("%d ops applied, %d refused; %d events %v", applied, refused, len(all), kinds)
	// Ops Apply refuses (a task's first op in a batch that does not place it)
	// simply appear in neither computation.
	for _, c := range []struct{ uid, project, actor, kind string }{
		{alice, "", "", ""}, {bob, "", "", ""}, {alice, work, "", ""}, {alice, "", bob, ""},
		{alice, "", "", "completed"}, {bob, "", alice, "commented"}, {alice, se.project, "", "other"},
	} {
		ref := feedReference(t, se.alice, c.uid, c.project, c.actor, c.kind)
		for _, limit := range []int{1, 3, 7, 50} {
			cursor := ""
			for pageNo := 0; ; pageNo++ {
				want, wantNext, err := activity.Page(ref, cursor, limit)
				if err != nil {
					t.Fatal(err)
				}
				got, gotNext, _, err := (&Server{sync: se.alice.sync}).feedPage(ctx, c.uid, c.project, c.actor, c.kind, cursor, limit)
				if err != nil {
					t.Fatal(err)
				}
				if len(got) != len(want) || gotNext != wantNext {
					t.Fatalf("%+v limit %d page %d: got %d events next %q, want %d next %q", c, limit, pageNo, len(got), gotNext, len(want), wantNext)
				}
				for i := range got {
					if eventKey(got[i]) != eventKey(want[i]) {
						t.Fatalf("%+v limit %d page %d event %d:\n got %s\nwant %s", c, limit, pageNo, i, eventKey(got[i]), eventKey(want[i]))
					}
				}
				if wantNext == "" {
					break
				}
				cursor = wantNext
			}
		}
	}
	// The route serves the same first page.
	resp, out = se.alice.do("GET", "/api/v1/activity?limit=5&actor="+url.QueryEscape(bob), nil)
	se.alice.mustStatus(resp, 200, out)
	want := feedReference(t, se.alice, alice, "", bob, "")
	if evs := out["events"].([]any); len(evs) != 5 || evs[0].(map[string]any)["id"] != want[0].ID || out["cursor"] != activity.Cursor(want[4]) {
		t.Fatalf("route page = %v, want 5 events starting %s", out, want[0].ID)
	}
}

// A first page of a project with a long history reads a few entities, not the
// whole log, and never the opaque document fields.
func TestFeedFirstPageCostDoesNotGrowWithHistory(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	ctx := context.Background()
	alice := se.ids["alice"]
	const tasks = 2000
	doc := fmt.Sprintf(`"yjs:v1:%s"`, strings.Repeat("QUFB", 1000))
	ts := time.Now().Add(-24 * time.Hour).UnixMilli()
	for start := 0; start < tasks; start += 100 {
		var ops []opsync.Op
		for i := start; i < start+100; i++ {
			id := fmt.Sprintf("big%05d", i)
			ts += 10_000
			for _, f := range [][2]string{{"title", `"T"`}, {"project_id", fmt.Sprintf("%q", se.project)}, {"created_at", fmt.Sprint(ts)}, {"notes_doc", doc}, {"description", `"text"`}} {
				ops = append(ops, opsync.Op{ID: id + f[0], Entity: "task", EntityID: id, Field: f[0], Value: json.RawMessage(f[1]), TS: ts, Device: "A"})
			}
		}
		if _, err := se.alice.sync.Apply(ctx, alice, ops); err != nil {
			t.Fatal(err)
		}
	}
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	start := time.Now()
	resp, out := se.alice.do("GET", "/api/v1/activity?limit=20", nil)
	took := time.Since(start)
	runtime.ReadMemStats(&after)
	se.alice.mustStatus(resp, 200, out)
	if evs := out["events"].([]any); len(evs) != 20 || out["more"] != true {
		t.Fatalf("first page = %d events more %v", len(evs), out["more"])
	}
	allocated := after.TotalAlloc - before.TotalAlloc
	t.Logf("first feed page over %d tasks: %v, %d KiB allocated", tasks, took, allocated/1024)
	// The opaque documents alone are 2000 x 4 KB = 8 MB.
	if allocated > 4<<20 {
		t.Fatalf("first page allocated %d KiB: the whole history is read", allocated/1024)
	}
}
