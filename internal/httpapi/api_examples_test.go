package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The examples of docs/api.md marked <!-- run --> are executed, in order,
// against a test server (OpenSpec change docs-1-0, documentation "API error
// codes and examples are checked"). An example is an ```http block (request
// line, headers, a blank line and an optional JSON body) followed by a ```json
// block whose first line is "// <status>". The test compares the status, the
// documented top-level keys and, for an error, its code; values may differ.
// $TOKEN, <project-id> and <task-id> name the seeded owner's full token, project
// and task.

type apiExample struct {
	line    int // of the request line in docs/api.md
	method  string
	path    string
	headers [][2]string
	body    string
	status  int
	keys    []string
	code    string // the documented error code, if any
}

var exampleStatus = regexp.MustCompile(`^//\s*(\d{3})\s*$`)

// parseExamples reads the run-marked examples of a Markdown document.
func parseExamples(doc string) ([]apiExample, error) {
	lines := strings.Split(doc, "\n")
	var out []apiExample
	for i := 0; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) != "<!-- run -->" {
			continue
		}
		mark := i + 1
		fence := func(lang string) ([]string, int, error) {
			j := i + 1
			for j < len(lines) && strings.TrimSpace(lines[j]) == "" {
				j++
			}
			if j >= len(lines) || strings.TrimSpace(lines[j]) != "```"+lang {
				return nil, 0, fmt.Errorf("docs/api.md:%d: a run-marked example needs a ```%s block here", j+1, lang)
			}
			start := j + 1
			for j = start; j < len(lines) && strings.TrimSpace(lines[j]) != "```"; j++ {
			}
			if j >= len(lines) {
				return nil, 0, fmt.Errorf("docs/api.md:%d: unterminated ```%s block", start, lang)
			}
			return lines[start:j], start, nil
		}
		req, reqLine, err := fence("http")
		if err != nil {
			return nil, err
		}
		i = reqLine + len(req)
		resp, respLine, err := fence("json")
		if err != nil {
			return nil, err
		}
		i = respLine + len(resp)
		ex := apiExample{line: reqLine + 1}
		if len(req) == 0 {
			return nil, fmt.Errorf("docs/api.md:%d: empty request", mark)
		}
		parts := strings.Fields(req[0])
		if len(parts) != 2 {
			return nil, fmt.Errorf("docs/api.md:%d: the request line is METHOD /path", ex.line)
		}
		ex.method, ex.path = parts[0], parts[1]
		k := 1
		for ; k < len(req) && strings.TrimSpace(req[k]) != ""; k++ {
			name, value, ok := strings.Cut(req[k], ":")
			if !ok {
				return nil, fmt.Errorf("docs/api.md:%d: header %q has no colon", reqLine+k+1, req[k])
			}
			ex.headers = append(ex.headers, [2]string{strings.TrimSpace(name), strings.TrimSpace(value)})
		}
		ex.body = strings.TrimSpace(strings.Join(req[min(k, len(req)):], "\n"))
		if len(resp) == 0 || !exampleStatus.MatchString(resp[0]) {
			return nil, fmt.Errorf("docs/api.md:%d: the response block starts with // <status>", respLine+1)
		}
		ex.status, _ = strconv.Atoi(exampleStatus.FindStringSubmatch(resp[0])[1])
		if rest := strings.TrimSpace(strings.Join(resp[1:], "\n")); rest != "" {
			var doc map[string]any
			if err := json.Unmarshal([]byte(rest), &doc); err != nil {
				return nil, fmt.Errorf("docs/api.md:%d: the documented response is not a JSON object: %v", respLine+2, err)
			}
			for key := range doc {
				ex.keys = append(ex.keys, key)
			}
			sort.Strings(ex.keys)
			if e, ok := doc["error"].(map[string]any); ok {
				ex.code, _ = e["code"].(string)
			}
		}
		out = append(out, ex)
	}
	return out, nil
}

// checkExample compares a response with its example; empty when they agree.
func checkExample(ex apiExample, status int, body []byte) string {
	where := fmt.Sprintf("docs/api.md:%d: %s %s", ex.line, ex.method, ex.path)
	if status != ex.status {
		return fmt.Sprintf("%s: documented %d, the server answered %d (%s)", where, ex.status, status, bytes.TrimSpace(body))
	}
	if len(ex.keys) == 0 {
		return ""
	}
	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		return fmt.Sprintf("%s: the answer is not a JSON object: %s", where, bytes.TrimSpace(body))
	}
	var missing []string
	for _, k := range ex.keys {
		if _, ok := got[k]; !ok {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		return fmt.Sprintf("%s: the answer has no %s", where, strings.Join(missing, ", "))
	}
	if ex.code != "" {
		if e, _ := got["error"].(map[string]any); e == nil || e["code"] != ex.code {
			return fmt.Sprintf("%s: documented error %q, the server answered %v", where, ex.code, got["error"])
		}
	}
	return ""
}

