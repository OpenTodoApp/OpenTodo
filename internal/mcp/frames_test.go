package mcp

import (
	"encoding/json"
	"testing"
)

// list_frames and opentodo://frames (OpenSpec change calendar-frames, design D7).
func TestFramesReadToolAndResource(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "frame", "deep", map[string]any{"title": "Deep work", "weekdays": "1,2,3,4,5", "start": "09:00", "end": "11:00",
		"color": "#3b82f6", "source": "label:l1", "from_date": nil, "until_date": nil, "position": 1, "created_at": 1, "deleted_at": nil})
	// "Assistant reads frames": an encrypted title reads as the placeholder.
	f.put("u1", "frame", "enc", map[string]any{"title": "enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "weekdays": "2", "start": "14:00", "end": "15:00",
		"position": 2, "created_at": 1, "deleted_at": nil})
	f.put("u1", "frame", "gone", map[string]any{"title": "Old", "weekdays": "1", "start": "08:00", "end": "09:00", "deleted_at": 5})
	// Another account's frame never shows.
	f.put("u2", "frame", "other", map[string]any{"title": "Theirs", "weekdays": "1", "start": "08:00", "end": "09:00"})

	res := f.tool("u1", "list_frames", map[string]any{"from": "2026-11-02", "to": "2026-11-08"})
	occ := res["occurrences"].([]any)
	if len(occ) != 6 {
		t.Fatalf("occurrences = %v", occ)
	}
	tue := occ[1].(map[string]any)
	first := occ[0].(map[string]any)
	if first["frame_id"] != "deep" || first["date"] != "2026-11-02" || first["start"] != "09:00" || ut(first)["title"] != "Deep work" || first["source"] != "label:l1" {
		t.Fatalf("first = %v", first)
	}
	if tue["date"] != "2026-11-03" || tue["frame_id"] != "deep" {
		t.Fatalf("tuesday first = %v", tue)
	}
	if enc := occ[2].(map[string]any); enc["frame_id"] != "enc" || ut(enc)["title"] != "Encrypted frame" {
		t.Fatalf("encrypted = %v", enc)
	}
	// Default range: seven days; more than 31 is refused.
	if res := f.tool("u1", "list_frames", map[string]any{"timezone": "Europe/Rome"}); res["from"] == nil || res["timezone"] != "Europe/Rome" {
		t.Fatalf("default = %v", res)
	}
	if r := f.call("u1", "tools/call", map[string]any{"name": "list_frames", "arguments": map[string]any{"from": "2026-11-01", "to": "2026-12-15"}}); !isToolError(r) {
		t.Fatalf("long range = %v", r)
	}

	r := f.call("u1", "resources/read", map[string]any{"uri": "opentodo://frames"})
	text := r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)["text"].(string)
	var payload struct {
		Frames []map[string]any `json:"frames"`
	}
	if err := json.Unmarshal([]byte(text), &payload); err != nil || len(payload.Frames) != 2 || payload.Frames[0]["id"] != "deep" || payload.Frames[0]["drawn"] != true {
		t.Fatalf("resource = %s", text)
	}
}

// isToolError reports an invalid-arguments answer, as a protocol error or a tool result marked isError.
func isToolError(r map[string]any) bool {
	if errCode(r) != 0 {
		return true
	}
	res, _ := r["result"].(map[string]any)
	return res["isError"] == true
}
