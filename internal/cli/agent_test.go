package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/pixari/opentodo/skills"
)

// Tests of the agent-ready CLI contract (OpenSpec change `agent-ready-cli`).

var updateGolden = flag.Bool("update", false, "rewrite golden files")

// ---- a minimal JSON Schema validator for the embedded schemas ----

func loadSchemas(t *testing.T) map[string]any {
	t.Helper()
	out := map[string]any{}
	for name, raw := range outputSchemas() {
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			t.Fatalf("schema %s: %v", name, err)
		}
		out[name] = v
	}
	return out
}

// validate checks v against schema s (the subset the embedded schemas use:
// $ref to #/schemas/<name>, type, enum, const, properties, required, items,
// allOf, oneOf, minimum, maximum).
func validate(schemas map[string]any, s any, v any, at string) error {
	m, ok := s.(map[string]any)
	if !ok {
		return nil
	}
	if r, ok := m["$ref"].(string); ok {
		name := strings.TrimPrefix(r, "#/schemas/")
		target, ok := schemas[name]
		if !ok {
			return fmt.Errorf("%s: unknown $ref %s", at, r)
		}
		return validate(schemas, target, v, at)
	}
	if all, ok := m["allOf"].([]any); ok {
		for _, sub := range all {
			if err := validate(schemas, sub, v, at); err != nil {
				return err
			}
		}
	}
	if anyOf, ok := m["anyOf"].([]any); ok {
		n := 0
		var last error
		for _, sub := range anyOf {
			if err := validate(schemas, sub, v, at); err == nil {
				n++
			} else {
				last = err
			}
		}
		if n == 0 {
			return fmt.Errorf("%s: matches none of anyOf (%v)", at, last)
		}
	}
	if one, ok := m["oneOf"].([]any); ok {
		n := 0
		var last error
		for _, sub := range one {
			if err := validate(schemas, sub, v, at); err == nil {
				n++
			} else {
				last = err
			}
		}
		if n != 1 {
			return fmt.Errorf("%s: matches %d of oneOf (%v)", at, n, last)
		}
	}
	if c, ok := m["const"]; ok && fmt.Sprint(c) != fmt.Sprint(v) {
		return fmt.Errorf("%s: want const %v, got %v", at, c, v)
	}
	if enum, ok := m["enum"].([]any); ok {
		found := false
		for _, e := range enum {
			found = found || fmt.Sprint(e) == fmt.Sprint(v)
		}
		if !found {
			return fmt.Errorf("%s: %v not in %v", at, v, enum)
		}
	}
	if ty, ok := m["type"]; ok {
		var types []string
		switch x := ty.(type) {
		case string:
			types = []string{x}
		case []any:
			for _, e := range x {
				types = append(types, e.(string))
			}
		}
		match := false
		for _, typ := range types {
			match = match || hasType(typ, v)
		}
		if !match {
			return fmt.Errorf("%s: want type %v, got %T (%v)", at, types, v, v)
		}
	}
	if f, ok := v.(float64); ok {
		if min, ok := m["minimum"].(float64); ok && f < min {
			return fmt.Errorf("%s: %v < %v", at, f, min)
		}
		if max, ok := m["maximum"].(float64); ok && f > max {
			return fmt.Errorf("%s: %v > %v", at, f, max)
		}
	}
	if obj, ok := v.(map[string]any); ok {
		if req, ok := m["required"].([]any); ok {
			for _, r := range req {
				if _, ok := obj[r.(string)]; !ok {
					return fmt.Errorf("%s: missing %s", at, r)
				}
			}
		}
		if props, ok := m["properties"].(map[string]any); ok {
			for k, sub := range props {
				if val, ok := obj[k]; ok {
					if err := validate(schemas, sub, val, at+"."+k); err != nil {
						return err
					}
				}
			}
		}
	}
	if arr, ok := v.([]any); ok {
		if items, ok := m["items"]; ok {
			for i, e := range arr {
				if err := validate(schemas, items, e, fmt.Sprintf("%s[%d]", at, i)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func hasType(typ string, v any) bool {
	switch typ {
	case "null":
		return v == nil
	case "object":
		_, ok := v.(map[string]any)
		return ok
	case "array":
		_, ok := v.([]any)
		return ok
	case "string":
		_, ok := v.(string)
		return ok
	case "boolean":
		_, ok := v.(bool)
		return ok
	case "number":
		_, ok := v.(float64)
		return ok
	case "integer":
		f, ok := v.(float64)
		return ok && f == math.Trunc(f)
	}
	return false
}

// mustMatch validates one command's stdout against its declared output schema.
func mustMatch(t *testing.T, schemas map[string]any, command, out string, schema any) {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("%s: stdout is not one JSON document: %v\n%s", command, err, out)
	}
	if strings.Count(strings.TrimSpace(out), "\n") != 0 {
		t.Fatalf("%s: more than one line of JSON:\n%s", command, out)
	}
	if err := validate(schemas, schema, v, command); err != nil {
		t.Fatalf("%s: output does not match its schema: %v\n%s", command, err, out)
	}
}

func specOutput(t *testing.T, name string) any {
	t.Helper()
	sp := findSpec(name)
	if sp == nil {
		t.Fatalf("no spec %q", name)
	}
	return sp.Output
}

// ---- 2.1 schemas ----

func TestOutputsMatchSchemas(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	schemas := loadSchemas(t)
	for _, want := range []string{"task", "project", "label", "comment", "token", "task_result", "error", "dry_run"} {
		if schemas[want] == nil {
			t.Fatalf("schema %s missing", want)
		}
	}
	check := func(spec string, args ...string) string {
		t.Helper()
		out := h.mustRun(append(args, "--json")...)
		mustMatch(t, schemas, spec, out, specOutput(t, spec))
		return out
	}
	check("list", "list", "--all")
	check("today", "today")
	check("inbox", "inbox")
	check("upcoming", "upcoming")
	var added map[string]any
	_ = json.Unmarshal([]byte(check("add", "add", "Schema task", "--due", "tomorrow", "--time", "09:30", "--priority", "2", "--label", "errand", "--note", "x")), &added)
	id := added["id"].(string)
	check("edit", "edit", id, "--title", "Schema task 2")
	check("done", "done", id)
	check("done", "done", "rent", "plum")
	check("reopen", "reopen", id)
	check("rm", "rm", id, "--yes")
	check("project list", "project", "list", "--all")
	var proj map[string]any
	_ = json.Unmarshal([]byte(check("project add", "project", "add", "Garden")), &proj)
	check("project rename", "project", "rename", "Garden", "Garden 2")
	check("project archive", "project", "archive", "Garden 2")
	check("project rm", "project", "rm", proj["id"].(string), "--yes")
	check("token create", "token", "create", "schema-token", "--scope", "read")
	check("token list", "token", "list")
	check("token revoke", "token", "revoke", "schema-token", "--yes")
	check("version", "version")
	check("auth status", "auth", "status")
	check("skill", "skill")
	check("export", "export", "--out", filepath.Join(t.TempDir(), "e.json"))
	// The API's own entities validate too (labels and comments have no command).
	for _, l := range h.apiJSON("GET", "/api/v1/labels", nil)["labels"].([]any) {
		if err := validate(schemas, schemas["label"], l, "label"); err != nil {
			t.Fatal(err)
		}
	}
	c := h.apiJSON("POST", "/api/v1/tasks/plant001/comments", map[string]any{"body": "hello"})
	var cv any
	raw, _ := json.Marshal(c)
	_ = json.Unmarshal(raw, &cv)
	if err := validate(schemas, schemas["comment"], cv, "comment"); err != nil {
		t.Fatal(err)
	}
	// Dry runs and errors.
	mustMatch(t, schemas, "dry run", h.mustRun("done", "plant", "--dry-run", "--json"), schemas["dry_run"])
	code, out, _ := h.run("done", "zzzz", "--json")
	if code != ExitUsage {
		t.Fatalf("unknown ref: %d", code)
	}
	mustMatch(t, schemas, "error", out, schemas["error"])
}

// TestSchemaGolden pins `ot schema`: changing a command, a flag or an output
// schema is a deliberate edit of testdata/schema.golden.json (go test -update).
func TestSchemaGolden(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	out := h.mustRun("schema")
	path := filepath.Join("testdata", "schema.golden.json")
	if *updateGolden {
		if err := os.WriteFile(path, []byte(out), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run go test ./internal/cli -run TestSchemaGolden -update)", err)
	}
	if out != string(want) {
		t.Fatalf("ot schema changed; review and run `go test ./internal/cli -run TestSchemaGolden -update`")
	}
}

// ---- 2.2 errors and exit codes ----

func TestExitCodeTable(t *testing.T) {
	h := &harness{t: t, configPath: filepath.Join(t.TempDir(), "config.json"), env: map[string]string{"OPENTODO_TOKEN": "ot_x"}}
	for _, c := range []struct {
		status int
		code   string
		exit   int
	}{
		{403, "insufficient_scope", ExitNotPermitted},
		{403, "forbidden", ExitNotPermitted},
		{403, "not_permitted", ExitNotPermitted},
		{403, "writes_disabled_by_owner", ExitNotPermitted},
		{403, "writes_disabled_by_user", ExitNotPermitted},
		{409, "encryption_enabled", ExitNotPermitted},
		{400, "invalid_input", ExitServer},
		{409, "idempotency_conflict", ExitServer},
		{404, "not_found", ExitServer},
		{429, "rate_limited", ExitServer},
		{500, "internal", ExitServer},
		{401, "unauthorized", ExitAuth},
	} {
		srv, _ := recorder(t, c.status, fmt.Sprintf(`{"error":{"code":%q,"message":"m"}}`, c.code))
		h.env["OPENTODO_URL"] = srv.URL
		code, out, _ := h.run("list", "--json")
		var env struct {
			Error struct {
				Code string
				Exit int
			} `json:"error"`
		}
		if code != c.exit || json.Unmarshal([]byte(out), &env) != nil || env.Error.Code != c.code || env.Error.Exit != c.exit {
			t.Errorf("%d %s: exit %d (want %d), stdout %q", c.status, c.code, code, c.exit, out)
		}
	}
	// Local refusals.
	if code, _, _ := h.run("add", "x", "--read-only"); code != ExitNotPermitted {
		t.Errorf("read-only: exit %d", code)
	}
	if code, _, _ := h.run("rm", "x"); code != ExitUsage {
		t.Errorf("rm without --yes: exit %d", code)
	}
	// The documented table lists every code.
	seen := map[int]bool{}
	for _, e := range exitCodes {
		seen[e["code"].(int)] = true
	}
	for code := 0; code <= 5; code++ {
		if !seen[code] {
			t.Errorf("exit code %d undocumented", code)
		}
	}
	for code := range notPermittedCodes {
		found := false
		for _, e := range errorCodes {
			found = found || (e["code"] == code && e["exit"] == ExitNotPermitted)
		}
		if !found {
			t.Errorf("error code %s missing from the table", code)
		}
	}
}

func TestJsonErrorStdoutAndStderr(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	code, out, errb := h.run("edit", "plum", "--priority", "9", "--json")
	if code != ExitUsage || !strings.Contains(out, `"exit":2`) || !strings.HasPrefix(errb, "ot: --priority") || strings.Count(errb, "\n") != 1 {
		t.Fatalf("local error: %d %q %q", code, out, errb)
	}
	// A server envelope keeps its code and message and gains exit.
	h.mustRun("add", "x", "--idempotency-key", "k1")
	code, out, errb = h.run("add", "y", "--idempotency-key", "k1", "--json")
	var env struct {
		Error struct {
			Code, Message string
			Exit          int
		} `json:"error"`
	}
	if code != ExitServer || json.Unmarshal([]byte(out), &env) != nil || env.Error.Code != "idempotency_conflict" || env.Error.Exit != 1 || errb != "ot: "+env.Error.Message+"\n" {
		t.Fatalf("server error: %d %q %q", code, out, errb)
	}
	// Without --json errors go to stderr only.
	code, out, errb = h.run("done", "zzzz")
	if code != ExitUsage || out != "" || !strings.HasPrefix(errb, "ot: no task matches") {
		t.Fatalf("human error: %d %q %q", code, out, errb)
	}
}

// ---- 2.3 / 2.4 discovery ----

func TestSchemaCoversEveryCommandAndFlag(t *testing.T) {
	// Every dispatcher command has at least one spec, and every spec a command.
	for _, c := range commands {
		found := false
		for _, sp := range cmdSpecs {
			found = found || sp.Name == c.name || strings.HasPrefix(sp.Name, c.name+" ")
		}
		if !found {
			t.Errorf("command %q has no entry in cmdSpecs", c.name)
		}
	}
	global := map[string]bool{"help": true, "h": true}
	for _, f := range globalFlagSpecs {
		global[f.Name] = true
	}
	for _, sp := range cmdSpecs {
		if findCommand(strings.Fields(sp.Name)[0]) == nil {
			t.Errorf("spec %q names no command", sp.Name)
		}
		// The real flag set of the command, captured while it parses --help.
		var real *flag.FlagSet
		flagSetHook = func(name string, fs *flag.FlagSet) {
			if name == sp.Name {
				real = fs
			}
		}
		h := &harness{t: t, env: map[string]string{}}
		args := append(strings.Fields(sp.Name), "--help")
		code, helpOut, _ := h.run(args...)
		flagSetHook = nil
		if code != 0 {
			t.Errorf("ot %s --help: exit %d", sp.Name, code)
			continue
		}
		if real == nil {
			t.Errorf("ot %s built no flag set named %q", sp.Name, sp.Name)
			continue
		}
		declared := map[string]bool{}
		for _, f := range sp.Flags {
			declared[f.Name] = true
			if f.Short != "" {
				declared[f.Short] = true
			}
			if f.Description == "" || f.Type == "" {
				t.Errorf("%s --%s: undescribed", sp.Name, f.Name)
			}
			// Human help prints the same table.
			if !strings.Contains(helpOut, "--"+f.Name) {
				t.Errorf("ot help %s lacks --%s", sp.Name, f.Name)
			}
		}
		real.VisitAll(func(f *flag.Flag) {
			if !declared[f.Name] && !global[f.Name] {
				t.Errorf("%s: flag --%s missing from the schema", sp.Name, f.Name)
			}
		})
		for name := range declared {
			if real.Lookup(name) == nil {
				t.Errorf("%s: schema lists --%s, which the command does not accept", sp.Name, name)
			}
		}
		// `vault watch` runs until interrupted; its dry run is `vault sync --dry-run`.
		if sp.Writes != sp.DryRun && sp.Name != "vault watch" {
			t.Errorf("%s: every write command supports --dry-run", sp.Name)
		}
		if sp.Destructive && !declared["yes"] {
			t.Errorf("%s: destructive without --yes", sp.Name)
		}
	}
}

func TestSchemaWorksWithoutConfig(t *testing.T) {
	// No config file, no server, no network.
	h := &harness{t: t, configPath: "", env: map[string]string{}}
	code, out, errb := h.run("schema")
	if code != 0 || errb != "" {
		t.Fatalf("ot schema: %d %q", code, errb)
	}
	var doc struct {
		OutputVersion int `json:"output_version"`
		Commands      []struct {
			Name           string
			Writes         bool
			DryRun         bool `json:"dry_run"`
			IdempotencyKey bool `json:"idempotency_key"`
			Flags          []struct{ Name string }
		}
		Schemas   map[string]json.RawMessage
		ExitCodes []map[string]any `json:"exit_codes"`
	}
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.OutputVersion != 1 || len(doc.Schemas) < 8 || len(doc.ExitCodes) != 6 {
		t.Fatalf("schema doc: v%d, %d schemas, %d exit codes", doc.OutputVersion, len(doc.Schemas), len(doc.ExitCodes))
	}
	found := false
	for _, c := range doc.Commands {
		if c.Name == "add" {
			found = c.Writes && c.DryRun && c.IdempotencyKey && len(c.Flags) >= 7
		}
	}
	if !found {
		t.Fatal("add is not listed as a write with dry run and idempotency key")
	}
	if code, out2, _ := h.run("help", "--json"); code != 0 || out2 != out {
		t.Fatal("ot help --json differs from ot schema")
	}
}

func TestVersionJson(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	out := h.mustRun("version", "--json")
	var v map[string]any
	if err := json.Unmarshal([]byte(out), &v); err != nil || v["version"] != Version || v["output_version"] != float64(1) {
		t.Fatalf("version --json = %q", out)
	}
	if out = h.mustRun("--version"); !strings.HasPrefix(out, "ot ") {
		t.Fatalf("--version = %q", out)
	}
}

// ---- 3.1 non-interactive safety ----

func TestDestructiveRequiresYesOffTerminal(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	h.mustRun("token", "create", "victim")
	cfgBefore, _ := os.ReadFile(h.configPath)
	cases := [][]string{
		{"rm", "book"},
		{"rm", "book", "plum"},
		{"project", "rm", "Home"},
		{"token", "revoke", "victim"},
		{"auth", "logout"},
	}
	for _, json := range []bool{false, true} {
		for _, tty := range []bool{false, true} {
			if tty && !json {
				continue // the prompt path, below
			}
			h.tty = tty
			for _, c := range cases {
				args := c
				if json {
					args = append(append([]string{}, c...), "--json")
				}
				h.requestLog()
				code, out, errb := h.run(args...)
				if code != ExitUsage || !strings.Contains(out+errb, "--yes") {
					t.Fatalf("ot %v (tty=%v): exit %d %q %q", args, tty, code, out, errb)
				}
				if json && !strings.Contains(out, `"code":"confirmation_required"`) {
					t.Fatalf("ot %v: envelope %q", args, out)
				}
				if log := h.requestLog(); len(log) != 0 {
					t.Fatalf("ot %v sent requests before refusing: %v", args, log)
				}
			}
		}
	}
	h.tty = false
	if h.task("book0001") == nil || h.task("plum0001") == nil {
		t.Fatal("a refused rm deleted something")
	}
	if cfg, _ := os.ReadFile(h.configPath); string(cfg) != string(cfgBefore) {
		t.Fatal("a refused logout changed the config file")
	}
	// The prompt still works on a terminal without --json.
	h.tty, h.stdin = true, "n\n"
	if code, _, errb := h.run("project", "rm", "Home"); code != ExitUsage || !strings.Contains(errb, "[y/N]") {
		t.Fatalf("prompt: %d %q", code, errb)
	}
	h.tty, h.stdin = false, ""
	// --yes is the explicit confirmation.
	out := h.mustRun("project", "rm", "Home", "--yes", "--json")
	var p map[string]any
	if json.Unmarshal([]byte(out), &p) != nil || p["id"] != "home0001" {
		t.Fatalf("project rm --yes --json = %q", out)
	}
	resp := h.api("GET", "/api/v1/projects/home0001", nil, h.apiToken)
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatal("project not deleted with --yes")
	}
}

// ---- 3.2 dry run ----

func TestDryRunSendsNoWrites(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	h.seedViews()
	h.mustRun("token", "create", "victim")
	issueConn := h.seedIssueConnection()
	cfgBefore, _ := os.ReadFile(h.configPath)
	schemas := loadSchemas(t)
	cases := [][]string{
		{"add", "Dry task", "--project", "Home", "--label", "brand-new-label", "--due", "tomorrow", "--idempotency-key", "dry-1"},
		{"edit", "plum", "--title", "Renamed", "--label", "another-new-label"},
		{"done", "rent", "plum"},
		{"reopen", "done0001"},
		{"rm", "book"},
		{"project", "add", "Dry project"},
		{"project", "rename", "Home", "Elsewhere"},
		{"project", "archive", "Home"},
		{"project", "rm", "Home"},
		{"token", "create", "dry-token"},
		{"token", "revoke", "victim"},
		{"auth", "logout"},
		{"auth", "set-token", h.apiToken},
		{"login", h.srv.URL, "--email", ownerEmail},
		{"time", "start", "plum"},
		{"time", "stop"},
		{"time", "log", "plum", "1h30", "--on", "yesterday", "--note", "review"},
		{"issues", "sync", issueConn[:6]},
	}
	covered := map[string]bool{}
	for _, c := range cases {
		args := append(append([]string{}, c...), "--dry-run", "--json")
		h.requestLog()
		code, out, errb := h.run(args...)
		if code != 0 {
			t.Fatalf("ot %v: exit %d %q %q", args, code, out, errb)
		}
		if w := writesIn(h.requestLog()); len(w) != 0 {
			t.Fatalf("ot %v sent writes: %v", args, w)
		}
		mustMatch(t, schemas, strings.Join(c, " "), out, schemas["dry_run"])
		var plan struct {
			Command  string
			Requests []plannedRequest
		}
		_ = json.Unmarshal([]byte(out), &plan)
		covered[plan.Command] = true
		if len(plan.Requests) == 0 && c[0] != "auth" {
			t.Fatalf("ot %v planned nothing: %s", args, out)
		}
	}
	for _, sp := range cmdSpecs {
		// The vault plans its own sync ops (vault_report.planned), covered by
		// TestVaultDryRun.
		if sp.Writes && !covered[sp.Name] && !strings.HasPrefix(sp.Name, "vault ") {
			t.Errorf("write command %q not covered by the dry-run test", sp.Name)
		}
	}
	// Nothing changed anywhere.
	if h.task("rent0001")["completed_at"] != nil || h.task("book0001") == nil || h.task("plum0001")["title"] != "Call the plumber" {
		t.Fatal("a dry run changed tasks")
	}
	if n := len(h.apiJSON("GET", "/api/v1/labels", nil)["labels"].([]any)); n != 0 {
		t.Fatalf("a dry run created %d labels", n)
	}
	if cfg, _ := os.ReadFile(h.configPath); string(cfg) != string(cfgBefore) {
		t.Fatal("a dry run changed the config file")
	}
	// The bulk completion of the spec scenario.
	out := h.mustRun("done", "rent", "plum", "--dry-run", "--json")
	var plan struct {
		DryRun   bool `json:"dry_run"`
		Requests []plannedRequest
		Targets  []dryTarget
	}
	_ = json.Unmarshal([]byte(out), &plan)
	if !plan.DryRun || len(plan.Requests) != 2 || len(plan.Targets) != 2 || plan.Targets[0].TitlePreview != "Pay rent" || plan.Requests[0].Method != "PATCH" {
		t.Fatalf("bulk dry run = %s", out)
	}
	// A planned label creation feeds the planned task (placeholder id).
	out = h.mustRun("add", "x", "--label", "fresh", "--dry-run", "--json")
	if !strings.Contains(out, `"path":"/api/v1/labels"`) || !strings.Contains(out, `"labels":["(planned-1)"]`) {
		t.Fatalf("label plan = %s", out)
	}
	// Human-readable plan.
	out = h.mustRun("done", "rent", "--dry-run")
	if !strings.Contains(out, "nothing was changed") || !strings.Contains(out, "PATCH /api/v1/tasks/rent0001") {
		t.Fatalf("human plan = %q", out)
	}
	// Ambiguity is found like in a real run.
	if code, _, errb := h.run("done", "d", "--dry-run", "--json"); code != ExitUsage || !strings.Contains(errb, "ambiguous") {
		t.Fatalf("ambiguous dry run: %d %q", code, errb)
	}
	// An unreachable server exits 4, even for a command with no lookups.
	h.env["OPENTODO_URL"] = "http://127.0.0.1:1"
	if code, _, _ := h.run("add", "x", "--dry-run", "--json"); code != ExitUnreachable {
		t.Fatalf("unreachable dry run: exit %d", code)
	}
}

// ---- 3.3 idempotency ----

func TestAddIdempotencyKey(t *testing.T) {
	h := newHarness(t)
	h.login()
	var first, second map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("add", "Buy milk", "--idempotency-key", "run42-milk", "--json")), &first)
	_ = json.Unmarshal([]byte(h.mustRun("add", "Buy milk", "--idempotency-key", "run42-milk", "--json")), &second)
	if first["id"] == nil || first["id"] != second["id"] {
		t.Fatalf("retry created another task: %v %v", first["id"], second["id"])
	}
	n := 0
	for _, tk := range h.apiJSON("GET", "/api/v1/tasks", nil)["tasks"].([]any) {
		if tk.(map[string]any)["title"] == "Buy milk" {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("tasks = %d", n)
	}
	code, out, _ := h.run("add", "Buy bread", "--idempotency-key", "run42-milk", "--json")
	if code != ExitServer || !strings.Contains(out, `"code":"idempotency_conflict"`) {
		t.Fatalf("conflict: %d %q", code, out)
	}
	h.requestLog()
	if code, _, errb := h.run("add", "x", "--idempotency-key", "has space"); code != ExitUsage || !strings.Contains(errb, "--idempotency-key") || len(h.requestLog()) != 0 {
		t.Fatalf("invalid key: %d %q", code, errb)
	}
	var p1, p2 map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("project", "add", "Garden", "--idempotency-key", "g1", "--json")), &p1)
	_ = json.Unmarshal([]byte(h.mustRun("project", "add", "Garden", "--idempotency-key", "g1", "--json")), &p2)
	if p1["id"] != p2["id"] {
		t.Fatal("project add retry created another project")
	}
}

