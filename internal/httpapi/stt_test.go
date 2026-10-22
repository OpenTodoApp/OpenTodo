package httpapi

import (
	"bytes"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Speech to text (OpenSpec change settings-refresh, design D7; voice-capture
// "Server speech service" and "Transcription route"), against an in-process
// fake of the OpenAI-compatible transcription endpoint.

type fakeSTT struct {
	srv   *httptest.Server
	mu    sync.Mutex
	calls []map[string]string
	delay time.Duration
	code  int
}

func newFakeSTT(t *testing.T) *fakeSTT {
	f := &fakeSTT{code: 200}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := map[string]string{"path": r.URL.Path, "auth": r.Header.Get("Authorization")}
		_, params, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		mr := multipart.NewReader(r.Body, params["boundary"])
		for {
			p, err := mr.NextPart()
			if err != nil {
				break
			}
			b, _ := io.ReadAll(p)
			if p.FormName() == "file" {
				got["file"], got["file_type"] = string(b), p.Header.Get("Content-Type")
			} else {
				got[p.FormName()] = string(b)
			}
		}
		f.mu.Lock()
		f.calls = append(f.calls, got)
		delay, code := f.delay, f.code
		f.mu.Unlock()
		time.Sleep(delay)
		w.WriteHeader(code)
		_, _ = w.Write([]byte(`{"text":" call the dentist tomorrow at 9 "}`))
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeSTT) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

// sttEnv is an owner environment whose server log is captured.
func sttEnv(t *testing.T) (*env, *Server, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	var srv *Server
	e := newEnvWith(t, false, func(s *Server) {
		s.log = slog.New(slog.NewTextHandler(&lockedWriter{w: &logs}, &slog.HandlerOptions{Level: slog.LevelDebug}))
		srv = s
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e, srv, &logs
}

type lockedWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

func (e *env) phrase(body []byte, contentType, query string) (*http.Response, string) {
	e.t.Helper()
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/voice/transcribe"+query, bytes.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, string(raw)
}

func TestSTTSettingsOwnerOnly(t *testing.T) {
	e, _, _ := sttEnv(t)
	fake := newFakeSTT(t)
	resp, out := e.do("PUT", "/api/v1/settings/stt", map[string]any{"url": "ftp://stt.home.lan"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "url") {
		t.Fatalf("ftp url = %d %v", resp.StatusCode, out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/stt", map[string]any{"url": fake.srv.URL, "model": "Systran/faster-whisper-small", "key": "sk-secret"})
	e.mustStatus(resp, 200, out)
	if out["connected"] != true || out["keySet"] != true || strings.Contains(fmtJSON(out), "sk-secret") {
		t.Fatalf("saved = %v", out)
	}
	m, _ := e.member("member@example.com", "198.51.100.30")
	resp, out = m.do("PUT", "/api/v1/settings/stt", map[string]any{"url": "http://evil.example"})
	if resp.StatusCode != 403 || errCode(out) != "forbidden" {
		t.Fatalf("member = %d %v", resp.StatusCode, out)
	}
	// Members learn that a service is connected, and its host, from /me.
	resp, out = m.do("GET", "/api/v1/me", nil)
	m.mustStatus(resp, 200, out)
	if sp := out["speech"].(map[string]any); sp["connected"] != true || sp["host"] != strings.TrimPrefix(fake.srv.URL, "http://") {
		t.Fatalf("speech = %v", sp)
	}
	// The test is refused while private targets are not allowed, then answers the text.
	resp, out = e.do("POST", "/api/v1/settings/stt/test", nil)
	e.mustStatus(resp, 200, out)
	if out["ok"] != false || !strings.Contains(out["error"].(string), "private network") {
		t.Fatalf("private target = %v", out)
	}
	e.allowPrivate(true)
	resp, out = e.do("POST", "/api/v1/settings/stt/test", nil)
	e.mustStatus(resp, 200, out)
	if out["ok"] != true || out["text"] != "call the dentist tomorrow at 9" {
		t.Fatalf("test = %v", out)
	}
	c := fake.calls[len(fake.calls)-1]
	if c["path"] != "/v1/audio/transcriptions" || c["model"] != "Systran/faster-whisper-small" || c["auth"] != "Bearer sk-secret" || c["response_format"] != "json" || c["file_type"] != "audio/wav" {
		t.Fatalf("request = %v", c)
	}
}

func TestTranscribe(t *testing.T) {
	e, srv, logs := sttEnv(t)
	fake := newFakeSTT(t)
	resp, raw := e.phrase([]byte("webm-bytes"), "audio/webm;codecs=opus", "?language=it")
	if resp.StatusCode != 409 || !strings.Contains(raw, "stt_not_configured") {
		t.Fatalf("not configured = %d %s", resp.StatusCode, raw)
	}
	e.allowPrivate(true)
	resp, out := e.do("PUT", "/api/v1/settings/stt", map[string]any{"url": fake.srv.URL, "model": "small"})
	e.mustStatus(resp, 200, out)

	resp, raw = e.phrase([]byte("webm-bytes"), "audio/webm;codecs=opus", "?language=it&seconds=4")
	if resp.StatusCode != 200 || raw != "{\"text\":\"call the dentist tomorrow at 9\"}\n" {
		t.Fatalf("phrase = %d %q", resp.StatusCode, raw)
	}
	c := fake.calls[len(fake.calls)-1]
	if c["file"] != "webm-bytes" || c["language"] != "it" || c["file_type"] != "audio/webm" {
		t.Fatalf("forwarded = %v", c)
	}
	// Nothing about the phrase reaches the log.
	if strings.Contains(logs.String(), "dentist") || strings.Contains(logs.String(), "webm-bytes") {
		t.Fatalf("the log carries the phrase: %s", logs.String())
	}

	before := fake.count()
	for name, tc := range map[string]struct {
		body []byte
		ct   string
		q    string
	}{
		"6 MB":       {bytes.Repeat([]byte("x"), 6<<20), "audio/webm", ""},
		"a GIF":      {[]byte("GIF89a"), "image/gif", ""},
		"61 seconds": {[]byte("x"), "audio/ogg", "?seconds=61"},
	} {
		resp, raw := e.phrase(tc.body, tc.ct, tc.q)
		if resp.StatusCode != 400 || !strings.Contains(raw, "invalid_input") {
			t.Errorf("%s = %d %s", name, resp.StatusCode, raw)
		}
	}
	anon := newClientFor(e)
	if resp, raw := anon.phrase([]byte("x"), "audio/webm", ""); resp.StatusCode != 401 || !strings.Contains(raw, "unauthorized") {
		t.Fatalf("anonymous = %d %s", resp.StatusCode, raw)
	}
	if fake.count() != before {
		t.Fatal("a refused phrase reached the service")
	}

	// A service that does not answer in time.
	srv.stt.SetClient(&http.Client{Timeout: 100 * time.Millisecond})
	fake.mu.Lock()
	fake.delay = 300 * time.Millisecond
	fake.mu.Unlock()
	if resp, raw := e.phrase([]byte("x"), "audio/mp4", ""); resp.StatusCode != 502 || !strings.Contains(raw, "stt_unavailable") {
		t.Fatalf("timeout = %d %s", resp.StatusCode, raw)
	}
	fake.mu.Lock()
	fake.delay = 0
	fake.mu.Unlock()

	// 30 phrases a minute per account.
	limited := false
	for i := 0; i < 31 && !limited; i++ {
		resp, _ := e.phrase([]byte("x"), "audio/wav", "")
		limited = resp.StatusCode == 429
	}
	if !limited {
		t.Fatal("no rate limit after 30 phrases")
	}
}
