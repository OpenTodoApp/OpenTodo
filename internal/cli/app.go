// Package cli implements the `ot` command-line client for the OpenTodo REST API.
// It is an online client: it keeps no local copy of tasks and every command is one
// or a few HTTP calls. Output is a compact table for people and, with --json, the
// API's own entity shapes for scripts.
package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"
)

// Version is set by the main package from the build-time version.
var Version = "dev"

// App bundles the process environment so the whole CLI can run in a test with
// buffers instead of real file descriptors.
type App struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
	// ConfigPath is the profile file. Empty means "not resolvable" and only
	// matters once a command needs it.
	ConfigPath string
	Getenv     func(string) string
	Now        func() time.Time
	Hostname   string
	// IsTerminal reports whether the process talks to a person (stdin and stdout
	// are terminals). It gates colour and prompts.
	IsTerminal func() bool
	// ReadPassword reads a secret without echo. nil means the built-in reader.
	ReadPassword func(prompt string) (string, error)
	// Sleep waits (the unlock delay after repeated failures). nil means time.Sleep.
	Sleep func(time.Duration)

	in *bufio.Reader
	// out is the real stdout: a dry run silences Stdout while the command runs
	// and prints the plan here instead.
	out io.Writer
	// gate holds read-only mode, the dry-run plan and the token scope learned
	// from /api/v1/me; every client of this run shares it.
	gate *writeGate
}

// NewApp builds an App wired to the real process environment.
func NewApp() *App {
	a := &App{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr, Getenv: os.Getenv, Now: time.Now}
	a.ConfigPath, _ = DefaultConfigPath(os.Getenv)
	a.Hostname, _ = os.Hostname()
	a.IsTerminal = func() bool { return isTerminal(os.Stdin) && isTerminal(os.Stdout) }
	return a
}

func (a *App) init() {
	if a.Getenv == nil {
		a.Getenv = func(string) string { return "" }
	}
	if a.Now == nil {
		a.Now = time.Now
	}
	if a.IsTerminal == nil {
		a.IsTerminal = func() bool { return false }
	}
	if a.Hostname == "" {
		a.Hostname = "unknown-host"
	}
	if a.in == nil {
		a.in = bufio.NewReader(a.Stdin)
	}
	if a.ReadPassword == nil {
		a.ReadPassword = a.defaultReadPassword
	}
	if a.Sleep == nil {
		a.Sleep = time.Sleep
	}
}

func (a *App) sleep(d time.Duration) {
	if d > 0 {
		a.Sleep(d)
	}
}

// Main runs the CLI and returns the process exit code.
func (a *App) Main(args []string) int { return a.MainContext(context.Background(), args) }

// MainContext is Main with a context that ends long-running commands
// (`ot vault watch`).
func (a *App) MainContext(ctx context.Context, args []string) int {
	a.init()
	a.out = a.Stdout
	a.gate = &writeGate{}
	g := &globalFlags{}
	err := a.run(ctx, g, args)
	a.Stdout = a.out
	if err == nil {
		if a.gate.dry != nil {
			if err = a.printPlan(g); err == nil {
				return ExitOK
			}
		} else {
			return ExitOK
		}
	}
	var ee *exitError
	if !errors.As(err, &ee) {
		ee = &exitError{code: ExitServer, msg: err.Error()}
	}
	if g.json {
		// The envelope stays on stdout (the documented contract) and one human
		// line goes to stderr for harnesses that only show stderr (design D1).
		fmt.Fprintln(a.Stdout, string(ee.Envelope()))
		line, _, _ := strings.Cut(ee.msg, "\n")
		fmt.Fprintln(a.Stderr, "ot: "+line)
	} else {
		fmt.Fprintln(a.Stderr, "ot: "+ee.msg)
	}
	return ee.code
}

// globalFlags are accepted before or after the command name.
type globalFlags struct {
	profile  string
	server   string
	json     bool
	dryRun   bool
	readOnly bool
}

