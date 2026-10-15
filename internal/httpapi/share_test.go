package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The fallback for the share sheet's POST before the service worker is active
// (attachments D9): text is carried over, files are reported as lost.
func TestSharePostFallback(t *testing.T) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.WriteField("title", "Receipt")
	mw.WriteField("text", "from the shop")
	fw, _ := mw.CreateFormFile("files", "photo.png")
	fw.Write([]byte("png bytes"))
	mw.Close()
	req := httptest.NewRequest("POST", "/share", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	(&Server{}).handleSharePost(rec, req)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasPrefix(loc, "/share?") || !strings.Contains(loc, "title=Receipt") || !strings.Contains(loc, "text=from%20the%20shop") || !strings.Contains(loc, "files=lost") {
		t.Fatalf("location %q", loc)
	}

	req = httptest.NewRequest("POST", "/share", strings.NewReader("url=https%3A%2F%2Fexample.com"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec = httptest.NewRecorder()
	(&Server{}).handleSharePost(rec, req)
	if loc := rec.Header().Get("Location"); loc != "/share?url=https%3A%2F%2Fexample.com" {
		t.Fatalf("location %q", loc)
	}
}
