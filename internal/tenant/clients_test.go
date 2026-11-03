package tenant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Older clients keep working within the major version (OpenSpec change
// `stability-contract`, design D5; docs/stability.md "Clients across
// versions"). internal/sync/testdata/v1_clients/ holds the calls the 1.x
// clients made, recorded by web/src/test/recorder.ts. Each file is replayed
// in order against a fresh current server; every response must have the
// recorded status and every recorded field with the same JSON type. Fields
// the server added since are fine.

const clientRecordings = "../sync/testdata/v1_clients"

// replayPassword stands in for every recorded "<password>".
const replayPassword = "replayed client password"

type recordedPair struct {
	Request struct {
		Method  string            `json:"method"`
		Path    string            `json:"path"`
		Auth    string            `json:"auth"`
		Headers map[string]string `json:"headers"`
		Body    any               `json:"body"`
	} `json:"request"`
	Response struct {
		Status  int    `json:"status"`
		Session string `json:"session"`
		Body    any    `json:"body"`
	} `json:"response"`
}

func TestV1ClientsReplay(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(clientRecordings, "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no client recordings under %s", clientRecordings)
	}
	for _, f := range files {
		t.Run(strings.TrimSuffix(filepath.Base(f), ".json"), func(t *testing.T) { replayClient(t, f) })
	}
}

// replayer is one replay's state: the sessions and tokens it was given for
// the recorded labels, and the ids the server chose for the recorded ones.
type replayer struct {
	t        *testing.T
	base     string
	sessions map[string]string
	tokens   map[string]string
	ids      map[string]string
}

