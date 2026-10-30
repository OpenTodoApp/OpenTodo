package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

func (h *harness) seedFrame() string {
	h.t.Helper()
	out := h.apiJSON("POST", "/api/v1/frames", map[string]any{"title": "Admin", "weekdays": "1,2,3,4", "start": "16:00", "end": "16:45"})
	id, _ := out["id"].(string)
	if id == "" {
		h.t.Fatalf("seed frame: %v", out)
	}
	return id
}

func TestParseDays(t *testing.T) {
	for in, want := range map[string]string{
		"mon-fri": "1,2,3,4,5", "weekdays": "1,2,3,4,5", "weekend": "6,7", "daily": "1,2,3,4,5,6,7",
		"mon,wed,fri": "1,3,5", "Tuesday,Thursday": "2,4", "fri-mon": "1,5,6,7", "7,1": "1,7", "3": "3",
	} {
		if got, err := parseDays(in); err != nil || got != want {
			t.Errorf("parseDays(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "0", "8", "funday", "mon-xyz"} {
		if _, err := parseDays(bad); err == nil {
			t.Errorf("parseDays(%q) accepted", bad)
		}
	}
}

// Create from the CLI (calendar-frames "Frames API"): the frame is written as
// operations and listed by the API.
func TestFramesCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	id := strings.TrimSpace(h.mustRun("frames", "add", "Deep", "work", "--days", "mon-fri", "--from", "09:00", "--to", "11:00"))
	if f := h.apiJSON("GET", "/api/v1/frames/"+id, nil); f["title"] != "Deep work" || f["weekdays"] != "1,2,3,4,5" || f["end"] != "11:00" {
		t.Fatalf("frame %v", f)
	}
	if table := h.mustRun("frames"); !strings.Contains(table, "Deep work") || !strings.Contains(table, "mon-fri") || !strings.Contains(table, "09:00-11:00") {
		t.Fatalf("table %q", table)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("frames", "list", "--json")), &list); err != nil || len(list) != 1 || list[0]["id"] != id {
		t.Fatalf("list %v %v", list, err)
	}
	if code, _, _ := h.run("frames", "add", "Bad", "--from", "12:00", "--to", "11:00"); code == 0 {
		t.Fatal("crossing times accepted")
	}
	if out := h.mustRun("frames", "rm", id[:6], "--yes"); !strings.Contains(out, "deleted") {
		t.Fatalf("rm %q", out)
	}
	if out := h.mustRun("frames"); !strings.Contains(out, "No frames.") {
		t.Fatalf("after rm %q", out)
	}
}
