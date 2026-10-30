package httpapi

import (
	"fmt"
	"testing"
)

// Calendar frames REST (OpenSpec change calendar-frames, "Frames API").
func TestFramesCRUD(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/frames", map[string]any{"title": "Deep work", "weekdays": "5,1,2,3,4", "start": "09:00", "end": "11:00", "source": "label:deep"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["weekdays"] != "1,2,3,4,5" || out["start"] != "09:00" || out["color"] != "#64748b" || out["encrypted"] != false || out["from_date"] != nil {
		t.Fatalf("created %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/frames/"+id, map[string]any{"end": "11:30", "title": "Focus", "until_date": "2026-12-31"})
	e.mustStatus(resp, 200, out)
	if out["end"] != "11:30" || out["title"] != "Focus" || out["until_date"] != "2026-12-31" {
		t.Fatalf("patched %v", out)
	}
	resp, out = e.do("GET", "/api/v1/frames", nil)
	e.mustStatus(resp, 200, out)
	if list := out["frames"].([]any); len(list) != 1 || list[0].(map[string]any)["title"] != "Focus" {
		t.Fatalf("list %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/frames/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/frames", nil)
	e.mustStatus(resp, 200, out)
	if len(out["frames"].([]any)) != 0 {
		t.Fatalf("deleted frame listed: %v", out)
	}
	for _, rt := range [][2]string{{"PATCH", "/api/v1/frames/" + id}, {"DELETE", "/api/v1/frames/" + id}, {"GET", "/api/v1/frames/nope"}} {
		resp, out = e.do(rt[0], rt[1], map[string]any{"title": "x"})
		if resp.StatusCode != 404 {
			t.Fatalf("%s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
		}
	}
	// The export carries frames, deleted ones included.
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if fr, _ := out["frames"].([]any); len(fr) != 1 {
		t.Fatalf("export frames: %v", out["frames"])
	}
}

func TestFramesAuthAndScopes(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/frames", map[string]any{"title": "Admin", "weekdays": "1"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	anon := e.bearerClient()
	resp, out = anon.do("GET", "/api/v1/frames", nil)
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous: %d %v", resp.StatusCode, out)
	}
	read, agent := e.token("read"), e.token("agent")
	before := countOps(t, e)
	for _, secret := range []string{read, agent} {
		resp, out = anon.do("GET", "/api/v1/frames", nil, bearer(secret)...)
		e.mustStatus(resp, 200, out)
		for _, rt := range [][2]string{{"POST", "/api/v1/frames"}, {"PATCH", "/api/v1/frames/" + id}, {"DELETE", "/api/v1/frames/" + id}} {
			resp, out = anon.do(rt[0], rt[1], map[string]any{"title": "Nope", "weekdays": "1"}, bearer(secret)...)
			if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
				t.Fatalf("%s %s: %d %v", rt[0], rt[1], resp.StatusCode, out)
			}
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
}

func TestFramesValidation(t *testing.T) {
	e := ownerEnv(t)
	before := countOps(t, e)
	for _, c := range []struct {
		body  map[string]any
		field string
	}{
		{map[string]any{"title": "x", "weekdays": "0,1"}, "weekdays"},
		{map[string]any{"title": "x", "weekdays": "1,8"}, "weekdays"},
		{map[string]any{"title": "x", "weekdays": "1", "start": "9:5"}, "start"},
		{map[string]any{"title": "x", "weekdays": "1", "start": "12:00", "end": "11:00"}, "end"},
		{map[string]any{"title": "", "weekdays": "1"}, "title"},
		{map[string]any{"weekdays": "1"}, "title"},
		{map[string]any{"title": "x", "weekdays": "1", "color": "red"}, "color"},
		{map[string]any{"title": "x", "weekdays": "1", "source": "task:t1"}, "source"},
		{map[string]any{"title": "x", "weekdays": "1", "from_date": "2026-12-01", "until_date": "2026-11-01"}, "until_date"},
	} {
		resp, out := e.do("POST", "/api/v1/frames", c.body)
		eo, _ := out["error"].(map[string]any)
		if resp.StatusCode != 422 || errCode(out) != "invalid_input" || eo["field"] != c.field {
			t.Fatalf("%v: %d %v", c.body, resp.StatusCode, out)
		}
	}
	if after := countOps(t, e); after != before {
		t.Fatalf("ops changed: %d → %d", before, after)
	}
	// A PATCH is checked against the merged frame.
	resp, out := e.do("POST", "/api/v1/frames", map[string]any{"title": "x", "weekdays": "1", "start": "09:00", "end": "10:00"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("PATCH", "/api/v1/frames/"+out["id"].(string), map[string]any{"start": "10:30"})
	if resp.StatusCode != 422 || errCode(out) != "invalid_input" {
		t.Fatalf("crossing patch: %d %v", resp.StatusCode, out)
	}
}

func TestFramesLimit(t *testing.T) {
	e := ownerEnv(t)
	for i := range 50 {
		resp, out := e.do("POST", "/api/v1/frames", map[string]any{"title": fmt.Sprint("F", i), "weekdays": "1"})
		e.mustStatus(resp, 201, out)
	}
	resp, out := e.do("POST", "/api/v1/frames", map[string]any{"title": "One more", "weekdays": "1"})
	if resp.StatusCode != 422 || errCode(out) != "limit_reached" {
		t.Fatalf("51st: %d %v", resp.StatusCode, out)
	}
}

func TestFramesEncryptedAccount(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/frames", map[string]any{"title": "Deep work", "weekdays": "1"})
	if resp.StatusCode != 409 || errCode(out) != "encryption_enabled" {
		t.Fatalf("plaintext title: %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/frames", map[string]any{"title": "enc:v1:QUJDREVGR0hJSktM", "weekdays": "1"})
	e.mustStatus(resp, 201, out)
	if out["encrypted"] != true || out["title"] != "enc:v1:QUJDREVGR0hJSktM" {
		t.Fatalf("ciphertext frame: %v", out)
	}
	// Fields without content stay writable.
	resp, out = e.do("PATCH", "/api/v1/frames/"+out["id"].(string), map[string]any{"end": "12:00"})
	e.mustStatus(resp, 200, out)
}