func TestDoneAlreadyCompletedUnchanged(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	before := h.task("done0001")["completed_at"]
	h.requestLog()
	out := h.mustRun("done", "done0001", "--json")
	var r map[string]any
	if json.Unmarshal([]byte(out), &r) != nil || r["status"] != "unchanged" || r["completed_at"] != before {
		t.Fatalf("done on a completed task = %q", out)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("writes sent: %v", w)
	}
	if h.task("done0001")["completed_at"] != before {
		t.Fatal("completion time changed")
	}
	// Mixed: one open, one done; reopen of an open task is unchanged too.
	out = h.mustRun("done", "done0001", "book", "--json")
	var list []map[string]any
	if json.Unmarshal([]byte(out), &list) != nil || len(list) != 2 || list[0]["status"] != "unchanged" || list[1]["status"] != "completed" {
		t.Fatalf("mixed = %q", out)
	}
	h.requestLog()
	if out = h.mustRun("reopen", "plum", "--json"); !strings.Contains(out, `"status":"unchanged"`) || len(writesIn(h.requestLog())) != 0 {
		t.Fatalf("reopen open task = %q", out)
	}
}

func TestEditNoopSendsNothing(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	h.requestLog()
	out := h.mustRun("edit", "rent", "--priority", "2", "--project", "Home", "--due", "2026-10-08", "--json")
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("no-op edit sent %v", w)
	}
	var tk map[string]any
	if json.Unmarshal([]byte(out), &tk) != nil || tk["id"] != "rent0001" {
		t.Fatalf("no-op edit output = %q", out)
	}
	h.mustRun("edit", "rent", "--priority", "1")
	if w := writesIn(h.requestLog()); len(w) != 1 {
		t.Fatalf("real edit sent %v", w)
	}
}

