package cli

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestMain lets a completion test run this test binary as `ot` from a shell:
// with OT_TEST_AS_OT=1 the process is the CLI, not the test runner.
func TestMain(m *testing.M) {
	if os.Getenv("OT_TEST_AS_OT") == "1" {
		os.Exit(NewApp().Main(os.Args[1:]))
	}
	os.Exit(m.Run())
}

// completeLine runs `ot __complete -- words…` through App.Main and returns the
// directive and the candidate values.
func (h *harness) completeLine(words ...string) (string, []string, []string) {
	h.t.Helper()
	code, out, errb := h.run(append([]string{completeCommand, "--"}, words...)...)
	if code != 0 || errb != "" {
		h.t.Fatalf("ot __complete %q: exit %d, stderr %q", words, code, errb)
	}
	lines := strings.Split(strings.TrimSuffix(out, "\n"), "\n")
	var values, descs []string
	for _, l := range lines[1:] {
		v, d, _ := strings.Cut(l, "\t")
		values = append(values, v)
		descs = append(descs, d)
	}
	return lines[0], values, descs
}

// TestCompletionCoversSchema: every command, subcommand, alias and flag that
// `ot schema` lists can be completed (ot-completion design D1).
func TestCompletionCoversSchema(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	_, tops, _ := h.completeLine("")
	for _, c := range commands {
		if !contains(tops, c.name) {
			t.Errorf("command %q is not completed", c.name)
		}
	}
	if contains(tops, completeCommand) {
		t.Errorf("the hidden %s is offered", completeCommand)
	}
	for _, sp := range cmdSpecs {
		words := strings.Fields(sp.Name)
		if len(words) == 2 {
			_, subs, _ := h.completeLine(words[0], "")
			if !contains(subs, words[1]) {
				t.Errorf("subcommand %q is not completed", sp.Name)
			}
			for _, al := range sp.Aliases {
				if !contains(subs, strings.Fields(al)[1]) {
					t.Errorf("alias %q is not completed", al)
				}
			}
		}
		_, flags, _ := h.completeLine(append(words, "--")...)
		for _, f := range append(append([]flagSpec{}, sp.Flags...), globalFlagSpecs...) {
			if !contains(flags, "--"+f.Name) {
				t.Errorf("ot %s: --%s is not completed", sp.Name, f.Name)
			}
		}
		for _, f := range sp.Flags {
			if len(f.Enum) == 0 {
				continue
			}
			_, vals, _ := h.completeLine(append(words, "--"+f.Name, "")...)
			for _, e := range f.Enum {
				if !contains(vals, e) {
					t.Errorf("ot %s --%s: %q is not completed", sp.Name, f.Name, e)
				}
			}
		}
	}
}

// TestCompletionEngine pins the offline answers for typical lines.
func TestCompletionEngine(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	cases := []struct {
		words     []string
		directive string
		want      []string // exactly these values, in order
	}{
		{[]string{"pro"}, compDefault, []string{"project"}},
		{[]string{"project", "r"}, compDefault, []string{"rename", "rm"}},
		{[]string{"project", "ls", "--a"}, compDefault, []string{"--all"}},
		{[]string{"add", "--pri"}, compDefault, []string{"--priority"}},
		{[]string{"add", "--priority", ""}, compDefault, []string{"1", "2", "3", "4"}},
		{[]string{"token", "create", "--scope=r"}, compDefault, []string{"--scope=read"}},
		{[]string{"rm", "--yes", "--y"}, compDefault, nil},
		{[]string{"add", "--label", "a", "--lab"}, compDefault, []string{"--label"}},
		{[]string{"list", "--", "--"}, compDefault, nil},
		{[]string{"export", "--out", ""}, compFile, nil},
		{[]string{"time", "export", "-o", ""}, compFile, nil},
		{[]string{"vault", "sync", ""}, compDir, nil},
		{[]string{"completion", ""}, compDefault, []string{"bash", "zsh", "fish"}},
		{[]string{"help", "comp"}, compDefault, []string{"completion"}},
		{[]string{"--json", "ver"}, compDefault, []string{"version"}},
		{[]string{"--profile", "x", "tod"}, compDefault, []string{"today"}},
		{[]string{"nosuch", ""}, compDefault, nil},
		{[]string{"project", "nosuch", ""}, compDefault, nil},
		{[]string{"list", "--project", ""}, compDefault, nil}, // no profile: nothing
		{[]string{"add", "#ho"}, compDefault, nil},
	}
	for _, c := range cases {
		dir, got, _ := h.completeLine(c.words...)
		if dir != c.directive || strings.Join(got, "|") != strings.Join(c.want, "|") {
			t.Errorf("%q: got %s %q, want %s %q", c.words, dir, got, c.directive, c.want)
		}
	}
}

