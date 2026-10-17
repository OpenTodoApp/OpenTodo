package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/http/httputil"
	"os"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/email"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// testMailbox is an in-memory email.Source for the HTTP tests.
type testMailbox struct {
	mu   gosync.Mutex
	msgs map[uint32][]byte
	next uint32
}

func (m *testMailbox) add(raw []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.next++
	m.msgs[m.next] = raw
}

func (m *testMailbox) Open(context.Context) (email.Mailbox, error) { return m, nil }
func (m *testMailbox) Unseen(context.Context) ([]email.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []email.Message
	for uid := uint32(1); uid <= m.next; uid++ {
		if raw, ok := m.msgs[uid]; ok {
			out = append(out, email.Message{UID: uid, Size: int64(len(raw))})
		}
	}
	return out, nil
}
func (m *testMailbox) Fetch(_ context.Context, uid uint32) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.msgs[uid], nil
}
func (m *testMailbox) Done(_ context.Context, uids []uint32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range uids {
		delete(m.msgs, u)
	}
	return nil
}
func (m *testMailbox) Close() error { return nil }

const (
	testIMAPHost = "imap.mail-provider.example:993"
	testIMAPUser = "operator-mailbox-user"
	testIMAPPass = "operator-mailbox-password"
)

// emailEnv is newEnv with email capture configured and an in-memory mailbox.
func emailEnv(t *testing.T) (*env, *email.Service, *testMailbox) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, AllowSignup: true, Email: config.EmailConfig{
		Address: "todo@example.com", LocalPart: "todo", Domain: "example.com",
		IMAPHost: testIMAPHost, IMAPUser: testIMAPUser, IMAPPassword: testIMAPPass,
		Mailbox: "INBOX", PollInterval: time.Minute, Processed: "move", ProcessedFolder: "OpenTodo/Processed",
	}}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, true)
	box := &testMailbox{msgs: map[uint32][]byte{}}
	svc := email.New(db, syncSvc, cfg.Email, email.Options{Log: log, Audit: authSvc.Audit(), Source: box})
	h := New(cfg, authSvc, syncSvc, nil, log, "test", WithEmail(svc))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}, svc, box
}

func registerOwner(e *env) {
	e.t.Helper()
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
}

func TestEmailInboxRoutes(t *testing.T) {
	e, _, _ := emailEnv(t)
	anon := newClientFor(e)
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/email-inbox"}, {"PATCH", "/api/v1/email-inbox"}, {"POST", "/api/v1/email-inbox/rotate"},
	} {
		resp, out := anon.do(r.method, r.path, map[string]any{})
		anon.mustStatus(resp, 401, out)
	}
	registerOwner(e)

	resp, out := e.do("GET", "/api/v1/email-inbox", nil)
	e.mustStatus(resp, 200, out)
	addr, _ := out["address"].(string)
	if out["enabledByOperator"] != true || out["enabled"] != true || !strings.HasPrefix(addr, "todo+") || !strings.HasSuffix(addr, "@example.com") {
		t.Fatalf("inbox = %v", out)
	}
	if len(out["allowlist"].([]any)) != 0 {
		t.Fatalf("allowlist = %v", out["allowlist"])
	}

	// Invalid allowlists: 400 invalid_input, nothing stored.
	for _, bad := range []any{"me@example.org", []any{"not-an-address"}, []any{1}, []any{"Me <me@example.org>"}} {
		resp, out = e.do("PATCH", "/api/v1/email-inbox", map[string]any{"allowlist": bad, "enabled": false})
		e.mustStatus(resp, 400, out)
		if out["error"].(map[string]any)["code"] != "invalid_input" {
			t.Fatalf("error = %v", out)
		}
	}
	resp, out = e.do("GET", "/api/v1/email-inbox", nil)
	if out["enabled"] != true || len(out["allowlist"].([]any)) != 0 {
		t.Fatalf("settings changed by a refused PATCH: %v", out)
	}

	resp, out = e.do("PATCH", "/api/v1/email-inbox", map[string]any{"enabled": false, "allowlist": []string{"Me@Example.org"}})
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["allowlist"].([]any)[0] != "me@example.org" || out["address"] != addr {
		t.Fatalf("patched = %v", out)
	}

	resp, out = e.do("POST", "/api/v1/email-inbox/rotate", nil)
	e.mustStatus(resp, 200, out)
	if out["address"] == addr || out["address"] == nil {
		t.Fatalf("rotate kept the address: %v", out)
	}

	// No response, including the export, carries the operator's mailbox settings.
	for _, p := range []string{"/api/v1/email-inbox", "/api/v1/export", "/api/v1/me"} {
		req, _ := http.NewRequest("GET", e.srv.URL+p, nil)
		res, err := e.client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		dump, _ := httputil.DumpResponse(res, true)
		res.Body.Close()
		for _, secret := range []string{testIMAPHost, testIMAPUser, testIMAPPass, "imap.mail-provider"} {
			if strings.Contains(string(dump), secret) {
				t.Fatalf("%s leaks %q", p, secret)
			}
		}
	}
}

func TestEmailInboxDisabledByOperator(t *testing.T) {
	e := newEnv(t, true)
	registerOwner(e)
	resp, out := e.do("GET", "/api/v1/email-inbox", nil)
	e.mustStatus(resp, 200, out)
	if out["enabledByOperator"] != false || out["address"] != nil {
		t.Fatalf("inbox = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/email-inbox/rotate", nil)
	e.mustStatus(resp, 409, out)
	if out["error"].(map[string]any)["code"] != "email_disabled" {
		t.Fatalf("error = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/email-inbox", map[string]any{"enabled": false})
	e.mustStatus(resp, 409, out)
	var n int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM email_inboxes`).Scan(&n)
	if n != 0 {
		t.Fatal("an inbox row was created while the feature is off")
	}
}

func TestEmailToTaskEndToEnd(t *testing.T) {
	e, svc, box := emailEnv(t)
	registerOwner(e)
	resp, out := e.do("GET", "/api/v1/email-inbox", nil)
	e.mustStatus(resp, 200, out)
	addr := out["address"].(string)

	raw, err := os.ReadFile("../email/testdata/multipart_pdf.eml")
	if err != nil {
		t.Fatal(err)
	}
	raw = []byte(strings.ReplaceAll(string(raw), "todo+secret@example.com", addr))
	box.add(raw)
	box.add(raw) // delivered twice
	counts, err := svc.Poller().Poll(context.Background())
	if err != nil || counts[email.Created] != 1 || counts[email.Duplicate] != 1 {
		t.Fatalf("poll = %v, %v", counts, err)
	}

	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	tasks := out["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("tasks = %v", tasks)
	}
	task := tasks[0].(map[string]any)
	desc, _ := task["description"].(string)
	if task["title"] != "Invoice 2026-10" || task["priority"] != float64(4) || task["project_id"] != nil ||
		!strings.Contains(desc, "Please pay the invoice") || !strings.HasSuffix(desc, "- résumé.png (8 B)") ||
		!strings.Contains(desc, "- invoice-2026-10.pdf (136 B)") {
		t.Fatalf("task = %v", task)
	}

	// A phone syncing from scratch receives the task's ops (device "server").
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	found := 0
	for _, o := range out["ops"].([]any) {
		op := o.(map[string]any)
		if op["entityId"] == task["id"] {
			found++
			if op["device"] != opsync.ServerDevice {
				t.Fatalf("op device = %v", op["device"])
			}
		}
	}
	if found != 5 {
		t.Fatalf("synced ops for the task = %d", found)
	}
}
