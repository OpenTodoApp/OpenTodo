package cli

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"
)

// Shell completion (OpenSpec change ot-completion). `ot completion <shell>`
// prints a small wrapper; the wrapper calls the hidden `ot __complete -- <words>`
// on every Tab, and the engine below answers from cmdSpecs, the table `ot help`
// and `ot schema` print, so completion cannot drift from the binary (design D1).

//go:embed completion/ot.bash completion/ot.zsh completion/ot.fish
var completionFS embed.FS

// completionShells are the shells `ot completion` writes a script for.
var completionShells = []string{"bash", "zsh", "fish"}

// completeCommand is the hidden entry point the scripts call.
const completeCommand = "__complete"

func cmdCompletion(a *App, _ context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("completion", g)
	pos, err := parseArgs(fs, "completion", args)
	if err != nil {
		return a.helpOr("completion", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot completion bash|zsh|fish\nRun `ot help completion` for how to install the script.")
	}
	raw, err := completionScript(pos[0])
	if err != nil {
		return err
	}
	_, err = a.Stdout.Write(raw)
	return err
}

func completionScript(shell string) ([]byte, error) {
	for _, s := range completionShells {
		if s == shell {
			return completionFS.ReadFile("completion/ot." + shell)
		}
	}
	return nil, usageErr("unknown shell %q: ot completion knows bash, zsh and fish", shell)
}

// Directives, the first line of `ot __complete` output (design D2).
const (
	compDefault = ":default"
	compFile    = ":file"
	compDir     = ":dir"
)

// compItem is one candidate: the value to insert and an optional description.
type compItem struct{ value, desc string }

// compResult is what `ot __complete` prints.
type compResult struct {
	directive string
	items     []compItem
}

// runComplete prints candidates for the words after `ot __complete`. It never
// fails and never writes to stderr: whatever goes wrong, the shell gets an
// empty list (design D3).
func (a *App) runComplete(ctx context.Context, args []string) {
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	if len(args) == 0 {
		args = []string{""}
	}
	res := a.complete(ctx, args)
	var b strings.Builder
	b.WriteString(res.directive + "\n")
	for _, it := range res.items {
		if strings.ContainsAny(it.value, "\t\n\r") || it.value == "" {
			continue
		}
		desc := strings.Join(strings.Fields(it.desc), " ")
		if len(desc) > 80 {
			desc = strings.TrimSpace(desc[:77]) + "..."
		}
		b.WriteString(it.value + "\t" + desc + "\n")
	}
	_, _ = a.Stdout.Write([]byte(b.String()))
}

// compState is what the words before the cursor say.
type compState struct {
	top     string   // first positional word: the command
	spec    *cmdSpec // the resolved command, nil while a subcommand is expected
	unknown bool     // a word that names no command or subcommand
	pos     int      // positional arguments after the command
	pending *flagSpec
	ended   bool // after a literal --
	used    map[string]bool
	g       globalFlags
}

// complete returns the candidates for words[len-1], the word under the cursor.
func (a *App) complete(ctx context.Context, words []string) compResult {
	cur := words[len(words)-1]
	st := scanWords(words[:len(words)-1])
	res := compResult{directive: compDefault}
	if st.unknown {
		return res
	}
	switch {
	case st.pending != nil:
		return a.flagValues(ctx, st, *st.pending, cur, "")
	case !st.ended && strings.HasPrefix(cur, "-"):
		if name, val, ok := strings.Cut(cur, "="); ok {
			if f := st.lookupFlag(strings.TrimLeft(name, "-")); f != nil && takesValue(*f) {
				return a.flagValues(ctx, st, *f, val, name+"=")
			}
			return res
		}
		res.items = filterPrefix(st.flagCandidates(), cur, false)
		return res
	case st.top == "":
		res.items = filterPrefix(commandCandidates(), cur, false)
		return res
	case st.spec == nil:
		res.items = filterPrefix(subcommandCandidates(st.top), cur, false)
		return res
	}
	return a.argValues(ctx, st, cur)
}

// scanWords walks the completed words like the dispatcher and parseArgs would.
func scanWords(words []string) *compState {
	st := &compState{used: map[string]bool{}}
	for _, w := range words {
		if st.pending != nil {
			st.setGlobal(st.pending.Name, w)
			st.pending = nil
			continue
		}
		if !st.ended && w == "--" {
			st.ended = true
			continue
		}
		if !st.ended && strings.HasPrefix(w, "-") && w != "-" {
			name, val, hasValue := strings.Cut(strings.TrimLeft(w, "-"), "=")
			if f := st.lookupFlag(name); f != nil {
				st.used[f.Name] = true
				switch {
				case hasValue:
					st.setGlobal(f.Name, val)
				case takesValue(*f):
					st.pending = f
				}
			}
			continue
		}
		switch {
		case st.top == "":
			st.top = w
			if findCommand(w) == nil {
				st.unknown = true
				return st
			}
			if !hasSubcommands(w) {
				st.spec = findSpecOrAlias(w)
			}
		case st.spec == nil:
			if st.spec = findSpecOrAlias(st.top + " " + w); st.spec == nil {
				st.unknown = true
				return st
			}
		default:
			st.pos++
		}
	}
	return st
}

func (st *compState) setGlobal(name, value string) {
	switch name {
	case "profile":
		st.g.profile = value
	case "server":
		st.g.server = value
	case "workspace":
		st.g.workspace = value
	}
}

// commandFlags are the flags the word position accepts: the command's own and
// the global ones, or only the global ones before a command is known.
func (st *compState) commandFlags() []flagSpec {
	out := append([]flagSpec{}, globalFlagSpecs...)
	if st.spec != nil {
		out = append(out, st.spec.Flags...)
	}
	if st.top == "" {
		out = append(out, flagSpec{Name: "version", Type: "bool", Description: "print the client version"})
	}
	return append(out, flagSpec{Name: "help", Short: "h", Type: "bool", Description: "show help"})
}

func (st *compState) lookupFlag(name string) *flagSpec {
	for _, f := range st.commandFlags() {
		if f.Name == name || (f.Short != "" && f.Short == name) {
			return &f
		}
	}
	return nil
}

func (st *compState) flagCandidates() []compItem {
	var out []compItem
	for _, f := range st.commandFlags() {
		if st.used[f.Name] && f.Type != "string_list" {
			continue
		}
		out = append(out, compItem{"--" + f.Name, f.Description})
	}
	return out
}

func takesValue(f flagSpec) bool { return f.Type != "bool" }

func hasSubcommands(top string) bool {
	for _, sp := range cmdSpecs {
		if strings.HasPrefix(sp.Name, top+" ") {
			return true
		}
	}
	return false
}

// findSpecOrAlias resolves a full command name or one of its aliases.
func findSpecOrAlias(name string) *cmdSpec {
	for i := range cmdSpecs {
		if cmdSpecs[i].Name == name {
			return &cmdSpecs[i]
		}
		for _, al := range cmdSpecs[i].Aliases {
			if al == name {
				return &cmdSpecs[i]
			}
		}
	}
	return nil
}

func commandCandidates() []compItem {
	out := make([]compItem, 0, len(commands))
	for _, c := range commands {
		out = append(out, compItem{c.name, c.summary})
	}
	return out
}

func subcommandCandidates(top string) []compItem {
	var out []compItem
	for _, sp := range cmdSpecs {
		if sub, ok := strings.CutPrefix(sp.Name, top+" "); ok {
			out = append(out, compItem{sub, sp.Summary})
			for _, al := range sp.Aliases {
				if s, ok := strings.CutPrefix(al, top+" "); ok {
					out = append(out, compItem{s, sp.Summary})
				}
			}
		}
	}
	return out
}

// filterPrefix keeps the items whose value starts with prefix; fold ignores case.
func filterPrefix(items []compItem, prefix string, fold bool) []compItem {
	out := make([]compItem, 0, len(items))
	for _, it := range items {
		v, p := it.value, prefix
		if fold {
			v, p = strings.ToLower(v), strings.ToLower(p)
		}
		if strings.HasPrefix(v, p) {
			out = append(out, it)
		}
	}
	return out
}

// valueKind names what a flag value or positional argument holds.
type valueKind string

const (
	kindNone      valueKind = ""
	kindProfiles  valueKind = "profiles"
	kindWorkspace valueKind = "workspaces"
	kindProjects  valueKind = "projects"
	kindAllProj   valueKind = "projects+archived"
	kindLabels    valueKind = "labels"
	kindTasks     valueKind = "tasks"
	kindDoneTasks valueKind = "completed-tasks"
	kindCommands  valueKind = "commands"
	kindShells    valueKind = "shells"
	kindTitle     valueKind = "title"
	kindFile      valueKind = "file"
	kindDir       valueKind = "dir"
)

// flagKind is the value kind of a flag (design D3).
func flagKind(f flagSpec) valueKind {
	switch f.Name {
	case "profile":
		return kindProfiles
	case "workspace":
		return kindWorkspace
	case "project":
		return kindProjects
	case "label":
		return kindLabels
	case "task", "blocked-by":
		return kindTasks
	case "out", "passphrase-file":
		return kindFile
	}
	return kindNone
}

// argKind is the value kind of the i-th positional argument of a command.
func argKind(sp *cmdSpec, i int) valueKind {
	if len(sp.Args) == 0 {
		return kindNone
	}
	if i >= len(sp.Args) {
		if !sp.Args[len(sp.Args)-1].Repeatable {
			return kindNone
		}
		i = len(sp.Args) - 1
	}
	switch sp.Args[i].Name {
	case "ref":
		switch {
		case sp.Name == "reopen":
			return kindDoneTasks
		case sp.Name == "project archive" || sp.Name == "project rm":
			return kindAllProj
		case strings.HasPrefix(sp.Name, "project "):
			return kindProjects
		}
		return kindTasks
	case "dir":
		return kindDir
	case "command":
		return kindCommands
	case "shell":
		return kindShells
	case "title":
		return kindTitle
	}
	return kindNone
}

func (a *App) flagValues(ctx context.Context, st *compState, f flagSpec, cur, prefix string) compResult {
	res := compResult{directive: compDefault}
	if len(f.Enum) > 0 {
		for _, v := range f.Enum {
			res.items = append(res.items, compItem{v, ""})
		}
		res.items = filterPrefix(res.items, cur, true)
	} else {
		res = a.kindValues(ctx, st, flagKind(f), cur)
	}
	if prefix != "" {
		for i := range res.items {
			res.items[i].value = prefix + res.items[i].value
		}
	}
	return res
}

func (a *App) argValues(ctx context.Context, st *compState, cur string) compResult {
	kind := argKind(st.spec, st.pos)
	if kind == kindTitle {
		switch {
		case strings.HasPrefix(cur, "#"):
			return a.quickAddValues(ctx, st, kindProjects, cur)
		case strings.HasPrefix(cur, "@"):
			return a.quickAddValues(ctx, st, kindLabels, cur)
		}
		return compResult{directive: compDefault}
	}
	return a.kindValues(ctx, st, kind, cur)
}

// kindValues returns the candidates of one kind that start with cur.
func (a *App) kindValues(ctx context.Context, st *compState, kind valueKind, cur string) compResult {
	res := compResult{directive: compDefault}
	switch kind {
	case kindFile:
		res.directive = compFile
		return res
	case kindDir:
		res.directive = compDir
		return res
	case kindCommands:
		res.items = filterPrefix(commandCandidates(), cur, false)
		return res
	case kindShells:
		for _, s := range completionShells {
			res.items = append(res.items, compItem{s, ""})
		}
		res.items = filterPrefix(res.items, cur, false)
		return res
	case kindProfiles:
		res.items = filterPrefix(a.profileCandidates(), cur, true)
		return res
	case kindNone:
		return res
	}
	items := a.remoteCandidates(ctx, st, kind)
	res.items = filterPrefix(items, cur, true)
	return res
}

// quickAddValues completes #project and @label words of an `ot add` title the
// way quick add matches them: separators left out of project names, labels
// without whitespace.
func (a *App) quickAddValues(ctx context.Context, st *compState, kind valueKind, cur string) compResult {
	res := compResult{directive: compDefault}
	mark := cur[:1]
	for _, it := range a.remoteCandidates(ctx, st, kind) {
		name := it.value
		if kind == kindProjects {
			name = strings.Join(strings.FieldsFunc(name, func(r rune) bool {
				return r == '_' || r == '-' || r == ' ' || r == '\t'
			}), "")
		} else if strings.ContainsAny(name, " \t") {
			continue
		}
		if name != "" {
			res.items = append(res.items, compItem{mark + name, it.desc})
		}
	}
	res.items = filterPrefix(res.items, cur, true)
	return res
}

func (a *App) profileCandidates() []compItem {
	cfg, err := loadConfig(a.ConfigPath)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(cfg.Profiles))
	for name := range cfg.Profiles {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]compItem, 0, len(names))
	for _, name := range names {
		out = append(out, compItem{name, cfg.Profiles[name].URL})
	}
	return out
}

// String makes compItem readable in test failures.
func (it compItem) String() string { return fmt.Sprintf("%s\t%s", it.value, it.desc) }
