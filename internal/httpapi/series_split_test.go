package httpapi

import (
	"net/http"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// OpenSpec change series-split, "Split through the API and CLI".

func TestSplitSeriesThroughTheAPI(t *testing.T) {
	e := ownerEnv(t)
	e.now.Freeze(time.Date(2026, 10, 12, 12, 0, 0, 0, time.Local))
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2026-10-12", "time": "18:00"}, "recurrence": "every weekday"})
	e.mustStatus(resp, 201, out)
	study := out["id"].(string)
	// Thursday the 15th was moved alone before the split.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+study+"/occurrences/2026-10-15", map[string]any{"due": map[string]any{"date": "2026-10-15", "time": "20:00"}})
	e.mustStatus(resp, 200, out)
	c := e.bearerClient()

	// Read and agent tokens are refused; nothing is written.
	for _, scope := range []string{"read", "agent"} {
		resp, out = c.do("POST", "/api/v1/tasks/"+study+"/split", map[string]any{"from": "2026-10-14", "changes": map[string]any{"title": "x"}}, bearer(e.token(scope))...)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("%s token = %d %v", scope, resp.StatusCode, out)
		}
	}
	// At the current occurrence, on a weekend, before it: not an occurrence to split from.
	for _, from := range []string{"2026-10-12", "2026-10-17", "2026-10-09"} {
		resp, out = e.do("POST", "/api/v1/tasks/"+study+"/split", map[string]any{"from": from, "changes": map[string]any{"title": "x"}})
		if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_an_occurrence" {
			t.Fatalf("from %s = %d %v", from, resp.StatusCode, out)
		}
	}
	for _, body := range []map[string]any{
		{"from": "soon", "changes": map[string]any{}},
		{"from": "2026-10-14", "changes": map[string]any{"split_from": nil}},
		{"from": "2026-10-14", "changes": map[string]any{"recurrence": "every 2 days after completion"}},
	} {
		resp, out = e.do("POST", "/api/v1/tasks/"+study+"/split", body)
		if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
			t.Fatalf("%v = %d %v", body, resp.StatusCode, out)
		}
	}

	// Split from a script: the piece from Wednesday at 19:00.
	resp, out = e.do("POST", "/api/v1/tasks/"+study+"/split", map[string]any{"from": "2026-10-14", "changes": map[string]any{"due": map[string]any{"date": "2026-10-14", "time": "19:00"}}})
	e.mustStatus(resp, 200, out)
	piece := out["id"].(string)
	if piece != opsync.PieceID(study, "2026-10-14") || out["recurrence"] != "every weekday" || out["title"] != "Study" {
		t.Fatalf("piece = %v", out)
	}
	if due := out["due"].(map[string]any); due["date"] != "2026-10-14" || due["time"] != "19:00" {
		t.Fatalf("piece due = %v", due)
	}
	if sf, _ := out["split_from"].(map[string]any); sf["series"] != study || sf["date"] != "2026-10-14" {
		t.Fatalf("split_from = %v", out["split_from"])
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+study, nil)
	e.mustStatus(resp, 200, out)
	if out["recurrence"] != "every weekday until 2026-10-13" || out["due"].(map[string]any)["time"] != "18:00" {
		t.Fatalf("series = %v", out)
	}
	// The occurrence list walks on into the piece, naming each date's series;
	// the moved Thursday stays the series' and is not projected by the piece.
	resp, out = e.do("GET", "/api/v1/tasks/"+study+"/occurrences?from=2026-10-12&to=2026-10-19", nil)
	e.mustStatus(resp, 200, out)
	type occ struct{ series, state, time string }
	got := map[string]occ{}
	for _, o := range out["occurrences"].([]any) {
		m := o.(map[string]any)
		tm, _ := m["time"].(string)
		got[m["date"].(string)] = occ{m["series_id"].(string), m["state"].(string), tm}
	}
	want := map[string]occ{
		"2026-10-12": {study, "current", "18:00"}, "2026-10-13": {study, "projected", "18:00"}, "2026-10-14": {piece, "current", "19:00"},
		"2026-10-15": {study, "open", "20:00"}, "2026-10-16": {piece, "projected", "19:00"}, "2026-10-19": {piece, "projected", "19:00"},
	}
	if len(got) != len(want) {
		t.Fatalf("occurrences = %v, want %v", got, want)
	}
	for d, w := range want {
		if got[d] != w {
			t.Errorf("%s = %v, want %v", d, got[d], w)
		}
	}
	// The same split again writes the same piece (its id is derived).
	resp, out = e.do("POST", "/api/v1/tasks/"+piece+"/split", map[string]any{"from": "2026-10-14", "changes": map[string]any{}})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_an_occurrence" {
		t.Fatalf("split at the piece's current = %d %v", resp.StatusCode, out)
	}
	// split_from never changes once set.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+piece, map[string]any{"split_from": map[string]any{"series": study, "date": "2026-10-15"}})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_input" {
		t.Fatalf("change split_from = %d %v", resp.StatusCode, out)
	}
}

func TestSplitSeriesNotSignedIn(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Study", "due": map[string]any{"date": "2099-10-12"}, "recurrence": "every day"})
	e.mustStatus(resp, 201, out)
	resp, out = e.bearerClient().do("POST", "/api/v1/tasks/"+out["id"].(string)+"/split", map[string]any{"from": "2099-10-14", "changes": map[string]any{}})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
}

func TestSplitSeriesViewerAndPlainTask(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "viewer")
	resp, out := se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Stand-up", "project_id": se.project, "due": map[string]any{"date": "2099-10-12"}, "recurrence": "every day"})
	se.alice.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = se.bob.do("POST", "/api/v1/tasks/"+id+"/split", map[string]any{"from": "2099-10-14", "changes": map[string]any{"title": "Late stand-up"}})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("viewer = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/tasks", map[string]any{"title": "Once", "due": map[string]any{"date": "2099-10-12"}})
	se.alice.mustStatus(resp, 201, out)
	resp, out = se.alice.do("POST", "/api/v1/tasks/"+out["id"].(string)+"/split", map[string]any{"from": "2099-10-14", "changes": map[string]any{}})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "not_recurring" {
		t.Fatalf("plain task = %d %v", resp.StatusCode, out)
	}
	resp, out = se.alice.do("POST", "/api/v1/tasks/nope/split", map[string]any{"from": "2099-10-14", "changes": map[string]any{}})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown = %d %v", resp.StatusCode, out)
	}
}