// ---- 3.4 read-only mode and scopes ----

func TestReadOnlyMode(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	for _, setup := range []func(){
		func() { delete(h.env, "OPENTODO_READ_ONLY") },
		func() { h.env["OPENTODO_READ_ONLY"] = "1" },
	} {
		setup()
		for _, args := range [][]string{{"add", "x"}, {"done", "plum"}, {"rm", "plum", "--yes"}, {"project", "add", "P"}, {"token", "create", "t"}, {"edit", "plum", "--title", "y"}} {
			if h.env["OPENTODO_READ_ONLY"] == "" {
				args = append(args, "--read-only")
			}
			args = append(args, "--json")
			h.requestLog()
			code, out, _ := h.run(args...)
			if code != ExitNotPermitted || !strings.Contains(out, `"code":"read_only"`) {
				t.Fatalf("ot %v: exit %d %q", args, code, out)
			}
			if log := h.requestLog(); len(log) != 0 {
				t.Fatalf("ot %v sent %v", args, log)
			}
		}
	}
	// Reads work in read-only mode.
	if out := h.mustRun("today", "--json"); !strings.Contains(out, "plum0001") {
		t.Fatalf("read in read-only mode = %q", out)
	}
	if h.task("plum0001")["completed_at"] != nil {
		t.Fatal("read-only mode let a write through")
	}
}

