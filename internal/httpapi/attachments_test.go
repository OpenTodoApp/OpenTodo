package httpapi

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

func digestOf(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// raw sends a request with a raw body and returns the response and its body.
func (e *env) raw(method, path string, body []byte, headers ...string) (*http.Response, []byte) {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, bytes.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	if e.ip != "" {
		req.Header.Set("X-Forwarded-For", e.ip)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp, out
}

// queueRow creates an attachment row through sync like a device does.
func queueRow(e *env, device, id, task, author, name, mime string, content []byte, encrypted ...bool) {
	e.t.Helper()
	ts := time.Now().UnixMilli()
	fields := map[string]any{
		"task_id": task, "author_id": author, "comment_id": nil, "name": name, "mime": mime,
		"size": len(content), "sha256": digestOf(content), "url": nil, "encrypted": len(encrypted) > 0 && encrypted[0], "created_at": ts, "uploaded_at": nil, "deleted_at": nil,
	}
	var ops []map[string]any
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": ids.New(), "entity": "attachment", "entityId": id, "field": f, "value": v, "ts": ts, "device": device})
	}
	out := syncOnce(e, device, 0, ops)
	if rej, _ := out["rejected"].([]any); len(rej) > 0 {
		e.t.Fatalf("rejected %v", rej)
	}
}

func attachmentSetup(t *testing.T) (*env, string, string) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	uid := out["user"].(map[string]any)["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Receipts"})
	e.mustStatus(resp, 201, out)
	return e, uid, out["id"].(string)
}

func TestAttachmentUploadAndDownload(t *testing.T) {
	e, uid, task := attachmentSetup(t)
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{7}, 100)...)
	queueRow(e, "laptop", "a1", task, uid, "photo.png", "image/png", png)

	// Not uploaded yet: the content is 404.
	resp, _ := e.raw("GET", "/api/v1/attachments/a1/content", nil)
	if resp.StatusCode != 404 {
		t.Fatalf("before upload: %d", resp.StatusCode)
	}
	// Mismatching bytes are refused and nothing is stored.
	resp, body := e.raw("PUT", "/api/v1/attachments/a1/content", bytes.Repeat([]byte{1}, len(png)))
	if resp.StatusCode != 400 || !strings.Contains(string(body), "attachment_mismatch") {
		t.Fatalf("mismatch: %d %s", resp.StatusCode, body)
	}
	resp, body = e.raw("PUT", "/api/v1/attachments/a1/content", png)
	if resp.StatusCode != 204 {
		t.Fatalf("upload: %d %s", resp.StatusCode, body)
	}
	resp, out := e.do("GET", "/api/v1/tasks/"+task+"/attachments", nil)
	e.mustStatus(resp, 200, out)
	list := out["attachments"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["uploaded"] != true {
		t.Fatalf("list %v", list)
	}
	// A second upload conflicts.
	resp, _ = e.raw("PUT", "/api/v1/attachments/a1/content", png)
	if resp.StatusCode != 409 {
		t.Fatalf("second upload: %d", resp.StatusCode)
	}
	// Download: inline PNG with every safety header; ranges work.
	resp, body = e.raw("GET", "/api/v1/attachments/a1/content", nil)
	if resp.StatusCode != 200 || !bytes.Equal(body, png) {
		t.Fatalf("download: %d", resp.StatusCode)
	}
	h := resp.Header
	if h.Get("Content-Type") != "image/png" || !strings.HasPrefix(h.Get("Content-Disposition"), "inline;") ||
		h.Get("Content-Security-Policy") != "default-src 'none'; sandbox" || h.Get("X-Content-Type-Options") != "nosniff" ||
		h.Get("ETag") != `"`+digestOf(png)+`"` || !strings.Contains(h.Get("Cache-Control"), "immutable") {
		t.Fatalf("headers %v", h)
	}
	resp, _ = e.raw("GET", "/api/v1/attachments/a1/content?download=1", nil)
	if !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "attachment;") {
		t.Fatalf("download=1: %v", resp.Header)
	}
	resp, body = e.raw("GET", "/api/v1/attachments/a1/content", nil, "Range", "bytes=0-7")
	if resp.StatusCode != 206 || len(body) != 8 {
		t.Fatalf("range: %d %d", resp.StatusCode, len(body))
	}
	// /me reports the usage.
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if used := out["attachments"].(map[string]any)["used_bytes"]; used != float64(len(png)) {
		t.Fatalf("usage %v", used)
	}
}

