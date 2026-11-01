package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"go.yaml.in/yaml/v3"
)

// Routine commands (OpenSpec change routines-engine, design D16): a routine
// is a rule with steps. `ot routine` lists, shows, runs, tests, switches,
// creates and edits routines from a JSON or YAML file, deletes and undoes a
// run; `ot routines` is the same command and `ot rules` keeps its own.

const routineUsage = "ot routine list\not routine show <id|name>\not routine runs <id|name> [--failed] [--limit n]\not routine run <id|name> [--task <id>] [--test]\not routine enable|disable <id|name>\not routine create --file <routine.yaml|json>\not routine edit <id|name> --file <path>\not routine rm <id|name> [--yes]\not routine undo <id|name> <run-id>"

func cmdRoutine(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot routine list|show|runs|run|enable|disable|create|edit|rm|undo ...")
	}
	rest := args[1:]
	switch args[0] {
	case "list", "ls":
		return routineList(a, ctx, g, rest)
	case "show":
		return routineShow(a, ctx, g, rest)
	case "runs":
		return routineRuns(a, ctx, g, rest)
	case "run":
		return routineRun(a, ctx, g, rest)
	case "enable", "disable":
		return routineSwitch(a, ctx, g, args[0], rest)
	case "create", "add":
		return routineWrite(a, ctx, g, "create", rest)
	case "edit":
		return routineWrite(a, ctx, g, "edit", rest)
	case "rm", "delete":
		return routineRm(a, ctx, g, rest)
	case "undo":
		return routineUndo(a, ctx, g, rest)
	}
	return usageErr("unknown routine command %q (expected list, show, runs, run, enable, disable, create, edit, rm or undo)", args[0])
}

// routineRow is a routine as GET /api/v1/rules returns it.
type routineRow struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Enabled  bool            `json:"enabled"`
	Trigger  json.RawMessage `json:"trigger"`
	Steps    json.RawMessage `json:"steps"`
	Warnings []struct {
		Step    string `json:"step"`
		Message string `json:"message"`
	} `json:"warnings"`
	Raw json.RawMessage `json:"-"`
}

func (c *client) routines(ctx context.Context) ([]routineRow, error) {
	list, rows, err := c.rules(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]routineRow, len(rows))
	for i := range list {
		_ = json.Unmarshal(list[i], &out[i])
		out[i].Raw = list[i]
	}
	return out, nil
}

// resolveRoutine finds a routine by id, unique id prefix or exact name.
func resolveRoutine(rows []routineRow, ref string) (*routineRow, error) {
	plainRows := make([]ruleRow, len(rows))
	for i, r := range rows {
		plainRows[i] = ruleRow{ID: r.ID, Name: r.Name}
	}
	hit, err := resolveRule(plainRows, ref)
	if err != nil {
		return nil, usageErr("no routine %q (see `ot routine list`)", ref)
	}
	for i := range rows {
		if rows[i].ID == hit.ID {
			return &rows[i], nil
		}
	}
	return nil, usageErr("no routine %q", ref)
}

// routineArgs parses a routine command without flags of its own; done is true
// when --help was answered.
func (a *App) routineArgs(g *globalFlags, name string, args []string, n int, usage string) (pos []string, done bool, err error) {
	fs := a.flagSet(name, g)
	pos, err = a.parse(g, fs, name, args)
	if err != nil {
		err = a.helpOr("routine", err)
		return nil, err == nil, err
	}
	if len(pos) != n {
		return nil, false, usageErr("usage: %s", usage)
	}
	return pos, false, nil
}

func stepCount(raw json.RawMessage) int {
	var list []json.RawMessage
	if json.Unmarshal(raw, &list) != nil || len(list) == 0 {
		return 1
	}
	return len(list)
}

func triggerKind(raw json.RawMessage) string {
	var tr struct {
		Kind string `json:"kind"`
	}
	_ = json.Unmarshal(raw, &tr)
	return tr.Kind
}