// setToken points the harness at the server with the given token only.
func (h *harness) setToken(secret string) {
	h.env["OPENTODO_URL"] = h.srv.URL
	h.env["OPENTODO_TOKEN"] = secret
}

func (h *harness) apiToken2(scope string) (string, string) {
	h.t.Helper()
	out := h.apiJSON("POST", "/api/v1/tokens", map[string]any{"name": scope + " token", "scope": scope})
	return out["token"].(map[string]any)["id"].(string), out["secret"].(string)
}

func TestReadTokenRefusedLocally(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	_, secret := h.apiToken2("read")
	h.setToken(secret)
	h.requestLog()
	code, out, errb := h.run("done", "plum")
	if code != ExitNotPermitted || !strings.Contains(errb, "read-only") {
		t.Fatalf("done with a read token: %d %q %q", code, out, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("writes sent: %v", w)
	}
	if h.task("plum0001")["completed_at"] != nil {
		t.Fatal("task completed")
	}
	code, out, _ = h.run("add", "x", "--json")
	if code != ExitNotPermitted || !strings.Contains(out, `"code":"insufficient_scope"`) {
		t.Fatalf("add with a read token: %d %q", code, out)
	}
	// /me is fetched at most once per run.
	h.requestLog()
	h.run("done", "plum", "rent")
	me := 0
	for _, r := range h.requestLog() {
		if r == "GET /api/v1/me" {
			me++
		}
	}
	if me != 1 {
		t.Fatalf("GET /me %d times in one run", me)
	}
	// Reads work.
	h.mustRun("today")
}

func (h *harness) enableAgentWrites() {
	h.t.Helper()
	h.apiJSON("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true, "writes_enabled": true})
	h.apiJSON("PUT", "/api/v1/me/agent-access", map[string]any{"allow_writes": true})
}

func TestAgentTokenThroughCLI(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.enableAgentWrites()
	tokenID, secret := h.apiToken2("agent")
	h.setToken(secret)
	var created map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("add", "From the agent", "--project", "Home", "--label", "agent-label", "--json")), &created)
	id := created["id"].(string)
	var devices []string
	rows, _ := h.db.Query(`SELECT DISTINCT device FROM ops WHERE entity_id = ?`, id)
	for rows.Next() {
		var d string
		_ = rows.Scan(&d)
		devices = append(devices, d)
	}
	rows.Close()
	if len(devices) != 1 || devices[0] != "agent:"+tokenID {
		t.Fatalf("devices = %v", devices)
	}
	h.mustRun("edit", id, "--due", "tomorrow", "--priority", "1")
	h.mustRun("done", id)
	h.mustRun("reopen", id)
	h.mustRun("project", "rename", "Home", "Home 2")
	h.mustRun("rm", id, "--yes")
	// Outside the agent routes: refused locally, nothing sent.
	for _, args := range [][]string{{"project", "archive", "Home 2"}, {"project", "rm", "Home 2", "--yes"}, {"token", "create", "escalate"}} {
		h.requestLog()
		code, out, _ := h.run(append(args, "--json")...)
		if code != ExitNotPermitted || !strings.Contains(out, `"code":"insufficient_scope"`) {
			t.Fatalf("ot %v with an agent token: %d %q", args, code, out)
		}
		if w := writesIn(h.requestLog()); len(w) != 0 {
			t.Fatalf("ot %v sent %v", args, w)
		}
	}
	// The server's own refusals map to exit 5 too.
	code, out, _ := h.run("rm", "book", "--yes", "--json")
	if code != ExitNotPermitted || !strings.Contains(out, `"code":"not_permitted"`) || h.task("book0001") == nil {
		t.Fatalf("trash a user's task: %d %q", code, out)
	}
	h.apiJSON("PUT", "/api/v1/me/agent-access", map[string]any{"allow_writes": false})
	code, out, _ = h.run("add", "x", "--json")
	if code != ExitNotPermitted || !strings.Contains(out, `"code":"writes_disabled_by_user"`) {
		t.Fatalf("switch off: %d %q", code, out)
	}
}