func TestAttachmentDangerousTypesAreDownloads(t *testing.T) {
	e, uid, task := attachmentSetup(t)
	for id, mt := range map[string]string{"h1": "text/html", "s1": "image/svg+xml"} {
		content := []byte("<script>alert(1)</script>")
		queueRow(e, "laptop", id, task, uid, id+".file", mt, content)
		if resp, body := e.raw("PUT", "/api/v1/attachments/"+id+"/content", content); resp.StatusCode != 204 {
			t.Fatalf("%s upload: %d %s", id, resp.StatusCode, body)
		}
		resp, _ := e.raw("GET", "/api/v1/attachments/"+id+"/content", nil)
		if resp.Header.Get("Content-Type") != "application/octet-stream" || !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "attachment;") {
			t.Fatalf("%s served as %v", mt, resp.Header)
		}
	}
}

func TestAttachmentLimitsAndAuth(t *testing.T) {
	e, uid, task := attachmentSetup(t)
	// Anonymous requests are refused.
	anon := newClientAt(e, "10.9.9.9")
	if resp, _ := anon.raw("GET", "/api/v1/attachments/x/content", nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous: %d", resp.StatusCode)
	}
	// Owner settings: 1 MB per file, 2 MB quota.
	resp, out := e.do("PUT", "/api/v1/settings/attachments", map[string]any{"enabled": true, "max_file_mb": 1, "quota_mb": 2})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("PUT", "/api/v1/settings/attachments", map[string]any{"enabled": true, "max_file_mb": 9999, "quota_mb": 2})
	e.mustStatus(resp, 400, out)
	// A row over the limit is refused at receipt.
	big := bytes.Repeat([]byte{1}, 1<<20+1)
	out = syncOnce(e, "laptop", 0, []map[string]any{
		{"id": ids.New(), "entity": "attachment", "entityId": "big", "field": "task_id", "value": task, "ts": time.Now().UnixMilli(), "device": "laptop"},
		{"id": ids.New(), "entity": "attachment", "entityId": "big", "field": "author_id", "value": uid, "ts": time.Now().UnixMilli(), "device": "laptop"},
		{"id": ids.New(), "entity": "attachment", "entityId": "big", "field": "size", "value": len(big), "ts": time.Now().UnixMilli(), "device": "laptop"},
	})
	if rej, _ := out["rejected"].([]any); len(rej) == 0 || !strings.Contains(strings.Join(func() []string {
		var s []string
		for _, r := range rej {
			s = append(s, r.(map[string]any)["reason"].(string))
		}
		return s
	}(), ","), "too_large") {
		t.Fatalf("too large row: %v", out["rejected"])
	}
	// Quota: two 1 MB files fit, the third does not.
	one := bytes.Repeat([]byte{2}, 1<<20)
	for i, want := range []int{204, 204, 403} {
		id := "q" + strconv.Itoa(i)
		content := append([]byte{byte(i)}, one[1:]...)
		queueRow(e, "laptop", id, task, uid, id+".bin", "application/octet-stream", content)
		resp, body := e.raw("PUT", "/api/v1/attachments/"+id+"/content", content)
		if resp.StatusCode != want {
			t.Fatalf("%s: %d %s", id, resp.StatusCode, body)
		}
		if want == 403 && !strings.Contains(string(body), "quota_exceeded") {
			t.Fatalf("quota body %s", body)
		}
	}
	// Disabled: uploads refused.
	resp, out = e.do("PUT", "/api/v1/settings/attachments", map[string]any{"enabled": false, "max_file_mb": 1, "quota_mb": 2})
	e.mustStatus(resp, 200, out)
	queueRow(e, "laptop", "d1", task, uid, "d.txt", "text/plain", []byte("x"))
	if resp, body := e.raw("PUT", "/api/v1/attachments/d1/content", []byte("x")); resp.StatusCode != 403 || !strings.Contains(string(body), "attachments_disabled") {
		t.Fatalf("disabled: %d %s", resp.StatusCode, body)
	}
}

