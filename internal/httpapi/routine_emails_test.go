package httpapi

import (
	"io"
	"log/slog"
	"regexp"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/rules"
)

// routines-shared-email: Email project members through the real mail service,
// and the stop link's routes.

var stopRe = regexp.MustCompile(`https?://\S+/routine-emails/(ots_\S+)`)

func TestEmailProjectMembersAndStopLink(t *testing.T) {
	e, srv := mailEnv(t, false, func(s *Server) {
		s.rules = rules.New(s.sync.DB(), s.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
		s.ruleSwitch = rules.NewSwitch(s.sync.DB(), nil)
	})
	e.configureMail(srv)
	bob, _ := e.member("bob@example.com", "10.0.0.2")
	carol, _ := e.member("carol@example.com", "10.0.0.3")
	home := e.create("/api/v1/projects", map[string]any{"name": "Household"})
	addByEmail(e, bob, "/api/v1/projects/"+home+"/members", "bob@example.com", "viewer")
	addByEmail(e, carol, "/api/v1/projects/"+home+"/members", "carol@example.com", "editor")
	// The owner and bob have verified addresses; carol has none. Bob reads German.
	if _, err := e.db.Exec(`UPDATE users SET email_verified_at = CASE WHEN email = 'carol@example.com' THEN NULL ELSE 1 END`); err != nil {
		t.Fatal(err)
	}
	bob.syncOps("bobphone", rop("l1", "user_prefs", "me", "language", "de", 1))
	resp, out := e.do("POST", "/api/v1/rules", map[string]any{"name": "Weekly chores", "trigger": map[string]any{"kind": "manual"}, "project_id": home, "enabled": true,
		"steps": []any{map[string]any{"id": "a", "kind": "email_members", "in": map[string]any{"subject": map[string]any{"literal": "This week"}, "text": map[string]any{"literal": "3 chores left"}}}}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if w, _ := out["warnings"].([]any); len(w) != 0 {
		t.Fatalf("warnings %v", w)
	}
	before := len(srv.Messages())
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "m-1"})
	e.mustStatus(resp, 200, out)
	msgs := srv.Messages()[before:]
	if len(msgs) != 2 {
		t.Fatalf("%d messages: %v", len(msgs), out)
	}
	var stop string
	for _, m := range msgs {
		body := mailBody(t, m)
		if !strings.Contains(body, "3 chores left") || !strings.Contains(body, "Weekly chores") {
			t.Fatalf("body %q", body)
		}
		if strings.Contains(strings.Join(m.To, ","), "bob@") {
			if !strings.Contains(body, "Projektmitgliedern mailen") {
				t.Fatalf("bob's message is not in German: %q", body)
			}
			stop = stopRe.FindStringSubmatch(body)[1]
		} else if !strings.Contains(strings.Join(m.To, ","), "owner@") {
			t.Fatalf("message to %v", m.To)
		}
	}
	if stop == "" {
		t.Fatal("no stop link for bob")
	}
	// The link works signed out and names the routine only; a GET stops nothing.
	anon := newClientAt(e, "10.0.0.9")
	resp, out = anon.do("GET", "/api/v1/routine-emails/"+stop, nil)
	anon.mustStatus(resp, 200, out)
	if out["routine"] != "Weekly chores" || out["stopped"] != false || len(out) != 2 {
		t.Fatalf("link %v", out)
	}
	if resp.Header.Get("Cache-Control") != "no-store" || resp.Header.Get("Referrer-Policy") != "no-referrer" {
		t.Fatalf("headers %v", resp.Header)
	}
	for range 2 {
		resp, out = anon.do("POST", "/api/v1/routine-emails/"+stop+"/stop", nil)
		anon.mustStatus(resp, 200, out)
		if out["stopped"] != true {
			t.Fatalf("stop %v", out)
		}
	}
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed' AND details LIKE '%routine_email%'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("%d audit events %v", n, err)
	}
	// The next run emails the owner only.
	before = len(srv.Messages())
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "m-2"})
	e.mustStatus(resp, 200, out)
	if msgs := srv.Messages()[before:]; len(msgs) != 1 || !strings.Contains(strings.Join(msgs[0].To, ","), "owner@") {
		t.Fatalf("after stop: %d messages", len(msgs))
	}
	// A wrong secret is refused whoever asks; guessing is rate limited.
	for _, c := range []*env{anon, e} {
		resp, out = c.do("GET", "/api/v1/routine-emails/"+stop+"x", nil)
		if resp.StatusCode != 404 || errCode(out) != "link_invalid" {
			t.Fatalf("wrong secret %d %v", resp.StatusCode, out)
		}
	}
	guess := newClientAt(e, "10.0.0.10")
	for i := range 11 {
		resp, out = guess.do("POST", "/api/v1/routine-emails/ots_guess/stop", nil)
		if want := map[bool]int{true: 429, false: 404}[i == 10]; resp.StatusCode != want {
			t.Fatalf("guess %d = %d %v", i, resp.StatusCode, out)
		}
	}
}

func TestRoutineEmailLinksRefusedOnDemo(t *testing.T) {
	d := newDemoServer(t)
	e, _ := d.visitor()
	resp, out := e.do("GET", "/api/v1/routine-emails/ots_x", nil)
	if resp.StatusCode != 403 || errCode(out) != "demo_restricted" {
		t.Fatalf("demo = %d %v", resp.StatusCode, out)
	}
}
