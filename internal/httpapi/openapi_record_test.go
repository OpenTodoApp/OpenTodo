package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

// The recorded examples of the OpenAPI description (openapi-description):
// the core resources called once on a test server with a frozen clock, their
// ids replaced by stable placeholders, so the examples show what the server
// really answers and stay the same from run to run.

// openAPIExampleTime is the frozen clock of the recording: 2026-11-17 09:00 UTC.
var openAPIExampleTime = time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)

// recordedExample is one call: the request body sent and the answer.
type recordedExample struct {
	status   int
	request  any
	response any
}

var (
	exampleUUID  = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	exampleToken = regexp.MustCompile(`\bot_[A-Za-z0-9_-]{8,}`)
	// The server's device id (server:<random>) and the database's sync
	// generation are random per database.
	exampleRandom = []struct {
		re   *regexp.Regexp
		with string
	}{
		{regexp.MustCompile(`\bserver:[0-9a-f]{8}\b`), "server:0a1b2c3d"},
		{regexp.MustCompile(`\b[0-9a-f]{32}\b`), "0a1b2c3d4e5f60718293a4b5c6d7e8f9"},
	}
)

// exampleRecorder keeps the calls by operation ("POST /api/v1/tasks") and
// maps every id it sees to a placeholder in the order it first sees them.
type exampleRecorder struct {
	t   *testing.T
	e   *env
	ids map[string]string
	out map[string]recordedExample
}

// placeholder is the n-th stable id: 00000000-0000-4000-8000-00000000000n.
func placeholder(n int) string { return fmt.Sprintf("00000000-0000-4000-8000-%012d", n) }

// stable replaces ids and tokens in a decoded value, keys in sorted order,
// and keeps one item of every list.
func (x *exampleRecorder) stable(v any) any {
	switch v := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for _, k := range sortedKeys(v) {
			out[x.stableString(k)] = x.stable(v[k])
		}
		return out
	case []any:
		if len(v) == 0 {
			return []any{}
		}
		return []any{x.stable(v[0])}
	case string:
		return x.stableString(v)
	}
	return v
}

func (x *exampleRecorder) stableString(s string) string {
	s = exampleUUID.ReplaceAllStringFunc(s, func(id string) string {
		if p, ok := x.ids[id]; ok {
			return p
		}
		p := placeholder(len(x.ids) + 1)
		x.ids[id] = p
		return p
	})
	s = strings.ReplaceAll(s, x.e.srv.URL, "https://todo.example.com")
	for _, r := range exampleRandom {
		s = r.re.ReplaceAllString(s, r.with)
	}
	return exampleToken.ReplaceAllString(s, "ot_example_token")
}

// call sends one request, records it under op (the method and the
// description's path) and returns the raw answer for the next steps.
func (x *exampleRecorder) call(op, path string, body any, want int) map[string]any {
	x.t.Helper()
	method, _, _ := strings.Cut(op, " ")
	resp, out := x.e.do(method, path, body)
	x.e.mustStatus(resp, want, out)
	if _, dup := x.out[op]; dup {
		x.t.Fatalf("%s recorded twice", op)
	}
	rec := recordedExample{status: resp.StatusCode}
	if body != nil {
		rec.request = x.stable(roundTripAny(x.t, body))
	}
	if out != nil {
		rec.response = x.stable(roundTripAny(x.t, out))
	}
	x.out[op] = rec
	return out
}

