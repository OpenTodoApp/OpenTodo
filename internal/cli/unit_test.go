package cli

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// ---- 1. foundation ----

// recorder is a fake API that records which server was hit.
func recorder(t *testing.T, status int, body string) (*httptest.Server, *int) {
	t.Helper()
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.Header.Get("Authorization") == "" {
			t.Errorf("request without bearer token: %s", r.URL)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

func TestConfigPrecedence(t *testing.T) {
	serverA, hitsA := recorder(t, 200, `{"projects":[],"tasks":[]}`)
	serverB, hitsB := recorder(t, 200, `{"projects":[],"tasks":[]}`)
	serverC, hitsC := recorder(t, 200, `{"projects":[],"tasks":[]}`)

	path := filepath.Join(t.TempDir(), "config.json")
	cfg := &Config{Default: "home", Profiles: map[string]Profile{
		"home": {URL: serverA.URL, Token: "ot_a"},
		"work": {URL: serverC.URL, Token: "ot_c"},
	}}
	if err := saveConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	h := &harness{t: t, configPath: path, env: map[string]string{}}

	// Profile from the file.
	h.mustRun("list")
	if *hitsA == 0 || *hitsB != 0 {
		t.Fatalf("profile: A=%d B=%d", *hitsA, *hitsB)
	}
	// --profile selects another one.
	h.mustRun("list", "--profile", "work")
	if *hitsC == 0 {
		t.Fatal("--profile ignored")
	}
	*hitsA, *hitsC = 0, 0
	// OPENTODO_PROFILE too.
	h.env["OPENTODO_PROFILE"] = "work"
	h.mustRun("list")
	if *hitsC == 0 || *hitsA != 0 {
		t.Fatal("OPENTODO_PROFILE ignored")
	}
	delete(h.env, "OPENTODO_PROFILE")
	*hitsA, *hitsC = 0, 0

	// Environment beats the file.
	h.env["OPENTODO_URL"], h.env["OPENTODO_TOKEN"] = serverB.URL, "ot_b"
	h.mustRun("list")
	if *hitsB == 0 || *hitsA != 0 {
		t.Fatalf("env: A=%d B=%d", *hitsA, *hitsB)
	}
	*hitsB = 0
	// --server beats the environment.
	h.mustRun("list", "--server", serverC.URL)
	if *hitsC == 0 || *hitsB != 0 {
		t.Fatalf("flag: B=%d C=%d", *hitsB, *hitsC)
	}

	// Unknown profile with nothing in the environment: exit 2 with instructions.
	h.env = map[string]string{}
	code, _, errb := h.run("list", "--profile", "nope")
	if code != ExitUsage || !strings.Contains(errb, "ot login") {
		t.Fatalf("unknown profile: %d %q", code, errb)
	}
	// URL without a token is a usage error that names the fix.
	h.env["OPENTODO_URL"] = serverB.URL
	h.configPath = filepath.Join(t.TempDir(), "none.json")
	if code, _, errb = h.run("list"); code != ExitUsage || !strings.Contains(errb, "OPENTODO_TOKEN") {
		t.Fatalf("url without token: %d %q", code, errb)
	}
	// A corrupt config file is a configuration error.
	bad := filepath.Join(t.TempDir(), "bad.json")
	os.WriteFile(bad, []byte("{nope"), 0o600)
	h.configPath = bad
	if code, _, _ = h.run("list"); code != ExitAuth {
		t.Fatalf("corrupt config: exit %d", code)
	}
}

func TestConfigFileMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions")
	}
	h := newHarness(t)
	h.login()
	fi, err := os.Stat(h.configPath)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("file mode = %o, want 600", fi.Mode().Perm())
	}
	di, err := os.Stat(filepath.Dir(h.configPath))
	if err != nil {
		t.Fatal(err)
	}
	if di.Mode().Perm() != 0o700 {
		t.Fatalf("dir mode = %o, want 700", di.Mode().Perm())
	}
	// Rewriting keeps the mode and never leaves a temp file behind.
	h.mustRun("auth", "logout")
	fi, _ = os.Stat(h.configPath)
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("file mode after rewrite = %o", fi.Mode().Perm())
	}
	if _, err := os.Stat(h.configPath + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("temp file left behind")
	}
	raw, _ := os.ReadFile(h.configPath)
	if bytes.Contains(raw, []byte("ot_")) {
		t.Fatal("token still in file after logout")
	}
}

func TestExitCodes(t *testing.T) {
	envelope := `{"error":{"code":"invalid_input","message":"task.priority must be an integer from 1 (highest) to 4 (lowest)"}}`
	bad, _ := recorder(t, 400, envelope)
	unauth, _ := recorder(t, 401, `{"error":{"code":"unauthorized","message":"authentication required"}}`)
	notAPI, _ := recorder(t, 502, `<html>bad gateway</html>`)

	// A port nobody listens on.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closedURL := "http://" + l.Addr().String()
	l.Close()

	h := &harness{t: t, configPath: filepath.Join(t.TempDir(), "config.json"), env: map[string]string{"OPENTODO_TOKEN": "ot_x"}}
	cases := []struct {
		url  string
		code int
		msg  string
	}{
		{bad.URL, ExitServer, "task.priority must be"},
		{unauth.URL, ExitAuth, "ot login"},
		{notAPI.URL, ExitServer, "HTTP 502"},
		{closedURL, ExitUnreachable, "cannot reach " + closedURL},
	}
	for _, c := range cases {
		h.env["OPENTODO_URL"] = c.url
		code, out, errb := h.run("list")
		if code != c.code || !strings.Contains(errb, c.msg) || out != "" {
			t.Errorf("%s: exit %d (want %d) stdout %q stderr %q", c.url, code, c.code, out, errb)
		}
	}

	// --json prints the server envelope untouched, on stdout only.
	h.env["OPENTODO_URL"] = bad.URL
	code, out, errb := h.run("list", "--json")
	if code != ExitServer || strings.TrimSpace(out) != envelope || errb != "" {
		t.Fatalf("json envelope: exit %d stdout %q stderr %q", code, out, errb)
	}
	// Local and connectivity errors get a synthesised envelope.
	h.env["OPENTODO_URL"] = closedURL
	code, out, _ = h.run("list", "--json")
	var env struct {
		Error struct{ Code, Message string } `json:"error"`
	}
	if code != ExitUnreachable || json.Unmarshal([]byte(out), &env) != nil || env.Error.Code != "unreachable" || !strings.Contains(env.Error.Message, closedURL) {
		t.Fatalf("unreachable --json = %d %q", code, out)
	}
}