func TestAuthStatusShowsScope(t *testing.T) {
	h := newHarness(t)
	h.enableAgentWrites()
	_, secret := h.apiToken2("agent")
	h.setToken(secret)
	out := h.mustRun("auth", "status")
	if !strings.Contains(out, "Scope:    agent") || !strings.Contains(out, "Writes:   allowed") || !strings.Contains(out, "agent token") {
		t.Fatalf("auth status = %q", out)
	}
	h.apiJSON("PUT", "/api/v1/me/agent-access", map[string]any{"allow_writes": false})
	out = h.mustRun("auth", "status", "--json")
	var st map[string]any
	if json.Unmarshal([]byte(out), &st) != nil || st["scope"] != "agent" || st["writes_allowed"] != false || st["writes_denied"] != "writes_disabled_by_user" {
		t.Fatalf("auth status --json = %q", out)
	}
	_, read := h.apiToken2("read")
	h.setToken(read)
	if out = h.mustRun("auth", "status"); !strings.Contains(out, "Scope:    read") || strings.Contains(out, "Writes:") {
		t.Fatalf("read token status = %q", out)
	}
	_, full := h.apiToken2("full")
	h.setToken(full)
	if out = h.mustRun("auth", "status"); !strings.Contains(out, "Scope:    full") || !strings.Contains(out, "Token:    full token") {
		t.Fatalf("full token status = %q", out)
	}
	h.setToken(h.apiToken)
	if out = h.mustRun("auth", "status"); !strings.Contains(out, "Scope:    admin") || !strings.Contains(out, "Token:    seed") {
		t.Fatalf("admin token status = %q", out)
	}
}

