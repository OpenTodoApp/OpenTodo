package issues

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/settings"
)

// Store, filter validation and tokens (tasks 1.2, 1.3).

func TestConnectionLimitsAndOwnership(t *testing.T) {
	h := newHarness(t)
	var first *Connection
	for i := range MaxConnections {
		c := h.connect("alice", Input{Name: fmt.Sprint(i)})
		if first == nil {
			first = c
		}
	}
	if _, err := h.w.Store.Create(h.ctx, "alice", Input{Provider: GitHub, Host: "https://github.com", IntervalMinutes: 30}); !errors.Is(err, ErrLimit) {
		t.Fatalf("sixth = %v", err)
	}
	var n int
	h.db.QueryRow(`SELECT COUNT(*) FROM issue_connections`).Scan(&n)
	if n != MaxConnections {
		t.Fatalf("%d stored", n)
	}
	if _, err := h.w.Store.Get(h.ctx, "bob", first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign get = %v", err)
	}
	if err := h.w.Store.Delete(h.ctx, "bob", first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign delete = %v", err)
	}
	if first.State != StatePending || first.IntervalMinutes != 30 || first.Filter.Scope != ScopeAssigned {
		t.Fatalf("new connection = %+v", first)
	}
}

func TestIntervalAndFilterBounds(t *testing.T) {
	var fe *FieldError
	if err := CheckInterval(5); !errors.As(err, &fe) || fe.Field != "interval_minutes" || !strings.Contains(fe.Msg, "15") {
		t.Fatalf("5 minutes = %v", err)
	}
	for _, ok := range []int{15, 30, 1440} {
		if err := CheckInterval(ok); err != nil {
			t.Fatalf("%d: %v", ok, err)
		}
	}
	repos := make([]string, 21)
	for i := range repos {
		repos[i] = fmt.Sprintf("acme/r%d", i)
	}
	labels := make([]string, 11)
	for i := range labels {
		labels[i] = fmt.Sprint("l", i)
	}
	for _, c := range []struct {
		f     Filter
		field string
	}{
		{Filter{Scope: ScopeRepositories, Repositories: repos}, "repositories"},
		{Filter{Labels: labels}, "labels"},
		{Filter{Scope: "everything"}, "scope"},
		{Filter{Scope: ScopeRepositories}, "repositories"},
		{Filter{Scope: ScopeRepositories, Repositories: []string{"no-slash"}}, "repositories"},
	} {
		err := c.f.Normalize().Validate()
		if !errors.As(err, &fe) || fe.Field != c.field {
			t.Errorf("%+v: %v", c.f, err)
		}
	}
	f := Filter{Scope: ScopeRepositories, Repositories: []string{" acme/web ", "", "ACME/web"}, Labels: []string{"bug"}}.Normalize()
	if f.Validate() != nil || len(f.Repositories) != 1 || f.Repositories[0] != "acme/web" {
		t.Fatalf("normalized = %+v", f)
	}
}

func TestTokensFile(t *testing.T) {
	h := newHarness(t)
	c := h.connect("bob", Input{})
	info, err := os.Stat(h.w.Tokens.Path())
	if err != nil || info.Mode().Perm() != 0o600 || !strings.HasSuffix(h.w.Tokens.Path(), "secrets/issues.json") {
		t.Fatalf("file %s: %v %v", h.w.Tokens.Path(), info.Mode(), err)
	}
	f := settings.NewSecretsFile(strings.TrimSuffix(h.w.Tokens.Path(), "/secrets/issues.json"), SecretsName)
	s, _ := f.Load()
	b, _ := json.Marshal(s)
	if strings.Contains(string(b), "pat-") || !strings.Contains(string(b), `"`+c.ID+`":true`) {
		t.Fatalf("encoded = %s", b)
	}
	if has, _ := h.w.Tokens.Has(c.ID, "nope"); !has[c.ID] || has["nope"] {
		t.Fatalf("has = %v", has)
	}
	// An account's rows go by cascade; the sweep drops its token.
	if _, err := h.db.Exec(`DELETE FROM users WHERE id = 'bob'`); err != nil {
		t.Fatal(err)
	}
	if n, err := h.w.Tokens.Sweep(h.ctx, h.w.Store); err != nil || n != 1 {
		t.Fatalf("sweep = %d %v", n, err)
	}
	if tok, _ := h.w.Tokens.Get(c.ID); tok != "" {
		t.Fatal("token kept")
	}
}

func TestStopUserForEncryption(t *testing.T) {
	h := newHarness(t)
	a := h.connect("alice", Input{Name: "Work"})
	h.connect("alice", Input{Name: "Home"})
	h.connect("bob", Input{Name: "Bob's"})
	names, err := h.w.Store.StopUser(h.ctx, "alice", ReasonEncrypted)
	if err != nil || len(names) != 2 {
		t.Fatalf("stopped %v %v", names, err)
	}
	if c := h.conn(a.ID); c.State != StateStopped || c.StoppedReason != ReasonEncrypted {
		t.Fatalf("status = %+v", c)
	}
	if due, _ := h.w.Store.Due(h.ctx, 10); len(due) != 1 || due[0].Name != "Bob's" {
		t.Fatalf("due = %v", due)
	}
}
