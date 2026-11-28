package httpapi

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"testing"
)

// The examples of the OpenAPI description (openapi-description): every
// request and response body gets one. The core resources show what a test
// server really answered (recordExamples); every other body gets an example
// built from its schema (schemaExample), so a new operation has one the day
// it is described.

// addExamples puts the recorded examples, or the schema's, on every
// operation's request body and JSON responses, and the recorded error
// envelopes on the shared error responses.
func addExamples(t *testing.T, paths map[string]any, comps map[string]any) {
	t.Helper()
	rec, errs := recordExamples(t)
	schemas, _ := comps["schemas"].(map[string]any)
	used := map[string]bool{}
	for _, path := range sortedKeys(paths) {
		item := paths[path].(map[string]any)
		for _, method := range sortedKeys(item) {
			op := item[method].(map[string]any)
			key := strings.ToUpper(method) + " " + path
			r, recorded := rec[key]
			used[key] = recorded
			if body, ok := op["requestBody"].(map[string]any); ok {
				media := jsonMedia(body)
				if recorded && r.request != nil {
					media["example"] = r.request
				} else {
					media["example"] = schemaExample(media["schema"], "", schemas, 0)
				}
			} else if recorded && r.request != nil {
				// The analysis did not see this body; the example shows it.
				op["requestBody"] = schema{"description": "The body's fields are not described yet; the example shows one.",
					"content": schema{"application/json": schema{"example": r.request}}}
			}
			responses, _ := op["responses"].(map[string]any)
			if recorded && r.response != nil {
				recordedResponse(responses, r)
			}
			for _, st := range sortedKeys(responses) {
				resp, ok := responses[st].(schema)
				if !ok || resp["content"] == nil || !strings.HasPrefix(st, "2") {
					continue
				}
				if media := jsonMedia(resp); media["example"] == nil {
					media["example"] = schemaExample(media["schema"], "", schemas, 0)
				}
			}
		}
	}
	for _, k := range sortedKeys(rec) {
		if !used[k] {
			t.Fatalf("recorded example for %s, which the description does not have", k)
		}
	}
	shared, _ := comps["responses"].(schema)
	examples := schema{}
	for _, code := range sortedKeys(errs) {
		examples[code] = schema{"summary": code, "value": errs[code]}
	}
	jsonMedia(shared["Error"].(schema))["examples"] = examples
	jsonMedia(shared["Unauthorized"].(schema))["example"] = errs["unauthorized"]
}

// recordedResponse puts a recorded answer on the response of its status, or
// else on the first success response the description has.
func recordedResponse(responses map[string]any, r recordedExample) {
	st := fmt.Sprint(r.status)
	if _, ok := responses[st]; !ok {
		// The server answered with a status the description does not declare (a
		// handler that picks it at run time, such as 201 for a create): the recorded
		// status is the real one. A single declared success becomes it; beside several,
		// it is added with the first one's body.
		var success []string
		for _, s := range sortedKeys(responses) {
			if strings.HasPrefix(s, "2") {
				success = append(success, s)
			}
		}
		if len(success) == 0 {
			return
		}
		first, _ := responses[success[0]].(schema)
		moved := schema{"description": statusText(st)}
		if first["content"] != nil {
			moved["content"] = first["content"]
		}
		if len(success) == 1 {
			delete(responses, success[0])
		}
		responses[st] = moved
	}
	resp, ok := responses[st].(schema)
	if !ok {
		return
	}
	if resp["content"] == nil {
		resp["content"] = schema{"application/json": schema{}}
	}
	jsonMedia(resp)["example"] = r.response
}

// jsonMedia is the application/json media type object of a body or response.
func jsonMedia(body map[string]any) map[string]any {
	content, _ := body["content"].(map[string]any)
	media, _ := content["application/json"].(map[string]any)
	return media
}