func (g *globalFlags) bind(fs *flag.FlagSet) {
	fs.StringVar(&g.profile, "profile", g.profile, "profile name from the config file")
	fs.StringVar(&g.server, "server", g.server, "server URL (overrides profile and OPENTODO_URL)")
	fs.BoolVar(&g.json, "json", g.json, "print only JSON")
	fs.BoolVar(&g.dryRun, "dry-run", g.dryRun, "print the planned requests, send no write")
	fs.BoolVar(&g.readOnly, "read-only", g.readOnly, "refuse write commands")
}

// command is one top-level command of the dispatcher; cmdSpecs (commands.go)
// describes it and its subcommands for help and `ot schema`.
type command struct {
	name    string
	summary string
	usage   string
	run     func(a *App, ctx context.Context, g *globalFlags, args []string) error
}

// commands is filled in init: several command bodies print usage, which reads this
// list, and a package-level initializer may not refer to itself.
var commands []command

func init() {
	commands = []command{
		{"login", "sign in with email and password and store an API token", "ot login <server-url> [--email <email>] [--profile <name>]", cmdLogin},
		{"auth", "manage the stored credentials: set-token, status, logout", "ot auth set-token <token> [--server <url>]\not auth status\not auth logout [--yes]", cmdAuth},
		{"list", "list tasks (default: all open tasks)", "ot list [--inbox|--today|--upcoming|--project <name-or-id>|--completed|--all] [--limit <n>]", cmdList},
		{"today", "alias for `ot list --today`", "ot today [--limit <n>]", viewAlias("today")},
		{"inbox", "alias for `ot list --inbox`", "ot inbox [--limit <n>]", viewAlias("inbox")},
		{"upcoming", "alias for `ot list --upcoming`", "ot upcoming [--limit <n>]", viewAlias("upcoming")},
		{"add", "create a task and print its id", "ot add <title> [--project <name-or-id>] [--due <when>] [--time HH:MM] [--priority 1-4] [--label <l>]... [--note <text>] [--idempotency-key <key>]", cmdAdd},
		{"edit", "change a task", "ot edit <ref> [--title <t>] [--project <name|none>] [--due <when|none>] [--time HH:MM] [--priority 1-4] [--label <l>]... [--note <text>]", cmdEdit},
		{"done", "complete one or more tasks", "ot done <ref>...", cmdDone},
		{"reopen", "reopen one or more completed tasks", "ot reopen <ref>...", cmdReopen},
		{"rm", "delete one or more tasks (soft delete)", "ot rm <ref>... [--yes]", cmdRm},
		{"project", "manage projects: list, add, rename, archive, rm", "ot project list [--all]\not project add <name> [--color <#rrggbb>] [--idempotency-key <key>]\not project rename <ref> <new-name>\not project archive <ref> [--undo]\not project rm <ref> [--yes]", cmdProject},
		{"token", "manage API tokens: list, create, revoke", "ot token list\not token create <name> [--scope full|read|agent]\not token revoke <id-or-name> [--yes]", cmdToken},
		{"mcp", "bridge stdio MCP clients to the configured server", "ot mcp [--allow-full-token] [--decrypt]", cmdMCP},
		{"encryption", "end-to-end encryption on this machine: unlock, lock, status", "ot encryption unlock [--recovery] [--passphrase-file <path>]\not encryption lock\not encryption status", cmdEncryption},
		{"vault", "Markdown vault: a folder of project files in two-way sync", "ot vault init <dir> [--adopt]\not vault sync [<dir>]\not vault status [<dir>]\not vault watch [<dir>]", cmdVault},
		{"issues", "issue connections: list, sync", "ot issues list\not issues sync [<id>]", cmdIssues},
		{"time", "track time: start, stop, log, list, export", "ot time start <ref> [--note <text>]\not time stop\not time log <ref> <duration> [--on <day>] [--note <text>]\not time log <ref> --from HH:MM --to HH:MM [--on <day>] [--note <text>]\not time list [--task <ref>] [--from <day>] [--to <day>] [--running] [--limit <n>]\not time export [--from <day>] [--to <day>] [-o <file>]", cmdTime},
		{"export", "download the full JSON export", "ot export [--out <file>]", cmdExport},
		{"schema", "print commands, flags, exit codes and output schemas as JSON", "ot schema", cmdSchema},
		{"skill", "print the agent skill file embedded in ot", "ot skill", cmdSkill},
		{"version", "print the client version", "ot version", cmdVersion},
		{"help", "show help for a command", "ot help [command] [--json]", cmdHelp},
	}
}