func TestAPIExamples(t *testing.T) {
	raw, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	examples, err := parseExamples(string(raw))
	if err != nil {
		t.Fatal(err)
	}

	// Every route group has one executed example, and so do a 401 and a 400.
	groups := map[string]bool{"/api/v1/tasks": false, "/api/v1/projects": false, "/api/v1/sync": false,
		"/api/v1/import": false, "/api/v1/tokens": false, "/api/v1/settings": false}
	statuses := map[int]bool{}
	for _, ex := range examples {
		for g := range groups {
			if ex.path == g || strings.HasPrefix(ex.path, g+"/") || strings.HasPrefix(ex.path, g+"?") {
				groups[g] = true
			}
		}
		statuses[ex.status] = true
	}
	for g, ok := range groups {
		if !ok {
			t.Errorf("docs/api.md has no run-marked example for %s", g)
		}
	}
	for _, s := range []int{http.StatusUnauthorized, http.StatusBadRequest} {
		if !statuses[s] {
			t.Errorf("docs/api.md has no run-marked example answering %d", s)
		}
	}

	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "docs"})
	e.mustStatus(resp, 201, out)
	token, _ := out["secret"].(string)
	bearer := []string{"Authorization", "Bearer " + token}
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Groceries"}, bearer...)
	e.mustStatus(resp, 201, out)
	project, _ := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk", "project_id": project}, bearer...)
	e.mustStatus(resp, 201, out)
	task, _ := out["id"].(string)
	fill := strings.NewReplacer("$TOKEN", token, "<project-id>", project, "<task-id>", task).Replace

	client := &http.Client{} // no cookie jar: only the documented headers authenticate
	for _, ex := range examples {
		req, err := http.NewRequest(ex.method, e.srv.URL+fill(ex.path), strings.NewReader(fill(ex.body)))
		if err != nil {
			t.Fatalf("docs/api.md:%d: %v", ex.line, err)
		}
		for _, h := range ex.headers {
			req.Header.Set(h[0], fill(h[1]))
		}
		res, err := client.Do(req)
		if err != nil {
			t.Fatalf("docs/api.md:%d: %v", ex.line, err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		e.server.background.Wait()
		t.Logf("docs/api.md:%d: %s %s → %d %s", ex.line, ex.method, ex.path, res.StatusCode, bytes.TrimSpace(body))
		if p := checkExample(ex, res.StatusCode, body); p != "" {
			t.Error(p)
		}
	}
}

func TestAPIExamplesReportDrift(t *testing.T) {
	doc := "intro\n\n<!-- run -->\n```http\nPOST /api/v1/tasks\nAuthorization: Bearer $TOKEN\n\n{\"title\": \"x\"}\n```\n\n```json\n// 201\n{\"id\": \"…\", \"title\": \"x\"}\n```\n"
	examples, err := parseExamples(doc)
	if err != nil || len(examples) != 1 {
		t.Fatalf("parse: %v %v", examples, err)
	}
	ex := examples[0]
	if ex.line != 5 || ex.method != "POST" || ex.body != `{"title": "x"}` || !slices.Equal(ex.keys, []string{"id", "title"}) {
		t.Fatalf("parsed %+v", ex)
	}
	if p := checkExample(ex, 200, []byte(`{"id":"a","title":"x"}`)); !strings.Contains(p, "docs/api.md:5: POST /api/v1/tasks: documented 201, the server answered 200") {
		t.Fatalf("a wrong status: %q", p)
	}
	if p := checkExample(ex, 201, []byte(`{"id":"a"}`)); !strings.Contains(p, "the answer has no title") {
		t.Fatalf("a missing key: %q", p)
	}
	if p := checkExample(ex, 201, []byte(`{"id":"a","title":"x","extra":1}`)); p != "" {
		t.Fatalf("extra keys are fine: %q", p)
	}
	if _, err := parseExamples("<!-- run -->\n```http\nGET /x\n```\n\n```json\n{}\n```\n"); err == nil {
		t.Fatal("a response block without a status must fail")
	}
}
