package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Photos in an assistant turn through the real HTTP stack (OpenSpec change
// voice-ramble, tasks 2.1, 2.4, 2.5, 2.7 and 2.8). No test contacts a real provider.

// photoB64 is a small "JPEG" (a JPEG header and a marker that must never
// appear in a log, the database or the audit log).
var photoB64 = base64.StdEncoding.EncodeToString(append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, []byte("PHOTO-PIXELS-never-stored-0123456789")...))

func askWithPhotos(q string, imgs ...map[string]any) map[string]any {
	list := make([]any, len(imgs))
	for i, img := range imgs {
		list[i] = img
	}
	return map[string]any{"messages": []any{map[string]any{"role": "user", "text": q, "images": list}}, "timezone": "UTC", "skill": "capture"}
}

func photo() map[string]any { return map[string]any{"media_type": "image/jpeg", "data": photoB64} }

func TestTurnWithPhotos(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	e := me.owner
	e.consentAssistant("anthropic")
	llm := me.anthropic
	code, out, events := e.turn(askWithPhotos("turn my notes into tasks", photo()))
	if code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn: %d %v %v", code, out, events)
	}
	// The provider got the photo as an image block with the message.
	llm.mu.Lock()
	body := llm.bodies[0]
	llm.mu.Unlock()
	msgs := body["messages"].([]any)
	blocks := msgs[len(msgs)-1].(map[string]any)["content"].([]any)
	if len(blocks) != 2 || blocks[1].(map[string]any)["source"].(map[string]any)["data"] != photoB64 {
		t.Fatalf("provider blocks = %v", blocks)
	}
	// Nothing of the photo remains: not in the logs, the database (usage,
	// audit and everything else) or the audit export.
	marker := "PHOTO-PIXELS"
	if strings.Contains(me.logs.String(), photoB64) || strings.Contains(me.logs.String(), marker) {
		t.Fatal("the photo reached the log")
	}
	if n := dbContains(t, e, photoB64); n != "" {
		t.Fatalf("the photo is stored in %s", n)
	}
	resp, audit := e.do("GET", "/api/v1/audit?limit=100", nil)
	e.mustStatus(resp, 200, audit)
	if raw, _ := json.Marshal(audit); strings.Contains(string(raw), photoB64) {
		t.Fatal("the photo is in the audit log")
	}
	var turns int
	if err := e.db.QueryRow(`SELECT turns FROM assistant_usage`).Scan(&turns); err != nil || turns != 1 {
		t.Fatalf("usage turns %d %v", turns, err)
	}

	base := llm.hits.Load()
	refused := func(name string, c *env, status int, want, field string, body any) {
		t.Helper()
		got, out, _ := c.turn(body)
		if got != status || errCode(out) != want {
			t.Fatalf("%s: %d %v (want %d %s)", name, got, out, status, want)
		}
		if field != "" && !strings.HasPrefix(out["error"].(map[string]any)["message"].(string), field) {
			t.Fatalf("%s: message %v does not name %s", name, out, field)
		}
		if llm.hits.Load() != base {
			t.Fatalf("%s reached the provider", name)
		}
	}
	refused("anonymous", newClientFor(e), 401, "unauthorized", "", askWithPhotos("x", photo()))
	big := make([]byte, 5<<20)
	copy(big, []byte{0xFF, 0xD8, 0xFF})
	refused("5 MB photo", e, 413, "too_large", "images[0]", askWithPhotos("x", map[string]any{"media_type": "image/jpeg", "data": base64.StdEncoding.EncodeToString(big)}))
	refused("five photos", e, 413, "too_large", "images", askWithPhotos("x", photo(), photo(), photo(), photo(), photo()))
	refused("wrong bytes", e, 400, "invalid_input", "images[0].data", askWithPhotos("x", map[string]any{"media_type": "image/png", "data": photoB64}))
	refused("heic", e, 400, "invalid_input", "images[0].media_type", askWithPhotos("x", map[string]any{"media_type": "image/heic", "data": photoB64}))
	earlier := map[string]any{"timezone": "UTC", "messages": []any{
		map[string]any{"role": "user", "text": "a", "images": []any{photo()}},
		map[string]any{"role": "assistant", "text": "b"},
		map[string]any{"role": "user", "text": "c"}}}
	refused("photo on an earlier message", e, 400, "invalid_input", "messages[0]", earlier)
	// Over 16 MB in all.
	huge := strings.Repeat("A", 17<<20)
	refused("body over 16 MB", e, 413, "too_large", "", askWithPhotos("x", map[string]any{"media_type": "image/jpeg", "data": huge}))
	// The text limit still applies beside photos.
	refused("text over 256 KB", e, 413, "too_large", "", askWithPhotos(strings.Repeat("x", 260<<10), photo()))

	// A compatible endpoint without the mark does not read photos (422), and
	// /me/assistant says so; with the mark it does.
	me.setOwner(t, map[string]any{"default_provider": "compatible", "allow_private_endpoint": true,
		"providers": map[string]any{"compatible": map[string]any{"enabled": true, "model": "llava", "base_url": "http://127.0.0.1:9/v1"}}})
	e.consentAssistant("compatible")
	images := func(c *env) any {
		resp, st := c.do("GET", "/api/v1/me/assistant", nil)
		c.mustStatus(resp, 200, st)
		return st["images"]
	}
	if images(e) != false {
		t.Fatal("unmarked compatible endpoint reads images")
	}
	refused("unmarked compatible", e, 422, "images_unsupported", "", askWithPhotos("x", photo()))
	me.setOwner(t, map[string]any{"providers": map[string]any{"compatible": map[string]any{"enabled": true, "model": "llava", "base_url": "http://127.0.0.1:9/v1", "images": true}}})
	resp, set := e.do("GET", "/api/v1/settings/assistant", nil)
	e.mustStatus(resp, 200, set)
	if set["providers"].(map[string]any)["compatible"].(map[string]any)["images"] != true || images(e) != true {
		t.Fatalf("marked: %v", set["providers"])
	}
	// Only the compatible provider takes the mark.
	resp, bad := e.do("PUT", "/api/v1/settings/assistant", map[string]any{"providers": map[string]any{"openai": map[string]any{"model": "gpt", "images": true}}})
	if resp.StatusCode != 400 || !strings.Contains(bad["error"].(map[string]any)["message"].(string), "providers.openai.images") {
		t.Fatalf("openai images: %d %v", resp.StatusCode, bad)
	}

	// The built-in providers read images: the owner's Anthropic, and a
	// member's own Gemini.
	me.setOwner(t, map[string]any{"default_provider": "anthropic"})
	if images(me.member) != true {
		t.Fatal("anthropic does not read images")
	}
	resp, o := me.member.do("PUT", "/api/v1/me/assistant", map[string]any{"own_provider": "gemini", "own_model": "gemini-x", "own_key": "AIza-MEMBER"})
	me.member.mustStatus(resp, 200, o)
	if o["provider"] != "gemini" || o["images"] != true {
		t.Fatalf("member's gemini: %v", o)
	}
	// An encrypted account: 409, as without photos.
	resp, o = me.member.do("PUT", "/api/v1/encryption/keys", keyRecord(1, 1))
	me.member.mustStatus(resp, 201, o)
	refused("encrypted", me.member, 409, "encryption_enabled", "", askWithPhotos("x", photo()))
}