// ---- 4.1 the skill file ----

var (
	skillCodeRe = regexp.MustCompile("(?s)```[a-z]*\n(.*?)```|`([^`\n]+)`")
	skillFlagRe = regexp.MustCompile(`--[a-z][a-z-]*`)
)

func TestSkillMentionsOnlyExistingCommands(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	out := h.mustRun("skill")
	if out != skills.OpenTodoCLI {
		t.Fatal("ot skill differs from the embedded SKILL.md")
	}
	if !strings.HasPrefix(out, "---\nname: opentodo-cli\ndescription: ") {
		t.Fatalf("frontmatter: %q", out[:60])
	}
	global := map[string]bool{"--help": true}
	for _, f := range globalFlagSpecs {
		global["--"+f.Name] = true
	}
	var names []string
	for _, sp := range cmdSpecs {
		names = append(names, sp.Name)
		names = append(names, sp.Aliases...)
	}
	sort.Slice(names, func(i, j int) bool { return len(names[i]) > len(names[j]) })
	mentioned := 0
	for _, m := range skillCodeRe.FindAllStringSubmatch(out, -1) {
		code := m[1] + m[2]
		for _, line := range strings.Split(code, "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "ot ") {
				continue
			}
			rest := strings.TrimPrefix(line, "ot ")
			var spec *cmdSpec
			for _, n := range names {
				if rest == n || strings.HasPrefix(rest, n+" ") {
					for i := range cmdSpecs {
						sp := &cmdSpecs[i]
						if sp.Name == n || contains(sp.Aliases, n) {
							spec = sp
						}
					}
					break
				}
			}
			if spec == nil {
				// "ot token", "ot auth" name command groups.
				if findCommand(strings.Fields(rest)[0]) == nil {
					t.Errorf("SKILL.md mentions an unknown command: %q", line)
				}
				continue
			}
			mentioned++
			for _, fl := range skillFlagRe.FindAllString(rest, -1) {
				ok := global[fl]
				for _, f := range spec.Flags {
					ok = ok || "--"+f.Name == fl
				}
				if !ok {
					t.Errorf("SKILL.md: `ot %s` has no flag %s (%q)", spec.Name, fl, line)
				}
			}
		}
	}
	if mentioned < 10 {
		t.Fatalf("only %d command mentions parsed", mentioned)
	}
	for _, must := range []string{"--json", "--dry-run", "--idempotency-key", "agent", "exit 5", "untrusted", "never as a command"} {
		if !strings.Contains(strings.ToLower(out), strings.ToLower(must)) {
			if must == "untrusted" && strings.Contains(out, "data, not instructions") {
				continue
			}
			if must == "exit 5" && strings.Contains(out, "| 5 |") {
				continue
			}
			t.Errorf("SKILL.md lacks %q", must)
		}
	}
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
