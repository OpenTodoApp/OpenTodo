package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// postRaw sends body as is and returns the status and error envelope.
func (e *env) postRaw(path, body string) (int, map[string]string) {
	e.t.Helper()
	req, _ := http.NewRequest("POST", e.srv.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out struct {
		Error map[string]string `json:"error"`
	}
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out.Error
}

// TestJSONBodyStrict (SEC-14): request bodies refuse unknown fields and data
// after the value, answer 413 over the size limit, and never echo the Go
// decoder's messages.
func TestJSONBodyStrict(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	other := newClientAt(e, "192.0.2.9")
	cases := []struct {
		name, body string
		status     int
		code, msg  string
	}{
		{"unknown field", `{"email":"o@example.com","password":"correct horse battery","remember":true}`, 400, "bad_request", `invalid JSON body: unknown field "remember"`},
		{"trailing value", `{"email":"o@example.com","password":"correct horse battery"} {"x":1}`, 400, "bad_request", "invalid JSON body: unexpected data after the JSON value"},
		{"trailing garbage", `{"email":"o@example.com","password":"correct horse battery"}x`, 400, "bad_request", "invalid JSON body: unexpected data after the JSON value"},
		{"wrong type", `{"email":5,"password":"correct horse battery"}`, 400, "bad_request", "invalid JSON body: email must be a string"},
		{"syntax", `{"email":`, 400, "bad_request", "invalid JSON body"},
		{"too large", `{"email":"` + strings.Repeat("a", 5<<20) + `"}`, 413, "too_large", "the request body is too large"},
	}
	for _, tc := range cases {
		status, envelope := other.postRaw("/api/v1/auth/login", tc.body)
		if status != tc.status || envelope["code"] != tc.code || envelope["message"] != tc.msg {
			t.Errorf("%s: %d %v, want %d %s %q", tc.name, status, envelope, tc.status, tc.code, tc.msg)
		}
		if strings.Contains(envelope["message"], "json:") || strings.Contains(envelope["message"], "Go ") {
			t.Errorf("%s: decoder text leaked: %q", tc.name, envelope["message"])
		}
	}
	// Trailing white space is fine.
	if status, envelope := other.postRaw("/api/v1/auth/login", "{\"email\":\"o@example.com\",\"password\":\"correct horse battery\"}\n  \n"); status != 200 {
		t.Fatalf("trailing white space: %d %v", status, envelope)
	}
}

// TestJSONBodyLooseRoutes (SEC-14): the sync exchange accepts op properties
// this server does not know, so newer clients keep syncing.
func TestJSONBodyLooseRoutes(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	body, _ := json.Marshal(map[string]any{"device": "d1", "cursor": 0, "future": true, "ops": []any{
		map[string]any{"id": "op1", "entity": "task", "entityId": "t1", "field": "title", "value": "x", "ts": 1, "device": "d1", "newProperty": 1},
	}})
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("sync with unknown fields: %d", resp.StatusCode)
	}
}