// voice-ramble 2.7: the disclosure names photos, and a consent to the first
// disclosure still sends text turns.
func TestEarlierConsentStillSendsTurns(t *testing.T) {
	e, _, _ := assistantEnv(t)
	e.enableAssistant(nil)
	if _, err := e.db.Exec(`INSERT INTO assistant_consent(user_id, accepted_at, disclosure_version, provider) VALUES(?, 1, 1, 'anthropic')`, userIDOf(t, e)); err != nil {
		t.Fatal(err)
	}
	resp, st := e.do("GET", "/api/v1/me/assistant", nil)
	e.mustStatus(resp, 200, st)
	if st["consented"] != true || st["disclosure_version"].(float64) != 3 || !strings.Contains(strings.Join(toStrings(st["fields"]), ","), "photos you add") {
		t.Fatalf("status %v", st)
	}
	if code, out, events := e.turn(ask("hi")); code != 200 || len(named(events, "done")) != 1 {
		t.Fatalf("turn: %d %v", code, out)
	}
}

// voice-ramble 2.8 (refs #501): a redirect in front of the server turns the
// owner's Gemini "Test connection" into a GET; the server refuses it itself
// with 405 naming what it received, and Gemini is never asked.
func TestGeminiTestBehindRedirect(t *testing.T) {
	me := newOwnProviderEnv(t, nil)
	e := me.owner
	me.setOwner(t, map[string]any{"providers": map[string]any{"gemini": map[string]any{"enabled": true, "model": "gemini-x"}}, "keys": map[string]any{"gemini": "AIza-OWNER"}})
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, e.srv.URL+r.URL.Path, http.StatusFound)
	}))
	defer proxy.Close()
	req, _ := http.NewRequest("POST", proxy.URL+"/api/v1/settings/assistant/test", strings.NewReader(`{"provider":"gemini"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req) // follows the 302 as a GET, like a browser
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if resp.StatusCode != 405 || errCode(out) != "method_not_allowed" || !strings.Contains(string(raw), "GET") {
		t.Fatalf("%d %s", resp.StatusCode, raw)
	}
	if me.gemini.hits.Load() != 0 {
		t.Fatal("Gemini was asked")
	}
	// The same test without the redirect reaches Gemini.
	resp2, o := e.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "gemini"})
	e.mustStatus(resp2, 200, o)
	if o["ok"] != true || me.gemini.hits.Load() == 0 {
		t.Fatalf("direct test: %v", o)
	}
}