func findCommand(name string) *command {
	for i := range commands {
		if commands[i].name == name {
			return &commands[i]
		}
	}
	return nil
}

func (a *App) run(ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("ot", g)
	showHelp := fs.Bool("help", false, "show help")
	fs.BoolVar(showHelp, "h", false, "show help")
	showVersion := fs.Bool("version", false, "print the client version")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			a.printUsage()
			return nil
		}
		return usageErr("%v\nRun `ot help` for usage.", err)
	}
	if *showVersion {
		return cmdVersion(a, ctx, g, nil)
	}
	if fs.NArg() == 0 || *showHelp {
		a.printUsage()
		if fs.NArg() == 0 && !*showHelp {
			return usageErr("no command given")
		}
		return nil
	}
	name, rest := fs.Arg(0), fs.Args()[1:]
	cmd := findCommand(name)
	if cmd == nil {
		return usageErr("unknown command %q\nRun `ot help` for the list of commands.", name)
	}
	return cmd.run(a, ctx, g, rest)
}

// flagSetHook lets tests see every command's real flag set (schema drift test).
var flagSetHook func(name string, fs *flag.FlagSet)

// flagSet creates a FlagSet that reports errors instead of exiting and carries
// the global flags.
func (a *App) flagSet(name string, g *globalFlags) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.Usage = func() {}
	g.bind(fs)
	if flagSetHook != nil {
		flagSetHook(name, fs)
	}
	return fs
}

// parse is parseArgs plus the checks every command shares, all before any
// request: read-only mode refuses write commands (exit 5), a destructive
// command needs --yes off a terminal or with --json (exit 2), and a dry run
// silences the command's own output and starts collecting the plan.
func (a *App) parse(g *globalFlags, fs *flag.FlagSet, name string, args []string) ([]string, error) {
	pos, err := parseArgs(fs, name, args)
	if err != nil {
		return nil, err
	}
	if envTrue(a.Getenv("OPENTODO_READ_ONLY")) {
		g.readOnly = true
	}
	// The client refuses writes in read-only mode too (defence in depth).
	a.gate.readOnly = g.readOnly
	spec := findSpec(name)
	if spec == nil || !spec.Writes {
		return pos, nil
	}
	if g.readOnly {
		return nil, readOnlyErr(name)
	}
	if spec.Destructive && !g.dryRun {
		yes := false
		if f := fs.Lookup("yes"); f != nil {
			yes = f.Value.String() == "true"
		}
		if !yes && (!a.IsTerminal() || g.json) {
			return nil, &exitError{code: ExitUsage, jsonCode: "confirmation_required",
				msg: fmt.Sprintf("refusing to run `ot %s` without --yes when not attached to a terminal (or with --json); nothing was changed", name)}
		}
	}
	if g.dryRun && spec.DryRun {
		a.gate.dry = &dryPlan{command: name}
		a.Stdout = io.Discard
	}
	return pos, nil
}

