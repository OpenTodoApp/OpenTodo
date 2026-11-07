package tenant

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/jobs"
)

// TestLimitsSurviveRestart (persistent-limits): a sign-in window used up
// before the tenant closes is still used up when it opens again, and the
// stored rows hold no address or email.
func TestLimitsSurviveRestart(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "t")
	tn, err := Open(context.Background(), testConfig(dir), Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(tn.Handler)
	c := newClient(t, srv.URL)
	creds := map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"}
	if code, out := c.do("POST", "/api/v1/auth/register", creds); code != http.StatusCreated {
		t.Fatalf("register: %d %v", code, out)
	}
	for i := 0; i < 10; i++ {
		if code, out := newClient(t, srv.URL).do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "wrong password!"}); code != http.StatusUnauthorized {
			t.Fatalf("failure %d: %d %v", i+1, code, out)
		}
	}
	srv.Close()
	if err := tn.Close(); err != nil {
		t.Fatal(err)
	}

	tn, err = Open(context.Background(), testConfig(dir), Options{Version: "test", Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	srv = httptest.NewServer(tn.Handler)
	defer func() { srv.Close(); tn.Close() }()
	code, out := newClient(t, srv.URL).do("POST", "/api/v1/auth/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"})
	if code != http.StatusTooManyRequests {
		t.Fatalf("sign-in after a restart: %d %v, want 429", code, out)
	}
	rows, err := tn.DB.Query(`SELECT limiter, key FROM limit_windows`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	names := map[string]bool{}
	for rows.Next() {
		var name, key string
		if err := rows.Scan(&name, &key); err != nil {
			t.Fatal(err)
		}
		names[name] = true
		if strings.Contains(key, "127.0.0.1") || strings.Contains(key, "example.com") || strings.Contains(key, ":") {
			t.Fatalf("%s row keyed %q: keys are stored hashed", name, key)
		}
	}
	if !names["login"] || !names["account"] {
		t.Fatalf("stored limiters %v, want login and account", names)
	}
}

// TestLimitsJobIsListed: the windows are written by a tenant job (one-job-model).
func TestLimitsJobIsListed(t *testing.T) {
	tn, _ := openTenant(t, filepath.Join(t.TempDir(), "t"))
	for _, j := range tn.Jobs() {
		if j.Name == jobs.Limits {
			if !j.WhileOpen {
				t.Fatal("the limits job must be WhileOpen: closing the tenant writes the windows")
			}
			return
		}
	}
	t.Fatal("no limits job")
}