// TestCompletionDynamic reads names and ids from the profile's server.
func TestCompletionDynamic(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.put("project", "bigp0001", map[string]any{"name": "Big Project", "color": "#10b981", "archived": false})
	h.put("project", "secr0001", map[string]any{"name": "enc:v1:" + strings.Repeat("A", 48), "color": "#10b981", "archived": false})
	h.put("label", "lab00001", map[string]any{"name": "errand"})
	h.put("label", "lab00002", map[string]any{"name": "deep work"})
	h.login()

	_, got, descs := h.completeLine("list", "--project", "")
	if !contains(got, "Home") || !contains(got, "Big Project") || contains(got, "Attic") || len(got) != 2 {
		t.Errorf("--project: %q", got)
	}
	if descs[0] != "project" {
		t.Errorf("descriptions: %q", descs)
	}
	if _, got, _ = h.completeLine("add", "x", "--project", "bi"); strings.Join(got, "|") != "Big Project" {
		t.Errorf("--project bi: %q", got)
	}
	if _, got, _ = h.completeLine("project", "archive", ""); !contains(got, "Attic") {
		t.Errorf("project archive: %q", got)
	}
	if _, got, _ = h.completeLine("project", "rename", ""); contains(got, "Attic") {
		t.Errorf("project rename offers an archived project: %q", got)
	}
	if _, got, _ = h.completeLine("add", "Buy", "#bi"); strings.Join(got, "|") != "#BigProject" {
		t.Errorf("#bi: %q", got)
	}
	if _, got, _ = h.completeLine("edit", "plum", "--label", ""); !contains(got, "deep work") || !contains(got, "errand") {
		t.Errorf("--label: %q", got)
	}
	if _, got, _ = h.completeLine("add", "Buy", "@"); strings.Join(got, "|") != "@errand" {
		t.Errorf("@: %q", got)
	}
	_, got, descs = h.completeLine("done", "p")
	if strings.Join(got, "|") != "plant001|plum0001" || descs[1] != "Call the plumber" {
		t.Errorf("done p: %q %q", got, descs)
	}
	if _, got, _ = h.completeLine("reopen", ""); strings.Join(got, "|") != "done0001" {
		t.Errorf("reopen: %q", got)
	}
	if _, got, _ = h.completeLine("time", "log", "plum0001", ""); got != nil {
		t.Errorf("time log duration: %q", got)
	}
	if _, got, _ = h.completeLine("--profile", ""); strings.Join(got, "|") != "default" {
		t.Errorf("--profile: %q", got)
	}
	if _, got, _ = h.completeLine("list", "--workspace", ""); len(got) == 0 {
		t.Errorf("--workspace: nothing")
	}
	// A --profile on the line that names no profile: nothing, quietly.
	if _, got, _ = h.completeLine("--profile", "nobody", "list", "--project", ""); got != nil {
		t.Errorf("unknown profile: %q", got)
	}
}