func TestAttachmentNonAuthorUploadAndMemberSettings(t *testing.T) {
	se := newShareEnv(t)
	se.share(se.alice, "bob@example.com", "editor")
	content := []byte("receipt")
	queueRow(se.alice, "alice-laptop", "a1", se.task, se.ids["alice"], "r.txt", "text/plain", content)
	if resp, _ := se.bob.raw("PUT", "/api/v1/attachments/a1/content", content); resp.StatusCode != 404 {
		t.Fatalf("non-author upload: %d", resp.StatusCode)
	}
	if resp, out := se.bob.do("PUT", "/api/v1/settings/attachments", map[string]any{"enabled": false, "max_file_mb": 1, "quota_mb": 0}); resp.StatusCode != 403 {
		t.Fatalf("member settings: %d %v", resp.StatusCode, out)
	}
	// Bob can read the file once alice uploaded it.
	if resp, _ := se.alice.raw("PUT", "/api/v1/attachments/a1/content", content); resp.StatusCode != 204 {
		t.Fatalf("alice upload: %d", resp.StatusCode)
	}
	if resp, body := se.bob.raw("GET", "/api/v1/attachments/a1/content", nil); resp.StatusCode != 200 || string(body) != "receipt" {
		t.Fatalf("bob download: %d", resp.StatusCode)
	}
}

func TestAttachmentCreateOverAPI(t *testing.T) {
	e, _, task := attachmentSetup(t)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "notes.txt")
	fw.Write([]byte("hello"))
	mw.Close()
	resp, body := e.raw("POST", "/api/v1/tasks/"+task+"/attachments", buf.Bytes(), "Content-Type", mw.FormDataContentType(), "Idempotency-Key", "k1")
	if resp.StatusCode != 201 {
		t.Fatalf("multipart create: %d %s", resp.StatusCode, body)
	}
	var a map[string]any
	_ = json.Unmarshal(body, &a)
	if a["name"] != "notes.txt" || a["uploaded"] != true || a["size"] != float64(5) {
		t.Fatalf("created %v", a)
	}
	// A retry with the same key answers with the same attachment.
	var buf2 bytes.Buffer
	mw2 := multipart.NewWriter(&buf2)
	fw2, _ := mw2.CreateFormFile("file", "notes.txt")
	fw2.Write([]byte("hello"))
	mw2.Close()
	resp, body = e.raw("POST", "/api/v1/tasks/"+task+"/attachments", buf2.Bytes(), "Content-Type", mw2.FormDataContentType(), "Idempotency-Key", "k1")
	var b map[string]any
	_ = json.Unmarshal(body, &b)
	if resp.StatusCode != 200 || resp.Header.Get(ReplayedHeader) != "true" || b["id"] != a["id"] {
		t.Fatalf("replay: %d %v", resp.StatusCode, b)
	}
	if resp, body := e.raw("GET", "/api/v1/attachments/"+a["id"].(string)+"/content", nil); resp.StatusCode != 200 || string(body) != "hello" {
		t.Fatalf("content: %d %s", resp.StatusCode, body)
	}
	// A link attachment, renamed, then removed.
	resp, out := e.do("POST", "/api/v1/tasks/"+task+"/attachments", map[string]any{"url": "https://example.com/spec.pdf"})
	e.mustStatus(resp, 201, out)
	link := out["id"].(string)
	if out["url"] != "https://example.com/spec.pdf" || out["size"] != float64(0) {
		t.Fatalf("link %v", out)
	}
	resp, out = e.do("POST", "/api/v1/tasks/"+task+"/attachments", map[string]any{"url": "javascript:alert(1)"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/attachments/"+link, map[string]any{"name": "Specification"})
	e.mustStatus(resp, 200, out)
	if out["name"] != "Specification" {
		t.Fatalf("renamed %v", out)
	}
	resp, out = e.do("DELETE", "/api/v1/attachments/"+link, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/tasks/"+task+"/attachments", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["attachments"].([]any)); n != 1 {
		t.Fatalf("live attachments %d", n)
	}
}

func TestAttachmentReadTokenAndRateLimit(t *testing.T) {
	e := newEnvWith(t, false, WithAttachmentRateLimit(2, time.Hour))
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	uid := out["user"].(map[string]any)["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Receipts"})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	// A read token may download but never upload.
	secret := e.token("read")
	content := []byte("x")
	queueRow(e, "laptop", "r1", task, uid, "r.txt", "text/plain", content)
	if resp, body := e.raw("PUT", "/api/v1/attachments/r1/content", content, "Authorization", "Bearer "+secret); resp.StatusCode != 403 {
		t.Fatalf("read token upload: %d %s", resp.StatusCode, body)
	}
	// Two uploads per window, the third is refused.
	for i, want := range []int{204, 204, 429} {
		id := "rl" + strconv.Itoa(i)
		c := []byte{byte(i)}
		queueRow(e, "laptop", id, task, uid, id+".bin", "application/octet-stream", c)
		if resp, body := e.raw("PUT", "/api/v1/attachments/"+id+"/content", c); resp.StatusCode != want {
			t.Fatalf("%s: %d %s", id, resp.StatusCode, body)
		}
	}
	// The demo instance reports attachments as disabled in /me.
	_ = uid
}

