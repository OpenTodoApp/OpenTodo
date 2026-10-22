package httpapi

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

// Profile routes (OpenSpec change settings-refresh, design D10; account-profile).

func TestProfileRename(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Raffa", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)

	resp, out = e.do("PATCH", "/api/v1/me/profile", map[string]string{"name": "  Raffaele "})
	e.mustStatus(resp, 200, out)
	if out["user"].(map[string]any)["name"] != "Raffaele" || out["avatarVersion"] != float64(0) {
		t.Fatalf("rename = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if out["user"].(map[string]any)["name"] != "Raffaele" {
		t.Fatalf("me = %v", out["user"])
	}
	resp, out = e.do("PATCH", "/api/v1/me/profile", map[string]string{"name": "   "})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "name") {
		t.Fatalf("empty name = %d %v", resp.StatusCode, out)
	}
	anon := newClientFor(e)
	resp, out = anon.do("PATCH", "/api/v1/me/profile", map[string]string{"name": "X"})
	if resp.StatusCode != 401 || errCode(out) != "unauthorized" {
		t.Fatalf("anonymous rename = %d %v", resp.StatusCode, out)
	}
	if n := len(e.events(audit.NameChangedName)); n != 1 {
		t.Fatalf("name_changed events = %d", n)
	}
}