// schemaExample builds a value that fits a schema: the first of an enum,
// examples or alternatives, an object with every property, a list of one
// item, and for strings and numbers a value chosen by the field's name.
func schemaExample(v any, name string, schemas map[string]any, depth int) any {
	s, ok := v.(map[string]any)
	if !ok || depth > 12 {
		return nil
	}
	if r, ok := s["$ref"].(string); ok {
		return schemaExample(schemas[strings.TrimPrefix(r, "#/components/schemas/")], name, schemas, depth+1)
	}
	if c, ok := s["const"]; ok {
		return c
	}
	for _, k := range []string{"enum", "examples"} {
		if list, ok := s[k].([]any); ok && len(list) > 0 {
			return list[0]
		}
	}
	if all, ok := s["allOf"].([]any); ok {
		out := map[string]any{}
		for _, part := range all {
			if m, ok := schemaExample(part, name, schemas, depth+1).(map[string]any); ok {
				for k, x := range m {
					out[k] = x
				}
			}
		}
		return out
	}
	for _, k := range []string{"anyOf", "oneOf"} {
		if list, ok := s[k].([]any); ok {
			for _, alt := range list {
				if a, ok := alt.(map[string]any); !ok || a["type"] != "null" {
					return schemaExample(alt, name, schemas, depth+1)
				}
			}
		}
	}
	switch exampleType(s) {
	case "object":
		return objectExample(s, schemas, depth)
	case "array":
		return []any{schemaExample(s["items"], singular(name), schemas, depth+1)}
	case "string":
		return stringExample(name, s)
	case "integer", "number":
		return numberExample(name, s)
	case "boolean":
		return name == "ok"
	}
	return nil
}

// exampleType is a schema's type, the first that is not null, or "object"
// for a schema with properties.
func exampleType(s map[string]any) string {
	switch t := s["type"].(type) {
	case string:
		return t
	case []any:
		for _, e := range t {
			if e != "null" {
				return fmt.Sprint(e)
			}
		}
		return "null"
	}
	if s["properties"] != nil || s["additionalProperties"] != nil {
		return "object"
	}
	return ""
}

func objectExample(s map[string]any, schemas map[string]any, depth int) map[string]any {
	out := map[string]any{}
	props, _ := s["properties"].(map[string]any)
	for _, k := range sortedKeys(props) {
		out[k] = schemaExample(props[k], k, schemas, depth+1)
	}
	if ap, ok := s["additionalProperties"].(map[string]any); ok && len(props) == 0 {
		out["key"] = schemaExample(ap, "", schemas, depth+1)
	}
	return out
}

// stringExample is a string by format and by the field's name; tokens and
// secrets are obvious placeholders, people and addresses example.com ones.
func stringExample(name string, s map[string]any) string {
	switch s["format"] {
	case "date":
		return "2026-11-20"
	case "date-time":
		return "2026-11-17T09:00:00Z"
	case "uri":
		return "https://todo.example.com/"
	case "email":
		return "ada@example.com"
	}
	if s["pattern"] == `^\d{2}:\d{2}$` {
		return "09:00"
	}
	n := strings.ToLower(name)
	for _, c := range []struct{ has, value string }{
		{"email", "ada@example.com"}, {"token", "ot_example_token"}, {"secret", "example-secret"},
		{"password", "correct horse battery staple"}, {"url", "https://todo.example.com/"}, {"color", "#3b82f6"},
		{"timezone", "Europe/Rome"}, {"tz", "Europe/Rome"}, {"date", "2026-11-20"}, {"title", "Buy paint for the fence"},
	} {
		if strings.Contains(n, c.has) {
			return c.value
		}
	}
	switch {
	case n == "id" || strings.HasSuffix(n, "_id") || strings.HasSuffix(name, "Id") || n == "ids":
		return placeholder(1)
	case n == "name" || strings.HasSuffix(n, "name"):
		return "Ada"
	case n == "role":
		return "member"
	case n == "scope":
		return "full"
	}
	return "example"
}

// numberExample is a number by the field's name: times are the recording's
// frozen clock in Unix milliseconds.
func numberExample(name string, s map[string]any) any {
	n := strings.ToLower(name)
	if strings.HasSuffix(n, "_at") || strings.HasSuffix(name, "At") || strings.HasSuffix(n, "time") || n == "ts" {
		return openAPIExampleTime.UnixMilli()
	}
	if m, ok := s["minimum"]; ok {
		return m
	}
	return 1
}

// openAPIExamplelessMax is the most operations the description may leave
// without a response example. These answer no JSON the description knows
// of: 204 No content, redirects, files, event streams, or a body the static
// analysis cannot see yet; they get an example once their body is described.
// It only goes down, except by one for a new route that answers 204 or a
// redirect (DELETE /api/v1/me/oauth-grants/{id}, connected-apps-list; 91 and
// 92: POST /api/v1/auth/oidc/app-session and app-continue, app-sso-system-browser;
// 93: DELETE /api/v1/calendar-sync/connections/{id}/events/{eventId}, calendar-event-edits;
// 94: DELETE /api/v1/push/apple/{id}, ios-push-relay).
const openAPIExamplelessMax = 94

