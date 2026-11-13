package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/importer"
)

// POST /api/v1/import/todoist fetches the account's Todoist data with the
// pasted token and answers it for the import screen (todoist-api-import); a
// refused token is invalid_token, and read and agent tokens are refused.
func TestImportTodoistFetch(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"projects":[{"id":"p1","name":"Work"}],"sections":[],"items":[{"id":"i1","content":"Write","project_id":"p1"}],"notes":[]}`))
	}))
	defer fake.Close()
	oldBase, oldClient := importer.TodoistAPIBase, todoistClient
	importer.TodoistAPIBase, todoistClient = fake.URL, fake.Client
	defer func() { importer.TodoistAPIBase, todoistClient = oldBase, oldClient }()

	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/import/todoist", map[string]string{"token": "tok"})
	if resp.StatusCode != 200 {
		t.Fatalf("fetch = %d %v", resp.StatusCode, out)
	}
	if items, _ := out["items"].([]any); len(items) != 1 {
		t.Fatalf("answer = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/import/todoist", map[string]string{"token": "wrong"})
	if resp.StatusCode != 400 || errCode(out) != "invalid_token" {
		t.Fatalf("wrong token = %d %v", resp.StatusCode, out)
	}
	read := e.token("read")
	resp, out = e.bearerClient().do("POST", "/api/v1/import/todoist", map[string]string{"token": "tok"}, bearer(read)...)
	if resp.StatusCode != 403 || !strings.Contains(errCode(out), "scope") {
		t.Fatalf("read token = %d %v", resp.StatusCode, out)
	}
}