func TestProfileEmailWithoutOutgoingEmail(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	e.member("member@example.com", "198.51.100.20")

	resp, out = e.do("POST", "/api/v1/me/email", map[string]string{"email": "member@example.com"})
	if resp.StatusCode != 409 || errCode(out) != "email_taken" {
		t.Fatalf("taken = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/me/email", map[string]string{"email": "nope"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("invalid = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/me/email", map[string]string{"email": "Boss@Example.com"})
	e.mustStatus(resp, 200, out)
	if out["user"].(map[string]any)["email"] != "boss@example.com" || out["emailByLink"] != false {
		t.Fatalf("immediate change = %v", out)
	}
	resp, out = login(newClientFor(e), "boss@example.com", "correct horse battery")
	e.mustStatus(resp, 200, out)
	if n := len(e.events(audit.EmailChangedName)); n != 1 {
		t.Fatalf("email_changed events = %d", n)
	}
	anon := newClientFor(e)
	resp, out = anon.do("POST", "/api/v1/me/email", map[string]string{"email": "x@example.com"})
	if resp.StatusCode != 401 {
		t.Fatalf("anonymous = %d %v", resp.StatusCode, out)
	}
}

func TestProfileEmailNeedsRecentSession(t *testing.T) {
	m := newMFAEnv(t)
	m.clock.advance(FreshWindow + time.Second)
	resp, out := m.do("POST", "/api/v1/me/email", map[string]string{"email": "new@example.com"})
	if resp.StatusCode != 403 || errCode(out) != "reauth_required" {
		t.Fatalf("stale session = %d %v", resp.StatusCode, out)
	}
}

func TestProfileEmailByLink(t *testing.T) {
	e, srv := mailEnv(t, false)
	e.configureMail(srv)
	before := len(srv.Messages())
	resp, out := e.do("POST", "/api/v1/me/email", map[string]string{"email": "new@example.com"})
	e.mustStatus(resp, 200, out)
	if out["pendingEmail"] != "new@example.com" || out["user"].(map[string]any)["email"] != "owner@example.com" || out["emailByLink"] != true {
		t.Fatalf("pending = %v", out)
	}
	msgs := srv.Messages()[before:]
	if len(msgs) != 2 || msgs[0].To[0] != "new@example.com" || msgs[1].To[0] != "owner@example.com" {
		t.Fatalf("messages = %+v", msgs)
	}
	link := regexp.MustCompile(`https?://\S+/confirm-email/(\S+)`).FindStringSubmatch(mailBody(t, msgs[0]))
	if link == nil {
		t.Fatalf("no link in %q", mailBody(t, msgs[0]))
	}
	if strings.Contains(mailBody(t, msgs[1]), "new@example.com") || strings.Contains(mailBody(t, msgs[1]), "/confirm-email/") {
		t.Fatal("the notice to the old address names the new one or carries the link")
	}
	// Another account opening the link is refused.
	other, _ := e.member("other@example.com", "198.51.100.21")
	resp, out = other.do("POST", "/api/v1/me/email/confirm", map[string]string{"token": link[1]})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("other account = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/me/email/confirm", map[string]string{"token": "ote_unknown"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_token" {
		t.Fatalf("unknown token = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("POST", "/api/v1/me/email/confirm", map[string]string{"token": link[1]})
	e.mustStatus(resp, 200, out)
	if out["user"].(map[string]any)["email"] != "new@example.com" || out["pendingEmail"] != nil {
		t.Fatalf("confirmed = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/me/email/confirm", map[string]string{"token": link[1]})
	if resp.StatusCode != 400 || errCode(out) != "invalid_token" {
		t.Fatalf("used token = %d %v", resp.StatusCode, out)
	}
	for _, name := range []audit.Name{audit.EmailChangeRequestedName, audit.EmailChangedName} {
		evs := e.events(name)
		if len(evs) != 1 {
			t.Fatalf("%s events = %d", name, len(evs))
		}
		for k, v := range evs[0].Details {
			if strings.Contains(v, "@") {
				t.Fatalf("%s carries an address in %s", name, k)
			}
		}
	}
	// At most five requests an hour per account.
	for i := 0; i < 5; i++ {
		resp, out = e.do("POST", "/api/v1/me/email", map[string]string{"email": "again@example.com"})
	}
	if resp.StatusCode != 429 || errCode(out) != "rate_limited" {
		t.Fatalf("sixth request = %d %v", resp.StatusCode, out)
	}
}

// avatarPNG encodes a w×h PNG.
func avatarPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		img.Set(x, x%h, color.RGBA{R: 200, A: 255})
	}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// dataDir is the env's data directory: the database's folder.
func (e *env) dataDir() string {
	e.t.Helper()
	var file string
	if err := e.db.QueryRow("SELECT file FROM pragma_database_list WHERE name = 'main'").Scan(&file); err != nil {
		e.t.Fatal(err)
	}
	return filepath.Dir(file)
}

func fmtJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func (e *env) putBytes(method, path string, body []byte) (*http.Response, []byte) {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "image/png")
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, raw
}

func TestProfilePicture(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	ownerID := out["user"].(map[string]any)["id"].(string)

	// Wrong size, a GIF and too large are refused.
	if resp, raw := e.putBytes("PUT", "/api/v1/me/avatar", avatarPNG(t, 1024, 1024)); resp.StatusCode != 400 || !strings.Contains(string(raw), "invalid_input") {
		t.Fatalf("1024 png = %d %s", resp.StatusCode, raw)
	}
	if resp, raw := e.putBytes("PUT", "/api/v1/me/avatar", []byte("GIF89a\x01\x00\x01\x00")); resp.StatusCode != 400 || !strings.Contains(string(raw), "invalid_input") {
		t.Fatalf("gif = %d %s", resp.StatusCode, raw)
	}
	if resp, raw := e.putBytes("PUT", "/api/v1/me/avatar", bytes.Repeat([]byte("x"), avatarMaxBytes+1)); resp.StatusCode != 413 || !strings.Contains(string(raw), "too_large") {
		t.Fatalf("too large = %d %s", resp.StatusCode, raw)
	}
	anon := newClientFor(e)
	if resp, _ := anon.putBytes("PUT", "/api/v1/me/avatar", avatarPNG(t, 256, 256)); resp.StatusCode != 401 {
		t.Fatalf("anonymous upload = %d", resp.StatusCode)
	}
	path := filepath.Join(e.dataDir(), "avatars", ownerID+".jpg")
	if _, err := os.Stat(path); err == nil {
		t.Fatal("a refused upload stored a file")
	}

	resp, raw := e.putBytes("PUT", "/api/v1/me/avatar", avatarPNG(t, 256, 256))
	if resp.StatusCode != 200 || !strings.Contains(string(raw), `"avatarVersion":1`) {
		t.Fatalf("upload = %d %s", resp.StatusCode, raw)
	}
	stored, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(stored))
	if err != nil || format != "jpeg" || cfg.Width != 256 || cfg.Height != 256 {
		t.Fatalf("stored = %s %dx%d %v", format, cfg.Width, cfg.Height, err)
	}
	if _, err := jpeg.Decode(bytes.NewReader(stored)); err != nil {
		t.Fatal(err)
	}
	// Re-encoded: no EXIF segment survives.
	if bytes.Contains(stored, []byte("Exif")) {
		t.Fatal("metadata kept")
	}

	resp, raw = e.raw("GET", "/api/v1/users/"+ownerID+"/avatar?v=1", nil)
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/jpeg" || !strings.Contains(resp.Header.Get("Cache-Control"), "immutable") || !bytes.Equal(raw, stored) {
		t.Fatalf("own picture = %d %v", resp.StatusCode, resp.Header)
	}
	// An account that shares nothing gets a 404; a member of a shared project sees it.
	stranger, _ := e.member("stranger@example.com", "198.51.100.22")
	if resp, _ := stranger.raw("GET", "/api/v1/users/"+ownerID+"/avatar?v=1", nil); resp.StatusCode != 404 {
		t.Fatalf("stranger = %d", resp.StatusCode)
	}
	pid := e.newProject(map[string]any{"name": "Shared"})
	resp, out = e.do("POST", "/api/v1/projects/"+pid+"/members", map[string]any{"email": "stranger@example.com", "role": "editor"})
	e.mustStatus(resp, 201, out)
	// The member list carries the picture's version.
	resp, out = stranger.do("GET", "/api/v1/projects/"+pid+"/members", nil)
	stranger.mustStatus(resp, 200, out)
	if !strings.Contains(fmtJSON(out), `"avatarVersion":1`) {
		t.Fatalf("members = %v", out)
	}
	if resp, _ := stranger.raw("GET", "/api/v1/users/"+ownerID+"/avatar?v=1", nil); resp.StatusCode != 200 {
		t.Fatalf("project member = %d", resp.StatusCode)
	}

	resp, raw = e.putBytes("DELETE", "/api/v1/me/avatar", nil)
	if resp.StatusCode != 200 || !strings.Contains(string(raw), `"avatarVersion":0`) {
		t.Fatalf("remove = %d %s", resp.StatusCode, raw)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("file kept after remove")
	}
	if resp, _ := e.raw("GET", "/api/v1/users/"+ownerID+"/avatar?v=1", nil); resp.StatusCode != 404 {
		t.Fatalf("removed picture = %d", resp.StatusCode)
	}
	// A new picture after a remove gets a new address.
	resp, raw = e.putBytes("PUT", "/api/v1/me/avatar", avatarPNG(t, 256, 256))
	if resp.StatusCode != 200 || !strings.Contains(string(raw), `"avatarVersion":2`) {
		t.Fatalf("second upload = %d %s", resp.StatusCode, raw)
	}
	if n := len(e.events(audit.AvatarChangedName)); n != 3 {
		t.Fatalf("avatar events = %d", n)
	}
}