// recordExamples calls the core routes on a fresh account and returns their
// examples, plus the error envelope's examples by code.
func recordExamples(t *testing.T) (map[string]recordedExample, map[string]any) {
	t.Helper()
	e := newEnv(t, false)
	e.now.Freeze(openAPIExampleTime)
	// The session cookie expires an hour after the frozen time, already past
	// on the real clock the client's cookie jar reads.
	e.client.Jar = &keepJar{}
	x := &exampleRecorder{t: t, e: e, ids: map[string]string{}, out: map[string]recordedExample{}}
	errs := map[string]any{}
	anon := newClientFor(e)
	_, out := anon.do("GET", "/api/v1/me", nil)
	errs["unauthorized"] = out
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "ada@example.com", "name": "Ada", "password": "correct horse battery staple"})
	e.mustStatus(resp, 201, out)
	x.stable(out) // the account's id is the first placeholder
	x.call("GET /api/v1/me", "/api/v1/me", nil, 200)

	project := x.call("POST /api/v1/projects", "/api/v1/projects", map[string]any{"name": "Home", "color": "#3b82f6"}, 201)["id"].(string)
	x.call("GET /api/v1/projects/{id}", "/api/v1/projects/"+project, nil, 200)
	x.call("PATCH /api/v1/projects/{id}", "/api/v1/projects/"+project, map[string]any{"name": "Home and garden"}, 200)
	x.call("GET /api/v1/projects", "/api/v1/projects", nil, 200)

	section := x.call("POST /api/v1/sections", "/api/v1/sections", map[string]any{"name": "This week", "project_id": project}, 201)["id"].(string)
	x.call("GET /api/v1/sections/{id}", "/api/v1/sections/"+section, nil, 200)
	x.call("PATCH /api/v1/sections/{id}", "/api/v1/sections/"+section, map[string]any{"name": "Next week"}, 200)
	x.call("GET /api/v1/sections", "/api/v1/sections", nil, 200)

	label := x.call("POST /api/v1/labels", "/api/v1/labels", map[string]any{"name": "errands", "color": "#f59e0b"}, 201)["id"].(string)
	x.call("GET /api/v1/labels/{id}", "/api/v1/labels/"+label, nil, 200)
	x.call("PATCH /api/v1/labels/{id}", "/api/v1/labels/"+label, map[string]any{"name": "outside"}, 200)
	x.call("GET /api/v1/labels", "/api/v1/labels", nil, 200)

	task := x.call("POST /api/v1/tasks", "/api/v1/tasks", map[string]any{
		"title": "Buy paint for the fence", "project_id": project, "section_id": section, "labels": []any{label},
		"priority": 2, "due": map[string]any{"date": "2026-11-20", "time": "10:00"}, "description": "Two litres, dark green.",
	}, 201)["id"].(string)
	x.call("GET /api/v1/tasks/{id}", "/api/v1/tasks/"+task, nil, 200)
	x.call("PATCH /api/v1/tasks/{id}", "/api/v1/tasks/"+task, map[string]any{"priority": 1, "estimate_minutes": 30}, 200)
	x.call("GET /api/v1/tasks", "/api/v1/tasks", nil, 200)

	reminder := x.call("POST /api/v1/reminders", "/api/v1/reminders", map[string]any{"task_id": task, "kind": "relative", "offset_minutes": -60}, 201)["id"].(string)
	x.call("GET /api/v1/reminders/{id}", "/api/v1/reminders/"+reminder, nil, 200)
	x.call("PATCH /api/v1/reminders/{id}", "/api/v1/reminders/"+reminder, map[string]any{"offset_minutes": -30}, 200)
	x.call("GET /api/v1/reminders", "/api/v1/reminders", nil, 200)

	comment := x.call("POST /api/v1/tasks/{id}/comments", "/api/v1/tasks/"+task+"/comments", map[string]any{"body": "The shop opens at nine."}, 201)["id"].(string)
	x.call("GET /api/v1/tasks/{id}/comments", "/api/v1/tasks/"+task+"/comments", nil, 200)
	x.call("PATCH /api/v1/comments/{id}", "/api/v1/comments/"+comment, map[string]any{"body": "The shop opens at ten."}, 200)
	x.call("PUT /api/v1/comments/{id}/reactions", "/api/v1/comments/"+comment+"/reactions", map[string]any{"reactions": []any{"heart"}}, 200)

	note := x.call("POST /api/v1/notes", "/api/v1/notes", map[string]any{"title": "Garden plan", "description": "- fence\n- beds"}, 201)["id"].(string)
	x.call("GET /api/v1/notes/{id}", "/api/v1/notes/"+note, nil, 200)
	x.call("PATCH /api/v1/notes/{id}", "/api/v1/notes/"+note, map[string]any{"title": "Garden plan 2027"}, 200)
	x.call("POST /api/v1/notes/{id}/append", "/api/v1/notes/"+note+"/append", map[string]any{"text": "- decided: green"}, 201)
	x.call("GET /api/v1/notes", "/api/v1/notes", nil, 200)

	// A device that is up to date sends one op (from cursor 0 the answer's first
	// op would be any of a batch's ops, which share a sequence number).
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, 200, out)
	x.call("POST /api/v1/sync", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": out["cursor"], "ops": []any{
		map[string]any{"id": "laptop-1", "entity": "task", "entityId": task, "field": "title", "value": "Buy green paint", "ts": openAPIExampleTime.UnixMilli(), "device": "laptop"},
	}}, 200)

	recordMore(x, note)

	_, out = e.do("GET", "/api/v1/tasks/"+placeholder(999), nil)
	errs["not_found"] = out
	_, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": 7})
	errs["invalid_input"] = out
	for k, v := range errs {
		errs[k] = x.stable(v)
	}
	return x.out, errs
}