func envTrue(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func readOnlyErr(name string) error {
	return &exitError{code: ExitNotPermitted, jsonCode: "read_only",
		msg: fmt.Sprintf("`ot %s` writes, and read-only mode is on (--read-only or OPENTODO_READ_ONLY); nothing was sent", name)}
}

// parseArgs parses flags that may appear before, between or after positional
// arguments (so `ot add "title" --due tomorrow` works) and returns the positionals.
func parseArgs(fs *flag.FlagSet, cmdName string, args []string) ([]string, error) {
	var pos []string
	for {
		if err := fs.Parse(args); err != nil {
			if errors.Is(err, flag.ErrHelp) {
				return nil, err
			}
			return nil, usageErr("%s: %v\nRun `ot help %s` for usage.", cmdName, err, strings.Fields(cmdName)[0])
		}
		if fs.NArg() == 0 {
			return pos, nil
		}
		rest := fs.Args()
		// A literal "--" ends flag parsing; everything after it is positional.
		if len(args) > 0 && endsWithTerminator(args, len(rest)) {
			return append(pos, rest...), nil
		}
		pos = append(pos, rest[0])
		args = rest[1:]
	}
}

func endsWithTerminator(args []string, nrest int) bool {
	i := len(args) - nrest - 1
	return i >= 0 && args[i] == "--"
}

// helpOr prints the command's usage when flag parsing asked for help.
func (a *App) helpOr(name string, err error) error {
	if errors.Is(err, flag.ErrHelp) {
		a.printCommandUsage(name)
		return nil
	}
	return err
}

func (a *App) printUsage() {
	w := a.Stdout
	fmt.Fprintln(w, "ot: command-line client for OpenTodo")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage: ot [--profile <name>] [--server <url>] [--json] [--dry-run] [--read-only] <command> [arguments]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	for _, c := range commands {
		fmt.Fprintf(w, "  %-9s %s\n", c.name, c.summary)
	}
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Global flags:")
	fmt.Fprintln(w, "  --profile <name>  profile from the config file (default: the file's default, or \"default\")")
	fmt.Fprintln(w, "  --server <url>    server URL, overriding the profile and OPENTODO_URL")
	fmt.Fprintln(w, "  --json            print only JSON: the API's entities, or {\"error\":{code,message,exit}}")
	fmt.Fprintln(w, "  --dry-run         write commands: print the requests they would send, send no write")
	fmt.Fprintln(w, "  --read-only       refuse every write command before any request")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Environment: OPENTODO_URL, OPENTODO_TOKEN, OPENTODO_PROFILE override the config file;")
	fmt.Fprintln(w, "OPENTODO_CONFIG points at another config file; OPENTODO_READ_ONLY=1 is --read-only; NO_COLOR disables colour.")
	fmt.Fprintln(w, "Task <ref> is a full id or a unique id prefix. --due accepts YYYY-MM-DD, today, tomorrow or a weekday.")
	fmt.Fprintln(w, "Off a terminal or with --json, rm, project rm, token revoke and auth logout need --yes.")
	fmt.Fprintln(w, "Exit codes: 0 ok, 1 server error, 2 usage or validation, 3 authentication or configuration, 4 server unreachable,")
	fmt.Fprintln(w, "5 not permitted (scope, role, switch, encryption or read-only: do not retry). `ot schema` describes everything as JSON.")
}

func (a *App) printCommandUsage(name string) {
	top, _, _ := strings.Cut(name, " ")
	c := findCommand(top)
	if c == nil {
		return
	}
	w := a.Stdout
	fmt.Fprintf(w, "%s\n\nUsage:\n  %s\n", c.summary, strings.ReplaceAll(c.usage, "\n", "\n  "))
	// Flags come from the command model, the same table `ot schema` prints.
	for _, sp := range cmdSpecs {
		if sp.Name != top && !strings.HasPrefix(sp.Name, top+" ") {
			continue
		}
		if len(sp.Flags) == 0 {
			continue
		}
		fmt.Fprintf(w, "\nFlags of `ot %s`:\n", sp.Name)
		for _, f := range sp.Flags {
			fmt.Fprintf(w, "  %-22s %s\n", flagUsage(f), f.Description)
		}
	}
	if extra := commandHelp[top]; extra != "" {
		fmt.Fprintln(w)
		fmt.Fprintln(w, extra)
	}
}

func flagUsage(f flagSpec) string {
	s := "--" + f.Name
	if f.Short != "" {
		s = "-" + f.Short + ", " + s
	}
	switch f.Type {
	case "string", "string_list":
		s += " <value>"
	case "int":
		s += " <n>"
	}
	return s
}

var commandHelp = map[string]string{
	"list": "Filters: --inbox (no project), --today (due today or earlier, overdue first), --upcoming (due after today),\n--project <name-or-id>, --completed (most recent first), --all (open and completed). Default: every open task.",
	"add":  "--due accepts YYYY-MM-DD, today, tomorrow or an English weekday (next occurrence). --time needs HH:MM.\n--label may be repeated. Prints the new task id; with --json prints the task.",
	"edit": "Clear a value with --due none, --project none or --note \"\". Only the given flags change.",
	"rm":   "Soft-deletes (tombstone). Asks for confirmation on a terminal unless --yes is given;\noff a terminal or with --json it refuses without --yes (exit 2).",
	"done": "A task that is already completed is reported as unchanged and nothing is sent.",
	"mcp":  "Reads newline-delimited JSON-RPC messages from stdin and writes responses to stdout.\nA read-only token is required unless --allow-full-token is given.",
}

func cmdHelp(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("help", g)
	args, err := parseArgs(fs, "help", args)
	if err != nil {
		return a.helpOr("help", err)
	}
	if g.json {
		return cmdSchema(a, ctx, g, nil)
	}
	if len(args) == 0 {
		a.printUsage()
		return nil
	}
	if findCommand(args[0]) == nil {
		return usageErr("unknown command %q", args[0])
	}
	a.printCommandUsage(args[0])
	return nil
}

func cmdVersion(a *App, _ context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("version", g)
	if _, err := parseArgs(fs, "version", args); err != nil {
		return a.helpOr("version", err)
	}
	if g.json {
		return a.printJSON(map[string]any{"version": Version, "output_version": OutputVersion})
	}
	fmt.Fprintln(a.Stdout, "ot", Version)
	return nil
}

// ---- shared helpers ----

// connect loads the configuration and returns an authenticated client.
func (a *App) connect(g *globalFlags) (*client, target, error) {
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return nil, target{}, authErr("%v", err)
	}
	t := resolveTarget(g, a.Getenv, cfg)
	if t.URL == "" {
		return nil, t, usageErr("no server configured.\nRun `ot login <server-url>` to sign in, or set OPENTODO_URL and OPENTODO_TOKEN.")
	}
	if t.Token == "" {
		return nil, t, usageErr("not signed in to %s (profile %q).\nRun `ot login %s`, `ot auth set-token <token>`, or set OPENTODO_TOKEN.", t.URL, t.Profile, t.URL)
	}
	c := newClient(t.URL, t.Token)
	c.gate = a.gate
	return c, t, nil
}