func routineList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if _, done, err := a.routineArgs(g, "routine list", args, 0, "ot routine list"); err != nil || done {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	if g.json {
		list := make([]json.RawMessage, len(rows))
		for i := range rows {
			list[i] = rows[i].Raw
		}
		return a.printJSON(list)
	}
	if len(rows) == 0 {
		fmt.Fprintln(a.Stdout, "No routines.")
		return nil
	}
	tbl := newTable("ID", "NAME", "ON", "TRIGGER", "STEPS")
	for _, r := range rows {
		on := "off"
		if r.Enabled {
			on = "on"
		}
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(r.Name), plain(on), plain(triggerKind(r.Trigger)), plain(strconv.Itoa(stepCount(r.Steps))))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

// routineStep is a step as the CLI prints it.
type routineStep struct {
	ID        string                     `json:"id"`
	Kind      string                     `json:"kind"`
	In        map[string]json.RawMessage `json:"in"`
	Then      []routineStep              `json:"then"`
	Otherwise []routineStep              `json:"otherwise"`
	Do        []routineStep              `json:"do"`
}

// pickWords names a Pick step's mode (OpenSpec change routines-dynamic-data
// D2): take is "pick first|last|first N|last N|all", filter "pick where".
func (s routineStep) pickWords() string {
	if s.Kind == "filter" {
		return "pick where"
	}
	var from string
	var n float64 = 1
	_ = json.Unmarshal(literalOf(s.In["from"]), &from)
	_ = json.Unmarshal(literalOf(s.In["n"]), &n)
	end := "first"
	if from == "end" {
		end = "last"
	}
	switch {
	case from == "all":
		return "pick all"
	case n > 1:
		return fmt.Sprintf("pick %s %d", end, int(n))
	}
	return "pick " + end
}

func literalOf(v json.RawMessage) json.RawMessage {
	var arg struct {
		Literal json.RawMessage `json:"literal"`
	}
	_ = json.Unmarshal(v, &arg)
	return arg.Literal
}

// sentence writes a step as one line: its kind (Pick by its mode) and its inputs.
func (s routineStep) sentence() string {
	head := strings.ReplaceAll(s.Kind, "_", " ")
	if s.Kind == "take" || s.Kind == "filter" {
		head = s.pickWords()
	}
	var parts []string
	for name, v := range s.In {
		var arg struct {
			Ref     string          `json:"ref"`
			Literal json.RawMessage `json:"literal"`
		}
		_ = json.Unmarshal(v, &arg)
		if arg.Ref != "" {
			parts = append(parts, name+" ← "+arg.Ref)
		} else {
			parts = append(parts, name+" = "+string(arg.Literal))
		}
	}
	slices.Sort(parts)
	return head + " (" + strings.Join(parts, ", ") + ")"
}

func printSteps(a *App, steps []routineStep, indent string, n *int) {
	for _, s := range steps {
		*n++
		fmt.Fprintf(a.Stdout, "%s%d. [%s] %s\n", indent, *n, s.ID, s.sentence())
		for _, b := range []struct {
			name string
			list []routineStep
		}{{"then", s.Then}, {"otherwise", s.Otherwise}, {"do", s.Do}} {
			if len(b.list) > 0 {
				fmt.Fprintf(a.Stdout, "%s   %s:\n", indent, b.name)
				printSteps(a, b.list, indent+"     ", n)
			}
		}
	}
}

func routineShow(a *App, ctx context.Context, g *globalFlags, args []string) error {
	pos, done, err := a.routineArgs(g, "routine show", args, 1, "ot routine show <id|name>")
	if err != nil || done {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(r.Raw)
	}
	var full struct {
		Trigger   json.RawMessage `json:"trigger"`
		Condition json.RawMessage `json:"condition"`
		Actions   json.RawMessage `json:"actions"`
		Steps     []routineStep   `json:"steps"`
	}
	_ = json.Unmarshal(r.Raw, &full)
	on := "off"
	if r.Enabled {
		on = "on"
	}
	fmt.Fprintf(a.Stdout, "%s  (%s, %s)\nWhen: %s\n", r.Name, shortID(r.ID), on, string(full.Trigger))
	if c := string(full.Condition); c != "" && c != "null" {
		fmt.Fprintf(a.Stdout, "Only for tasks that: %s\n", c)
	}
	if len(full.Steps) == 0 {
		fmt.Fprintf(a.Stdout, "1. change tasks (%s)\n", string(full.Actions))
	} else {
		n := 0
		printSteps(a, full.Steps, "", &n)
	}
	for _, w := range r.Warnings {
		fmt.Fprintf(a.Stdout, "Not available: step %s: %s\n", w.Step, w.Message)
	}
	return nil
}

func routineRuns(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("routine runs", g)
	failed := fs.Bool("failed", false, "only failed runs")
	limit := fs.Int("limit", 50, "print at most n runs (1 to 100)")
	pos, err := a.parse(g, fs, "routine runs", args)
	if err != nil {
		return a.helpOr("routine", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot routine runs <id|name> [--failed] [--limit n]")
	}
	if *limit < 1 || *limit > 100 {
		return usageErr("--limit must be from 1 to 100")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	q := url.Values{"rule": {r.ID}, "limit": {strconv.Itoa(*limit)}}
	if *failed {
		q.Set("outcome", "failed")
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/me/rules/runs?"+q.Encode(), nil, nil)
	if err != nil {
		return err
	}
	var page struct {
		Runs []json.RawMessage `json:"runs"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return fmt.Errorf("decode runs: %w", err)
	}
	if page.Runs == nil {
		page.Runs = []json.RawMessage{}
	}
	if g.json {
		return a.printJSON(page.Runs)
	}
	if len(page.Runs) == 0 {
		fmt.Fprintln(a.Stdout, "No runs.")
		return nil
	}
	tbl := newTable("RUN", "TIME", "SOURCE", "OUTCOME", "WRITES", "REASON")
	for _, rr := range page.Runs {
		var run struct {
			RunID   string `json:"run_id"`
			At      int64  `json:"at"`
			Source  string `json:"source"`
			Outcome string `json:"outcome"`
			Writes  int    `json:"writes"`
			Reason  string `json:"reason"`
		}
		_ = json.Unmarshal(rr, &run)
		style := styleNone
		if run.Outcome == "failed" || run.Outcome == "stopped" {
			style = styleRed
		}
		tbl.add(plain(run.RunID), plain(time.UnixMilli(run.At).In(a.Now().Location()).Format("2006-01-02 15:04")), plain(run.Source),
			cell{text: run.Outcome, style: style}, plain(strconv.Itoa(run.Writes)), plain(run.Reason))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func routineRun(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("routine run", g)
	task := fs.String("task", "", "the task the routine's steps read as the trigger's task (id)")
	test := fs.Bool("test", false, "plan every step and log a test run; nothing is written")
	pos, err := a.parse(g, fs, "routine run", args)
	if err != nil {
		return a.helpOr("routine", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot routine run <id|name> [--task <id>] [--test]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], r.ID, r.Name, "run")
	body := map[string]any{"run_id": ids.New(), "test": *test}
	if *task != "" {
		body["task_id"] = *task
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/rules/"+r.ID+"/run", body, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	var res struct {
		Run struct {
			RunID   string `json:"run_id"`
			Outcome string `json:"outcome"`
			Reason  string `json:"reason"`
			Writes  int    `json:"writes"`
		} `json:"run"`
		Steps []struct {
			StepID     string `json:"step_id"`
			Kind       string `json:"kind"`
			Status     string `json:"status"`
			Items      int    `json:"items"`
			DurationMs int64  `json:"duration_ms"`
			Error      string `json:"error"`
		} `json:"steps"`
		Writes int `json:"writes"`
	}
	_ = json.Unmarshal(raw, &res)
	if g.json {
		if err := a.printJSON(json.RawMessage(raw)); err != nil {
			return err
		}
	} else {
		for i, s := range res.Steps {
			line := fmt.Sprintf("%d. [%s] %s: %s, %d items, %d ms", i+1, s.StepID, strings.ReplaceAll(s.Kind, "_", " "), s.Status, s.Items, s.DurationMs)
			if s.Error != "" {
				line += " (" + s.Error + ")"
			}
			fmt.Fprintln(a.Stdout, line)
		}
		verb := "wrote"
		if *test {
			verb = "would write"
		}
		fmt.Fprintf(a.Stdout, "%s: %s, %s %d items (run %s)\n", r.Name, res.Run.Outcome, verb, res.Writes, res.Run.RunID)
	}
	if res.Run.Outcome == "failed" {
		return &exitError{code: ExitRunFailed, jsonCode: "run_failed", msg: fmt.Sprintf("the run failed: %s", res.Run.Reason), printed: g.json}
	}
	return nil
}

func routineSwitch(a *App, ctx context.Context, g *globalFlags, verb string, args []string) error {
	pos, done, err := a.routineArgs(g, "routine "+verb, args, 1, "ot routine "+verb+" <id|name>")
	if err != nil || done {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], r.ID, r.Name, verb+"d")
	raw, _, err := c.do(ctx, http.MethodPatch, "/rules/"+r.ID, map[string]any{"enabled": verb == "enable"}, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	fmt.Fprintf(a.Stdout, "%s: %sd\n", r.Name, verb)
	return nil
}

// readRoutineFile reads a routine from JSON or YAML (by the extension, else
// by trying JSON first).
func readRoutineFile(path string) (map[string]any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, usageErr("read %s: %v", path, err)
	}
	var doc map[string]any
	lower := strings.ToLower(path)
	if strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml") || json.Unmarshal(b, &doc) != nil {
		doc = nil
		if err := yaml.Unmarshal(b, &doc); err != nil || doc == nil {
			return nil, usageErr("%s is neither JSON nor YAML: %v", path, err)
		}
	}
	for k := range doc {
		switch k {
		case "name", "trigger", "condition", "steps", "actions", "enabled":
		default:
			return nil, usageErr("%s: unknown key %q (a routine file holds name, trigger, condition, steps or actions, and enabled)", path, k)
		}
	}
	return doc, nil
}

func routineWrite(a *App, ctx context.Context, g *globalFlags, verb string, args []string) error {
	name := "routine " + verb
	fs := a.flagSet(name, g)
	file := fs.String("file", "", "the routine as JSON or YAML: name, trigger, condition, steps (or actions), enabled")
	pos, err := a.parse(g, fs, name, args)
	if err != nil {
		return a.helpOr("routine", err)
	}
	want := 0
	usage := "ot routine create --file <path>"
	if verb == "edit" {
		want, usage = 1, "ot routine edit <id|name> --file <path>"
	}
	if len(pos) != want || *file == "" {
		return usageErr("usage: %s", usage)
	}
	doc, err := readRoutineFile(*file)
	if err != nil {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	if err := newNameResolver(ctx, c).routine(doc); err != nil {
		return err
	}
	if steps, ok := doc["steps"]; ok && steps != nil {
		if _, has := doc["actions"]; !has {
			doc["actions"] = nil
		}
	}
	method, path := http.MethodPost, "/rules"
	if verb == "edit" {
		rows, err := c.routines(ctx)
		if err != nil {
			return err
		}
		r, err := resolveRoutine(rows, pos[0])
		if err != nil {
			return err
		}
		a.target(pos[0], r.ID, r.Name, "edited")
		method, path = http.MethodPatch, "/rules/"+r.ID
	}
	raw, _, err := c.do(ctx, method, path, doc, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var out routineRow
	_ = json.Unmarshal(raw, &out)
	fmt.Fprintln(a.Stdout, out.ID)
	for _, w := range out.Warnings {
		fmt.Fprintf(a.Stderr, "warning: step %s is not available: %s\n", w.Step, w.Message)
	}
	return nil
}

func routineRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("routine rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	pos, err := a.parse(g, fs, "routine rm", args)
	if err != nil {
		return a.helpOr("routine", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot routine rm <id|name> [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], r.ID, r.Name, "deleted")
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete routine %q? What it already did stays.", r.Name))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := c.delete(ctx, "/rules/"+r.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(r.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(r.ID), r.Name)
	return nil
}

func routineUndo(a *App, ctx context.Context, g *globalFlags, args []string) error {
	pos, done, err := a.routineArgs(g, "routine undo", args, 2, "ot routine undo <id|name> <run-id>")
	if err != nil || done {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.routines(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRoutine(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], r.ID, r.Name, "undone")
	raw, _, err := c.do(ctx, http.MethodPost, "/rules/"+r.ID+"/runs/"+url.PathEscape(pos[1])+"/undo", map[string]any{}, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var u struct {
		Restored    int      `json:"restored"`
		Kept        int      `json:"kept"`
		NotUndoable []string `json:"not_undoable"`
	}
	_ = json.Unmarshal(raw, &u)
	fmt.Fprintf(a.Stdout, "%d restored, %d kept because they changed after the run\n", u.Restored, u.Kept)
	if len(u.NotUndoable) > 0 {
		fmt.Fprintf(a.Stdout, "not undone: %s\n", strings.Join(u.NotUndoable, ", "))
	}
	return nil
}