// recordMore calls the routes whose answers the static analysis cannot
// see: the owner switches, habits, rules, a repeating task's occurrences.
func recordMore(x *exampleRecorder, note string) {
	x.t.Helper()
	for _, name := range []string{"automations", "caldav", "caldav/push", "calendar-feeds", "calendar-sync", "issues", "notification-channels", "project-invites", "push/apple-relay"} {
		path := "/api/v1/settings/" + name
		got := x.call("GET "+path, path, nil, 200)
		field := "enabled"
		if _, ok := got[field]; !ok {
			for _, k := range sortedKeys(got) {
				if _, ok := got[k].(bool); ok {
					field = k
					break
				}
			}
		}
		x.call("PUT "+path, path, map[string]any{field: got[field]}, 200)
	}
	x.call("GET /api/v1/me/assistant", "/api/v1/me/assistant", nil, 200)
	x.call("GET /api/v1/rules", "/api/v1/rules", nil, 200)
	x.call("POST /api/v1/notes/{id}/to-task", "/api/v1/notes/"+note+"/to-task", nil, 201)
	habit := x.create(map[string]any{"title": "Stretch", "habit": true, "recurrence": "every day", "due": map[string]any{"date": "2026-11-17"}})
	x.call("GET /api/v1/habits", "/api/v1/habits", nil, 200)
	x.call("GET /api/v1/habits/{id}", "/api/v1/habits/"+habit, nil, 200)
	series := x.create(map[string]any{"title": "Water the plants", "recurrence": "every week", "due": map[string]any{"date": "2026-11-20"}})
	occ := "/api/v1/tasks/" + series + "/occurrences/"
	x.call("PATCH /api/v1/tasks/{id}/occurrences/{date}", occ+"2026-11-27", map[string]any{"title": "Water the plants and the herbs"}, 200)
	x.call("POST /api/v1/tasks/{id}/occurrences/{date}/skip", occ+"2026-12-04/skip", nil, 200)
	x.call("POST /api/v1/tasks/{id}/occurrences/{date}/complete", occ+"2026-11-20/complete", nil, 200)
	study := x.create(map[string]any{"title": "Study", "recurrence": "every weekday", "due": map[string]any{"date": "2026-11-23", "time": "18:00"}})
	x.call("POST /api/v1/tasks/{id}/split", "/api/v1/tasks/"+study+"/split", map[string]any{"from": "2026-11-25", "changes": map[string]any{"title": "Study with Ada"}}, 200)
	// An away period (away-periods): its skips and the stored period, then ended.
	x.call("POST /api/v1/away", "/api/v1/away", map[string]any{"from": "2026-12-21", "to": "2026-12-27"}, 200)
	x.call("DELETE /api/v1/away", "/api/v1/away", nil, 204)
	// A connected AI app (connected-apps-list).
	x.e.enableMCP(true)
	x.e.connectOAuth(x.e.createOAuthClient("Gemini", "agent"))
	x.call("GET /api/v1/me/oauth-grants", "/api/v1/me/oauth-grants", nil, 200)
}

// create makes a task without recording the call and returns its id.
func (x *exampleRecorder) create(body map[string]any) string {
	x.t.Helper()
	resp, out := x.e.do("POST", "/api/v1/tasks", body)
	x.e.mustStatus(resp, 201, out)
	return out["id"].(string)
}

// keepJar is a cookie jar that keeps every cookie whatever its expiry.
type keepJar struct{ cookies []*http.Cookie }

func (j *keepJar) SetCookies(_ *url.URL, cs []*http.Cookie) {
	for _, c := range cs {
		j.cookies = slices.DeleteFunc(j.cookies, func(o *http.Cookie) bool { return o.Name == c.Name })
		if c.MaxAge >= 0 && c.Value != "" {
			j.cookies = append(j.cookies, &http.Cookie{Name: c.Name, Value: c.Value})
		}
	}
}

func (j *keepJar) Cookies(*url.URL) []*http.Cookie { return j.cookies }

// roundTripAny is v as decoded JSON.
func roundTripAny(t *testing.T, v any) any {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}