func (a *App) printJSON(v any) error {
	enc := json.NewEncoder(a.Stdout)
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

// printRawList prints raw entities as one JSON array.
func (a *App) printRawList(items []json.RawMessage) error {
	if items == nil {
		items = []json.RawMessage{}
	}
	return a.printJSON(items)
}

func (a *App) color() bool {
	return a.IsTerminal() && a.Getenv("NO_COLOR") == "" && a.Getenv("TERM") != "dumb"
}

func (a *App) readLine(prompt string) (string, error) {
	if prompt != "" {
		fmt.Fprint(a.Stderr, prompt)
	}
	line, err := a.in.ReadString('\n')
	if err != nil && (err != io.EOF || line == "") {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// confirm asks a yes/no question on a terminal. Without a terminal there is
// nobody to ask: a.parse already refused the destructive command without --yes
// (design D6), and this refuses again rather than ever answering yes.
func (a *App) confirm(prompt string) (bool, error) {
	if !a.IsTerminal() {
		return false, &exitError{code: ExitUsage, jsonCode: "confirmation_required", msg: "refusing to delete without --yes when not attached to a terminal"}
	}
	line, err := a.readLine(prompt + " [y/N] ")
	if err != nil {
		return false, err
	}
	line = strings.ToLower(strings.TrimSpace(line))
	return line == "y" || line == "yes", nil
}

func (a *App) defaultReadPassword(prompt string) (string, error) {
	fmt.Fprint(a.Stderr, prompt)
	// Nothing is echoed either way (no echo on a terminal, piped input otherwise),
	// so end the prompt line ourselves.
	defer fmt.Fprintln(a.Stderr)
	f, ok := a.Stdin.(*os.File)
	if ok && isTerminal(f) {
		if restore, err := disableEcho(f); err == nil {
			defer restore()
		}
	}
	line, err := a.in.ReadString('\n')
	if err != nil && (err != io.EOF || line == "") {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// sortedNames returns project names for error messages.
func sortedNames(ps []project) []string {
	names := make([]string, 0, len(ps))
	for _, p := range ps {
		names = append(names, p.Name)
	}
	sort.Strings(names)
	return names
}
