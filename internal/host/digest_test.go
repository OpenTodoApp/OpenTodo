package host

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail/smtptest"
)

// TestDigestInClosedTenant (multi-tenant-host x stats-and-review): a weekly
// digest due in a closed tenant is in the "next due" index; the shared
// scheduler opens the tenant at its hour and sends it once through the
// operator's outgoing email.
func TestDigestInClosedTenant(t *testing.T) {
	sink := smtptest.New(t, smtptest.Options{NoSTARTTLS: true, NoAuth: true})
	f := newFixture(t, func(c *config.Config, _ *Options) {
		c.SMTP = config.SMTPConfig{Host: sink.Host, Port: sink.Port, Security: "none", From: "OpenTodo <todo@example.com>"}
	})
	ctx := context.Background()
	c := f.client("alice")
	c.register("alice@example.com", f.create("alice", config.Limits{}))

	// The user opts in (theirs, not an operator setting) for two hours from now.
	sched := f.clock.Now().UTC().Truncate(time.Hour).Add(2 * time.Hour)
	code, out := c.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": true, "weekday": int(sched.Weekday()), "hour": sched.Hour(), "timeZone": "UTC", "language": "en"})
	if code != http.StatusOK || out["available"] != true {
		t.Fatalf("opt in: %d %v", code, out)
	}

	// Idle: the tenant closes and leaves the digest's time in the index.
	f.clock.Advance(11 * time.Minute)
	if n := f.h.pool.sweep(); n != 1 {
		t.Fatalf("swept %d", n)
	}
	due, _, err := f.h.reg.DueBefore(ctx, sched, 10)
	if err != nil || !slices.Contains(due["alice"], KindDigest) {
		t.Fatalf("index at %v: %v %v", sched, due, err)
	}
	if early, _, _ := f.h.reg.DueBefore(ctx, sched.Add(-time.Second), 10); slices.Contains(early["alice"], KindDigest) {
		t.Fatalf("digest due before its hour: %v", early)
	}

	// Before the hour nothing is sent.
	f.clock.Set(sched.Add(-time.Minute))
	f.h.tick(ctx)
	if n := len(sink.Messages()); n != 0 {
		t.Fatalf("sent %d before the hour", n)
	}
	// At the hour the scheduler opens the tenant and sends the digest.
	f.clock.Set(sched.Add(time.Second))
	f.h.tick(ctx)
	msgs := sink.Messages()
	if len(msgs) != 1 || len(msgs[0].To) != 1 || msgs[0].To[0] != "alice@example.com" {
		t.Fatalf("digests: %+v", msgs)
	}
	// Sent once: the next one is a week away.
	f.h.tick(ctx)
	if n := len(sink.Messages()); n != 1 {
		t.Fatalf("sent %d, want 1", n)
	}
	later, _, err := f.h.reg.DueBefore(ctx, sched.Add(6*24*time.Hour), 10)
	if err != nil || slices.Contains(later["alice"], KindDigest) {
		t.Fatalf("digest due again within the week: %v %v", later, err)
	}
	if next, _, _ := f.h.reg.DueBefore(ctx, sched.Add(7*24*time.Hour), 10); !slices.Contains(next["alice"], KindDigest) {
		t.Fatalf("next week's digest not indexed: %v", next)
	}
}

// TestDigestWithoutOperatorEmail: without the operator's outgoing email a
// tenant user may read the digest settings (unavailable) and is told who
// configures email; nothing enters the index.
func TestDigestWithoutOperatorEmail(t *testing.T) {
	f := newFixture(t, nil)
	ctx := context.Background()
	c := f.client("bob")
	c.register("bob@example.com", f.create("bob", config.Limits{}))
	code, out := c.do("GET", "/api/v1/me/email-digest", nil)
	if code != http.StatusOK || out["available"] != false {
		t.Fatalf("get: %d %v", code, out)
	}
	code, out = c.do("PUT", "/api/v1/me/email-digest", map[string]any{"enabled": true})
	if code != http.StatusNotFound || errCode(out) != "smtp_disabled" {
		t.Fatalf("put: %d %v", code, out)
	}
	if msg, _ := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "operator") {
		t.Fatalf("message: %q", msg)
	}
	// Custom fields are tenant data, never an operator setting.
	if code, out := c.do("GET", "/api/v1/fields", nil); code != http.StatusOK {
		t.Fatalf("fields: %d %v", code, out)
	}
	f.clock.Advance(11 * time.Minute)
	f.h.pool.sweep()
	due, _, err := f.h.reg.DueBefore(ctx, f.clock.Now().Add(30*24*time.Hour), 10)
	if err != nil || slices.Contains(due["bob"], KindDigest) {
		t.Fatalf("index: %v %v", due, err)
	}
}