func replayClient(t *testing.T, file string) {
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Pairs []recordedPair `json:"pairs"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	cfg := testConfig(t.TempDir())
	cfg.AllowSignup = true
	tn, err := Open(context.Background(), cfg, Options{Version: "test", Web: http.NotFoundHandler(), Log: slog.New(slog.DiscardHandler)})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	srv := httptest.NewServer(tn.Handler)
	defer srv.Close()
	r := &replayer{t: t, base: srv.URL, sessions: map[string]string{}, tokens: map[string]string{}, ids: map[string]string{}}
	for i, p := range doc.Pairs {
		if errorCode(p.Response.Body) == "clock_skew" {
			continue // depends on the wall clock at recording time
		}
		where := fmt.Sprintf("%s pair %d (%s %s)", filepath.Base(file), i, p.Request.Method, p.Request.Path)
		status, body := r.send(p)
		r.learn(p.Response.Body, body)
		if status != p.Response.Status {
			t.Errorf("%s: status %d, recorded %d (%v)", where, status, p.Response.Status, body)
			continue
		}
		for _, problem := range shapeProblems(p.Response.Body, body) {
			t.Errorf("%s: %s", where, problem)
		}
	}
}

// send replays one request with the replay's own credentials and ids.
func (r *replayer) send(p recordedPair) (int, any) {
	r.t.Helper()
	var rd io.Reader
	if p.Request.Body != nil {
		raw, _ := json.Marshal(r.substitute(p.Request.Body))
		rd = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(p.Request.Method, r.base+r.substitutePath(p.Request.Path), rd)
	for k, v := range p.Request.Headers {
		req.Header.Set(k, v)
	}
	switch kind, _, _ := strings.Cut(p.Request.Auth, ":"); kind {
	case "session":
		req.Header.Set("Cookie", "opentodo_session="+r.sessions[p.Request.Auth])
	case "token":
		req.Header.Set("Authorization", "Bearer "+r.tokens[p.Request.Auth])
	}
	if p.Request.Method != http.MethodGet {
		req.Header.Set("Origin", r.base)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		r.t.Fatal(err)
	}
	defer resp.Body.Close()
	if p.Response.Session != "" {
		for _, c := range resp.Cookies() {
			if c.Name == "opentodo_session" {
				r.sessions[p.Response.Session] = c.Value
			}
		}
	}
	raw, _ := io.ReadAll(resp.Body)
	var body any
	if len(raw) > 0 && json.Unmarshal(raw, &body) != nil {
		body = fmt.Sprintf("<%d bytes>", len(raw))
	}
	return resp.StatusCode, body
}

var (
	idPattern    = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	tokenLabel   = regexp.MustCompile(`^<(token:\d+)>$`)
	wholeIDValue = regexp.MustCompile(`^` + idPattern.String() + `$`)
)

func (r *replayer) substitutePath(p string) string {
	return idPattern.ReplaceAllStringFunc(p, func(id string) string {
		if live, ok := r.ids[id]; ok {
			return live
		}
		return id
	})
}

// substitute is a recorded request body with the replay's password, tokens
// and ids.
func (r *replayer) substitute(v any) any {
	switch v := v.(type) {
	case string:
		if v == "<password>" {
			return replayPassword
		}
		if m := tokenLabel.FindStringSubmatch(v); m != nil {
			return r.tokens[m[1]]
		}
		return r.substitutePath(v)
	case []any:
		out := make([]any, len(v))
		for i, x := range v {
			out[i] = r.substitute(x)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, x := range v {
			out[r.substitutePath(k)] = r.substitute(x)
		}
		return out
	}
	return v
}

// learn walks a recorded response and the live one side by side: a recorded
// token label gets the live secret, a recorded id the live id.
func (r *replayer) learn(rec, live any) {
	switch rec := rec.(type) {
	case string:
		l, ok := live.(string)
		if !ok {
			return
		}
		if m := tokenLabel.FindStringSubmatch(rec); m != nil {
			r.tokens[m[1]] = l
		} else if wholeIDValue.MatchString(rec) && wholeIDValue.MatchString(l) && rec != l {
			if _, known := r.ids[rec]; !known {
				r.ids[rec] = l
			}
		}
	case []any:
		if l, ok := live.([]any); ok {
			for i := 0; i < len(rec) && i < len(l); i++ {
				r.learn(rec[i], l[i])
			}
		}
	case map[string]any:
		if l, ok := live.(map[string]any); ok {
			for k, x := range rec {
				r.learn(x, l[k])
			}
		}
	}
}

// shapeProblems lists the recorded fields the live response lacks or has with
// another JSON type. Lists compare the union of their elements' fields;
// object keys that are ids compare as one key.
func shapeProblems(rec, live any) []string {
	want, got := map[string]map[string]bool{}, map[string]map[string]bool{}
	shapeOf(rec, "", want)
	shapeOf(live, "", got)
	var out []string
	for path, types := range want {
		for typ := range types {
			if typ == "null" {
				continue
			}
			switch {
			case got[path] == nil:
				out = append(out, fmt.Sprintf("field %q is missing (recorded as %s)", path, typ))
			case !got[path][typ] && !(got[path]["null"] && len(got[path]) == 1):
				out = append(out, fmt.Sprintf("field %q is %s, recorded as %s", path, keys(got[path]), typ))
			}
		}
	}
	sort.Strings(out)
	return out
}

func shapeOf(v any, path string, out map[string]map[string]bool) {
	add := func(typ string) {
		if out[path] == nil {
			out[path] = map[string]bool{}
		}
		out[path][typ] = true
	}
	switch v := v.(type) {
	case nil:
		add("null")
	case string:
		add("string")
	case float64:
		add("number")
	case bool:
		add("boolean")
	case []any:
		add("array")
		for _, x := range v {
			shapeOf(x, path+"[]", out)
		}
	case map[string]any:
		add("object")
		for k, x := range v {
			if wholeIDValue.MatchString(k) {
				k = "{id}"
			}
			shapeOf(x, path+"."+k, out)
		}
	}
}

func keys(m map[string]bool) string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return strings.Join(out, "|")
}

func errorCode(body any) string {
	m, _ := body.(map[string]any)
	e, _ := m["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

// TestShapeProblems: a removed field and a changed type are reported; an
// added field and a list's extra elements are not.
func TestShapeProblems(t *testing.T) {
	var rec, live any
	_ = json.Unmarshal([]byte(`{"cursor":5,"ops":[{"id":"a","seq":1}],"user":{"name":"x"},"gone":null}`), &rec)
	_ = json.Unmarshal([]byte(`{"ops":[{"id":"b","seq":"2","extra":true},{"id":"c","seq":3}],"user":{"name":"y","new":1}}`), &live)
	got := strings.Join(shapeProblems(rec, live), "\n")
	want := `field ".cursor" is missing (recorded as number)`
	if !strings.Contains(got, want) || strings.Contains(got, "gone") || strings.Contains(got, ".ops[].seq") || strings.Contains(got, "new") {
		t.Fatalf("problems:\n%s", got)
	}
	_ = json.Unmarshal([]byte(`{"ops":[{"seq":"2"}]}`), &live)
	if got := shapeProblems(map[string]any{"ops": []any{map[string]any{"seq": 1.0}}}, live); len(got) != 1 || !strings.Contains(got[0], `".ops[].seq" is string, recorded as number`) {
		t.Fatalf("type change: %v", got)
	}
}
