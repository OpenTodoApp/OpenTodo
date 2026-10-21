package httpapi

import (
	"io"
	"log/slog"
	"testing"

	"github.com/pixari/opentodo/internal/rules"
	"github.com/pixari/opentodo/internal/settings"
)

// rulesEnv is a signed-in owner on a server with the rules engine; env is
// OPENTODO_AUTOMATIONS (nil when unset).
func rulesEnv(t *testing.T, env *bool) *env {
	t.Helper()
	e := newEnvWith(t, false, func(s *Server) {
		s.rules = rules.New(s.sync.DB(), s.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
		s.ruleSwitch = rules.NewSwitch(settings.New(s.sync.DB()), env)
	})
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

func (e *env) create(path string, body map[string]any) string {
	e.t.Helper()
	resp, out := e.do("POST", path, body)
	e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

func TestRulesRoutes(t *testing.T) {
	e := rulesEnv(t, nil)
	label := e.create("/api/v1/labels", map[string]any{"name": "waiting"})
	project := e.create("/api/v1/projects", map[string]any{"name": "Work"})
	section := e.create("/api/v1/sections", map[string]any{"name": "Waiting", "project_id": project})
	body := map[string]any{"name": "Waiting", "trigger": map[string]any{"kind": "label.added", "label_id": label},
		"actions": map[string]any{"section": map[string]any{"project_id": project, "section_id": section}}}
	id := e.create("/api/v1/rules", body)
	resp, out := e.do("GET", "/api/v1/rules/"+id, nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != true || out["condition"] != nil {
		t.Fatalf("defaults: %v", out)
	}
	// Ids resolve; a section of another project and unknown keys are refused.
	for _, bad := range []map[string]any{
		{"name": "x", "trigger": map[string]any{"kind": "label.added", "label_id": "nope"}, "actions": map[string]any{"priority": 1}},
		{"name": "x", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"section": map[string]any{"project_id": "nope", "section_id": nil}}},
		{"name": "x", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"fly": true}},
		{"name": "x", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"webhook": map[string]any{"webhook_id": "nope"}}},
		{"name": " ", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"priority": 1}},
		{"name": "x", "trigger": map[string]any{"kind": "task.created"}},
	} {
		resp, out := e.do("POST", "/api/v1/rules", bad)
		e.mustStatus(resp, 400, out)
	}
	resp, out = e.do("PATCH", "/api/v1/rules/"+id, map[string]any{"name": "Renamed", "enabled": false})
	e.mustStatus(resp, 200, out)

	// Dry run: the condition and the plan on one task, nothing written.
	task := e.create("/api/v1/tasks", map[string]any{"title": "Call Ana"})
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/test", map[string]any{"task_id": task})
	e.mustStatus(resp, 200, out)
	if out["matches"] != true || out["changes"].(map[string]any)["section_id"] != section {
		t.Fatalf("dry run %v", out)
	}
	resp, out = e.do("GET", "/api/v1/rules/"+id+"/runs", nil)
	e.mustStatus(resp, 200, out)
	if runs := out["runs"].([]any); len(runs) != 0 {
		t.Fatalf("runs %v", runs)
	}

	// Pause all, then the profile says so.
	resp, out = e.do("PUT", "/api/v1/me/rules/paused", map[string]any{"paused": true})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if a := out["automations"].(map[string]any); a["enabled"] != true || a["paused"] != true {
		t.Fatalf("profile %v", a)
	}

	// Another user's rule is not found; the unauthenticated are refused.
	m, _ := e.member("member@example.com", "203.0.113.9")
	resp, out = m.do("GET", "/api/v1/rules/"+id+"/runs", nil)
	m.mustStatus(resp, 404, out)
	resp, out = m.do("PUT", "/api/v1/settings/automations", map[string]any{"enabled": false})
	m.mustStatus(resp, 403, out)
	anon := newClientAt(e, "203.0.113.10")
	resp, out = anon.do("GET", "/api/v1/rules/"+id+"/runs", nil)
	anon.mustStatus(resp, 401, out)

	// The owner turns automations off.
	resp, out = e.do("PUT", "/api/v1/settings/automations", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["locked"] != false {
		t.Fatalf("switch %v", out)
	}
}

func TestRulesLimit(t *testing.T) {
	e := rulesEnv(t, nil)
	for i := range rules.MaxRules {
		e.create("/api/v1/rules", map[string]any{"name": "r" + string(rune('a'+i%26)), "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"priority": 1}})
	}
	resp, out := e.do("POST", "/api/v1/rules", map[string]any{"name": "one more", "trigger": map[string]any{"kind": "task.created"}, "actions": map[string]any{"priority": 1}})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "limit_reached" {
		t.Fatalf("code %v", out)
	}
}

func TestAutomationsVariableWins(t *testing.T) {
	off := false
	e := rulesEnv(t, &off)
	resp, out := e.do("GET", "/api/v1/settings/automations", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || out["locked"] != true || out["locked_by"] != "OPENTODO_AUTOMATIONS" {
		t.Fatalf("setting %v", out)
	}
	resp, out = e.do("PUT", "/api/v1/settings/automations", map[string]any{"enabled": true})
	e.mustStatus(resp, 409, out)
	if errCode(out) != "set_by_environment" {
		t.Fatalf("code %v", out)
	}
}
