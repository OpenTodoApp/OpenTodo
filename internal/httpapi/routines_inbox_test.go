package httpapi

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/rules"
)

// routines-editor 1.2: the Inbox card's route and dismissals.
func TestRoutineInboxRoute(t *testing.T) {
	var srv *Server
	e := newEnvWith(t, false, func(s *Server) {
		s.rules = rules.New(s.sync.DB(), s.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
		s.ruleSwitch = rules.NewSwitch(s.sync.DB(), nil)
		srv = s
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	ctx := context.Background()
	var uid string
	if err := srv.sync.DB().QueryRow(`SELECT id FROM users WHERE email = 'owner@example.com'`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	record := func(key, source, outcome string) {
		if err := srv.rules.Store.Record(ctx, uid, rules.Run{RuleID: "r1", OccurrenceKey: key, Source: source, Outcome: outcome}); err != nil {
			t.Fatal(err)
		}
	}
	record("sched:1", rules.SourceSchedule, rules.OutcomeApplied)
	record("manual:1", rules.SourceManual, rules.OutcomeApplied) // own manual run: never listed
	record("sched:2", rules.SourceSchedule, rules.OutcomeFailed)
	resp, out = e.do("GET", "/api/v1/me/rules/runs?for=inbox&since=0", nil)
	e.mustStatus(resp, 200, out)
	list := out["runs"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["kind"] != "failure" || list[1].(map[string]any)["kind"] != "success" || out["seen_at"] != float64(0) {
		t.Fatalf("inbox %v", out)
	}
	success := list[1].(map[string]any)["run_id"].(string)
	// A since far ahead keeps the failure only.
	resp, out = e.do("GET", "/api/v1/me/rules/runs?for=inbox&since=99999999999999", nil)
	e.mustStatus(resp, 200, out)
	if len(out["runs"].([]any)) != 1 {
		t.Fatalf("after marker %v", out)
	}
	resp, out = e.do("GET", "/api/v1/me/rules/runs?for=inbox&since=-1", nil)
	e.mustStatus(resp, 400, out)
	// Dismiss: another user's run is not found; the owner's is hidden.
	m, _ := e.member("member@example.com", "203.0.113.9")
	resp, out = m.do("POST", "/api/v1/rules/r1/runs/"+success+"/dismiss", nil)
	m.mustStatus(resp, 404, out)
	resp, out = e.do("POST", "/api/v1/rules/r1/runs/"+success+"/dismiss", nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/me/rules/runs?for=inbox", nil)
	e.mustStatus(resp, 200, out)
	if len(out["runs"].([]any)) != 1 {
		t.Fatalf("after dismiss %v", out)
	}
	anon := newClientAt(e, "203.0.113.10")
	resp, out = anon.do("GET", "/api/v1/me/rules/runs?for=inbox", nil)
	anon.mustStatus(resp, 401, out)
	resp, out = anon.do("POST", "/api/v1/rules/r1/runs/"+success+"/dismiss", nil)
	anon.mustStatus(resp, 401, out)
}