func TestHelpListsEveryCommand(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	code, out, _ := h.run("--help")
	if code != 0 {
		t.Fatalf("--help exit %d", code)
	}
	for _, c := range commands {
		if !strings.Contains(out, "\n  "+c.name+" ") {
			t.Errorf("help does not list %q", c.name)
		}
	}
	for _, args := range [][]string{{"help"}, {"-h"}} {
		if code, out2, _ := h.run(args...); code != 0 || out2 != out {
			t.Errorf("ot %v differs from --help (exit %d)", args, code)
		}
	}
	if code, out, _ = h.run("help", "add"); code != 0 || !strings.Contains(out, "ot add <title>") {
		t.Fatalf("help add: %d %q", code, out)
	}
	if code, out, _ = h.run("add", "--help"); code != 0 || !strings.Contains(out, "ot add <title>") {
		t.Fatalf("add --help: %d %q", code, out)
	}
	if code, _, errb := h.run(); code != ExitUsage || !strings.Contains(errb, "no command") {
		t.Fatalf("no args: %d %q", code, errb)
	}
	if code, out, _ = h.run("version"); code != 0 || !strings.HasPrefix(out, "ot ") {
		t.Fatalf("version: %d %q", code, out)
	}
}

// ---- 3.2 dates ----

func TestDueWords(t *testing.T) {
	sat := time.Date(2026, 10, 10, 23, 30, 0, 0, time.Local) // Saturday, late evening
	cases := map[string]string{
		"today":      "2026-10-10",
		"Tomorrow":   "2026-10-11",
		"sunday":     "2026-10-11",
		"mon":        "2026-10-12",
		"Friday":     "2026-10-16",
		"saturday":   "2026-10-17", // same weekday rolls over to next week
		"2026-12-24": "2026-12-24",
	}
	for in, want := range cases {
		got, err := resolveDate(in, sat)
		if err != nil || got != want {
			t.Errorf("resolveDate(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, in := range []string{"", "someday", "2026-02-30", "2026-1-5", "10/12/2026", "next week"} {
		if _, err := resolveDate(in, sat); err == nil {
			t.Errorf("resolveDate(%q) accepted", in)
		}
	}
	// A weekday computed at the end of the day in a different zone still uses the local calendar.
	tokyo := time.FixedZone("Tokyo", 9*3600)
	if got, _ := resolveDate("tomorrow", time.Date(2026, 10, 10, 0, 30, 0, 0, tokyo)); got != "2026-10-11" {
		t.Errorf("tomorrow in Tokyo = %q", got)
	}
	for _, ok := range []string{"00:00", "09:05", "23:59"} {
		if err := validClock(ok); err != nil {
			t.Errorf("validClock(%q) = %v", ok, err)
		}
	}
	for _, bad := range []string{"24:00", "9:00", "09:60", "0900", "ab:cd", "9am"} {
		if err := validClock(bad); err == nil {
			t.Errorf("validClock(%q) accepted", bad)
		}
	}
}

func TestNormalizeURL(t *testing.T) {
	cases := map[string]string{
		"todo.example.com":             "https://todo.example.com",
		"http://localhost:8080/":       "http://localhost:8080",
		"https://x.test/api/v1":        "https://x.test",
		"https://x.test/sub/path/":     "https://x.test/sub/path",
		"http://127.0.0.1:8080?x=1#f":  "http://127.0.0.1:8080",
		"HTTPS://Todo.Example.com:443": "https://Todo.Example.com:443",
	}
	for in, want := range cases {
		got, err := normalizeURL(in)
		if err != nil || got != want {
			t.Errorf("normalizeURL(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "ftp://x", "http://"} {
		if _, err := normalizeURL(bad); err == nil {
			t.Errorf("normalizeURL(%q) accepted", bad)
		}
	}
}

func TestTableRendering(t *testing.T) {
	tbl := newTable("ID", "TITLE")
	tbl.add(plain("a"), plain("one"))
	tbl.add(cell{text: "bb", style: styleRed}, plain("two"))
	var buf bytes.Buffer
	tbl.render(&buf, false)
	if buf.String() != "ID  TITLE\na   one\nbb  two\n" {
		t.Fatalf("plain table:\n%q", buf.String())
	}
	buf.Reset()
	tbl.render(&buf, true)
	if !strings.Contains(buf.String(), styleRed+"bb"+reset) {
		t.Fatalf("coloured table:\n%q", buf.String())
	}
}