// TestCompletionOffline: an unreachable or slow server gives no candidates,
// no stderr and exit 0 within the time limit.
func TestCompletionOffline(t *testing.T) {
	h := &harness{t: t, env: map[string]string{"OPENTODO_URL": "http://127.0.0.1:1", "OPENTODO_TOKEN": "ot_x"}}
	if _, got, _ := h.completeLine("list", "--project", ""); got != nil {
		t.Errorf("unreachable: %q", got)
	}
	if _, got, _ := h.completeLine("list", "--proj"); strings.Join(got, "|") != "--project" {
		t.Errorf("flags offline: %q", got)
	}
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(10 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer slow.Close()
	h.env["OPENTODO_URL"] = slow.URL
	start := time.Now()
	if _, got, _ := h.completeLine("done", ""); got != nil {
		t.Errorf("slow: %q", got)
	}
	if d := time.Since(start); d > completionTimeout+time.Second {
		t.Errorf("slow server held completion for %v", d)
	}
	h.env["OPENTODO_URL"] = ""
	h.configPath = filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(h.configPath, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, got, _ := h.completeLine("--profile", ""); got != nil {
		t.Errorf("broken config: %q", got)
	}
}

func TestCompletionCommand(t *testing.T) {
	h := &harness{t: t, env: map[string]string{}}
	for _, sh := range completionShells {
		out := h.mustRun("completion", sh)
		want, _ := completionFS.ReadFile("completion/ot." + sh)
		if out != string(want) || !strings.Contains(out, "ot __complete --") {
			t.Errorf("ot completion %s prints something else", sh)
		}
	}
	if code, _, _ := h.run("completion", "powershell"); code != ExitUsage {
		t.Errorf("unknown shell: exit %d", code)
	}
	if code, _, _ := h.run("completion"); code != ExitUsage {
		t.Errorf("no shell: exit %d", code)
	}
	if !strings.Contains(h.mustRun("help"), "ot completion bash|zsh|fish") {
		t.Errorf("ot help does not mention completion")
	}
}

// TestCompletionScriptsParse runs each shell's syntax check when it is installed.
func TestCompletionScriptsParse(t *testing.T) {
	for _, sh := range completionShells {
		t.Run(sh, func(t *testing.T) {
			bin, err := exec.LookPath(sh)
			if err != nil {
				t.Skipf("%s is not installed; syntax not checked", sh)
			}
			raw, _ := completionFS.ReadFile("completion/ot." + sh)
			path := filepath.Join(t.TempDir(), "ot."+sh)
			if err := os.WriteFile(path, raw, 0o600); err != nil {
				t.Fatal(err)
			}
			if out, err := exec.Command(bin, "-n", path).CombinedOutput(); err != nil {
				t.Errorf("%s -n: %v\n%s", sh, err, out)
			}
		})
	}
}

// otOnPath puts a script named ot on a fresh PATH directory that runs this
// test binary as the CLI (TestMain).
func otOnPath(t *testing.T) string {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	script := "#!/bin/sh\nOT_TEST_AS_OT=1 exec '" + self + "' \"$@\"\n"
	if err := os.WriteFile(filepath.Join(dir, "ot"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

// TestCompletionBashQuotesNames drives the bash script the way bash does on Tab.
func TestCompletionBashQuotesNames(t *testing.T) {
	bash, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash is not installed")
	}
	h := newHarness(t)
	h.put("project", "bigp0001", map[string]any{"name": "Big Project", "color": "#10b981", "archived": false})
	h.put("project", "quot0001", map[string]any{"name": "Tom's $stuff", "color": "#10b981", "archived": false})
	raw, _ := completionFS.ReadFile("completion/ot.bash")
	script := filepath.Join(t.TempDir(), "ot.bash")
	if err := os.WriteFile(script, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	run := func(words ...string) string {
		t.Helper()
		line := "source " + script + "; COMP_WORDS=(" + strings.Join(words, " ") + "); COMP_CWORD=$((${#COMP_WORDS[@]}-1)); _ot_complete; printf '%s\\n' \"${COMPREPLY[@]}\""
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, bash, "--norc", "--noprofile", "-c", line)
		cmd.Env = append(os.Environ(), "PATH="+otOnPath(t)+string(os.PathListSeparator)+os.Getenv("PATH"),
			"OPENTODO_URL="+h.srv.URL, "OPENTODO_TOKEN="+h.apiToken, "OPENTODO_CONFIG="+filepath.Join(t.TempDir(), "none.json"))
		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("bash: %v", err)
		}
		return strings.TrimSpace(string(out))
	}
	if got := run("ot", "add", "Buy", "--project", "Bi"); got != `Big\ Project` {
		t.Errorf("Bi: %q", got)
	}
	if got := run("ot", "add", "Buy", "--project", `\"Bi`); got != `Big\ Project` {
		t.Errorf("opening quote: %q", got)
	}
	if got := run("ot", "list", "--project", "To"); got != `Tom\'s\ \$stuff` {
		t.Errorf("metacharacters: %q", got)
	}
	if got := run("ot", "pro"); got != "project" {
		t.Errorf("command: %q", got)
	}
}

// TestCompletionZshValues runs the zsh function with the completion system's
// _describe and _files replaced by stubs that print what they were given.
func TestCompletionZshValues(t *testing.T) {
	zsh, err := exec.LookPath("zsh")
	if err != nil {
		t.Skip("zsh is not installed")
	}
	h := newHarness(t)
	h.put("project", "bigp0001", map[string]any{"name": "Big Project", "color": "#10b981", "archived": false})
	h.put("project", "colo0001", map[string]any{"name": "Work: Q4", "color": "#10b981", "archived": false})
	raw, _ := completionFS.ReadFile("completion/ot.zsh")
	script := filepath.Join(t.TempDir(), "_ot")
	if err := os.WriteFile(script, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	run := func(prefix string, words ...string) string {
		t.Helper()
		quoted := make([]string, len(words))
		for i, w := range words {
			quoted[i] = "'" + w + "'"
		}
		line := "compdef() { :; }; _describe() { print -rl -- \"${(@P)${@[-1]}}\"; }; _files() { print -r -- FILES \"$@\"; }; " +
			"source " + script + "; words=(" + strings.Join(quoted, " ") + "); CURRENT=${#words}; PREFIX='" + prefix + "'; _ot"
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, zsh, "-f", "-c", line)
		cmd.Env = append(os.Environ(), "PATH="+otOnPath(t)+string(os.PathListSeparator)+os.Getenv("PATH"),
			"OPENTODO_URL="+h.srv.URL, "OPENTODO_TOKEN="+h.apiToken, "OPENTODO_CONFIG="+filepath.Join(t.TempDir(), "none.json"))
		out, _ := cmd.Output()
		return strings.TrimSpace(string(out))
	}
	if got := run("", "ot", "list", "--project", ""); got != "Big Project:project\nWork\\: Q4:project" {
		t.Errorf("projects: %q", got)
	}
	if got := run("--proj", "ot", "list", "--proj"); got != "--project:tasks of one project (name or id)" {
		t.Errorf("flag: %q", got)
	}
	if got := run("", "ot", "vault", "init", ""); got != "FILES -/" {
		t.Errorf("dir: %q", got)
	}
}