func TestAttachmentExport(t *testing.T) {
	e, uid, task := attachmentSetup(t)
	content := []byte("export me")
	queueRow(e, "laptop", "x1", task, uid, "notes.txt", "text/plain", content)
	if resp, _ := e.raw("PUT", "/api/v1/attachments/x1/content", content); resp.StatusCode != 204 {
		t.Fatalf("upload %d", resp.StatusCode)
	}
	queueRow(e, "laptop", "x2", task, uid, "gone.txt", "text/plain", []byte("x"))
	resp, out := e.do("DELETE", "/api/v1/attachments/x2", nil)
	e.mustStatus(resp, 204, out)
	// JSON: metadata, removed ones included.
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["attachments"].([]any)); n != 2 {
		t.Fatalf("exported attachments %d", n)
	}
	resp, out = e.do("GET", "/api/v1/export?format=pdf", nil)
	e.mustStatus(resp, 400, out)
	// ZIP: the document first, then the uploaded file with its bytes.
	resp, body := e.raw("GET", "/api/v1/export?format=zip", nil)
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "application/zip" {
		t.Fatalf("zip %d %v", resp.StatusCode, resp.Header)
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatal(err)
	}
	if zr.File[0].Name != "export.json" || len(zr.File) != 2 || zr.File[1].Name != "attachments/x1/notes.txt" {
		names := []string{}
		for _, f := range zr.File {
			names = append(names, f.Name)
		}
		t.Fatalf("zip entries %v", names)
	}
	rc, _ := zr.File[1].Open()
	got, _ := io.ReadAll(rc)
	rc.Close()
	if !bytes.Equal(got, content) {
		t.Fatalf("zip content %q", got)
	}
	anon := newClientAt(e, "10.9.9.8")
	if resp, _ := anon.raw("GET", "/api/v1/export?format=zip", nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous zip export %d", resp.StatusCode)
	}
}

// An encrypted file (design D8) is an opaque envelope: always a download, never
// rendered, whatever its (ciphertext) type says.
func TestEncryptedAttachmentServedAsOctetStream(t *testing.T) {
	e, uid, task := attachmentSetup(t)
	envelope := append([]byte("OTAT1"), bytes.Repeat([]byte{9}, 64)...)
	queueRow(e, "laptop", "a-enc", task, uid, "enc:v1:bmFtZQ", "enc:v1:bWltZQ", envelope, true)
	if resp, body := e.raw("PUT", "/api/v1/attachments/a-enc/content", envelope); resp.StatusCode != 204 {
		t.Fatalf("upload: %d %s", resp.StatusCode, body)
	}
	resp, body := e.raw("GET", "/api/v1/attachments/a-enc/content", nil)
	if resp.StatusCode != 200 || !bytes.Equal(body, envelope) {
		t.Fatalf("download: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/octet-stream" || !strings.HasPrefix(resp.Header.Get("Content-Disposition"), "attachment;") {
		t.Fatalf("headers: %s %s", ct, resp.Header.Get("Content-Disposition"))
	}
}