// examplelessProblems is the ratchet on examples: a JSON request or success
// response without one always fails, and more operations without any
// response example than most (openAPIExamplelessMax) fail with their names.
func examplelessProblems(doc map[string]any, most int) []string {
	var problems, none []string
	paths, _ := doc["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range sortedKeys(item) {
			op, _ := item[method].(map[string]any)
			where := strings.ToUpper(method) + " " + path
			if body, ok := op["requestBody"].(map[string]any); ok {
				if _, ok := jsonMedia(body)["example"]; !ok {
					problems = append(problems, where+": the request body has no example")
				}
			}
			has := false
			responses, _ := op["responses"].(map[string]any)
			for _, st := range sortedKeys(responses) {
				r, _ := responses[st].(map[string]any)
				if r["content"] == nil || !strings.HasPrefix(st, "2") {
					continue
				}
				if _, ok := jsonMedia(r)["example"]; ok {
					has = true
				} else {
					problems = append(problems, where+" "+st+": no example")
				}
			}
			if !has {
				none = append(none, where)
			}
		}
	}
	switch {
	case len(none) > most:
		problems = append(problems, fmt.Sprintf("%d operations have no response example (at most %d): %s",
			len(none), most, strings.Join(none, ", ")))
	case len(none) < most:
		problems = append(problems, fmt.Sprintf("only %d operations have no response example: lower openAPIExamplelessMax to %d", len(none), len(none)))
	}
	sort.Strings(problems)
	return problems
}

func TestOpenAPISchemaExample(t *testing.T) {
	schemas := map[string]any{"Due": kindComponents["Due"]}
	s := schema{"type": "object", "properties": schema{
		"id": schema{"type": "string"}, "email": schema{"type": "string"}, "token": schema{"type": "string"},
		"priority": kindSchemas["priority"], "due": kindSchemas["due"], "created_at": schema{"type": "integer"},
		"labels": schema{"type": "array", "items": schema{"type": "string"}}, "ok": schema{"type": "boolean"},
	}}
	got, _ := json.Marshal(schemaExample(s, "", schemas, 0))
	want := `{"created_at":1794906000000,"due":{"date":"2026-11-20","time":"09:00","tz":"Europe/Rome"},"email":"ada@example.com",` +
		`"id":"00000000-0000-4000-8000-000000000001","labels":["example"],"ok":true,"priority":1,"token":"ot_example_token"}`
	if string(got) != want {
		t.Errorf("schemaExample = %s, want %s", got, want)
	}
	body := func(example bool) map[string]any {
		media := map[string]any{"schema": map[string]any{"type": "object"}}
		if example {
			media["example"] = map[string]any{}
		}
		return map[string]any{"content": map[string]any{"application/json": media}}
	}
	doc := map[string]any{"paths": map[string]any{"/api/v1/x": map[string]any{
		"get":    map[string]any{"responses": map[string]any{"200": body(false)}},
		"post":   map[string]any{"requestBody": body(true), "responses": map[string]any{"201": body(true)}},
		"delete": map[string]any{"responses": map[string]any{"204": map[string]any{"description": "No content"}}},
	}}}
	p := examplelessProblems(doc, 1)
	if len(p) != 2 || !strings.HasPrefix(p[0], "2 operations have no response example (at most 1): DELETE /api/v1/x, GET /api/v1/x") || p[1] != "GET /api/v1/x 200: no example" {
		t.Errorf("examplelessProblems = %q", p)
	}
}

// The recorded status is the real one: a create the analysis described as 200
// becomes 201 with its body, and a status beside several declared ones is added.
func TestRecordedResponseStatus(t *testing.T) {
	body := schema{"application/json": schema{"schema": schema{"type": "object"}}}
	one := map[string]any{"200": schema{"description": "OK", "content": body}, "4XX": schema{}}
	recordedResponse(one, recordedExample{status: 201, response: map[string]any{"id": "x"}})
	if _, ok := one["200"]; ok {
		t.Fatalf("200 kept: %v", one)
	}
	if got := jsonMedia(one["201"].(schema))["example"]; got == nil {
		t.Fatalf("201 has no example: %v", one)
	}
	two := map[string]any{"200": schema{"description": "OK", "content": body}, "202": schema{"description": "Accepted"}}
	recordedResponse(two, recordedExample{status: 201, response: map[string]any{"id": "x"}})
	if _, ok := two["200"]; !ok || two["201"] == nil || two["202"] == nil {
		t.Fatalf("statuses = %v", sortedKeys(two))
	}
}
