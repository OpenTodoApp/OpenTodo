package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"sort"
	"strings"
)

// stringList is a repeatable string flag.
type stringList []string

func (l *stringList) String() string     { return strings.Join(*l, ",") }
func (l *stringList) Set(v string) error { *l = append(*l, v); return nil }

// ---- list ----

type listOptions struct {
	inbox, today, upcoming, completed, all bool
	project                                string
	limit                                  int
}

func (o *listOptions) bind(fs *flag.FlagSet) {
	fs.BoolVar(&o.inbox, "inbox", false, "tasks without a project")
	fs.BoolVar(&o.today, "today", false, "due today or earlier, overdue first")
	fs.BoolVar(&o.upcoming, "upcoming", false, "due after today")
	fs.BoolVar(&o.completed, "completed", false, "completed tasks, most recent first")
	fs.BoolVar(&o.all, "all", false, "open and completed tasks")
	fs.StringVar(&o.project, "project", "", "tasks of one project (name or id)")
	fs.IntVar(&o.limit, "limit", 0, "print at most n tasks")
}

func (o *listOptions) view() (string, error) {
	views := []string{}
	for name, on := range map[string]bool{"inbox": o.inbox, "today": o.today, "upcoming": o.upcoming, "completed": o.completed, "all": o.all, "project": o.project != ""} {
		if on {
			views = append(views, "--"+name)
		}
	}
	sort.Strings(views)
	switch len(views) {
	case 0:
		return "open", nil
	case 1:
		return strings.TrimPrefix(views[0], "--"), nil
	}
	return "", usageErr("choose one of %s", strings.Join(views, ", "))
}

func cmdList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("list", g)
	var o listOptions
	o.bind(fs)
	pos, err := parseArgs(fs, "list", args)
	if err != nil {
		return a.helpOr("list", err)
	}
	if len(pos) > 0 {
		return usageErr("list takes no arguments (got %q); did you mean --project %q?", pos[0], pos[0])
	}
	if o.limit < 0 {
		return usageErr("--limit must be zero or positive")
	}
	return runList(a, ctx, g, &o)
}

// viewAlias builds `ot today`, `ot inbox` and `ot upcoming`: the list command with
// the filter preset.
func viewAlias(name string) func(a *App, ctx context.Context, g *globalFlags, args []string) error {
	return func(a *App, ctx context.Context, g *globalFlags, args []string) error {
		fs := a.flagSet(name, g)
		var o listOptions
		fs.IntVar(&o.limit, "limit", 0, "print at most n tasks")
		pos, err := parseArgs(fs, name, args)
		if err != nil {
			return a.helpOr(name, err)
		}
		if len(pos) > 0 {
			return usageErr("%s takes no arguments (got %q)", name, pos[0])
		}
		switch name {
		case "today":
			o.today = true
		case "inbox":
			o.inbox = true
		default:
			o.upcoming = true
		}
		return runList(a, ctx, g, &o)
	}
}

func runList(a *App, ctx context.Context, g *globalFlags, o *listOptions) error {
	view, err := o.view()
	if err != nil {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	projects, err := c.projects(ctx)
	if err != nil {
		return err
	}
	var selected *project
	if view == "project" {
		if selected, err = findProject(projects, o.project); err != nil {
			return err
		}
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	today := localDate(a.Now())
	for i := range all {
		all[i].Due = all[i].Due.inZone(a.Now().Location())
	}
	tasks := filterTasks(all, projects, view, selected, today)
	if o.limit > 0 && len(tasks) > o.limit {
		tasks = tasks[:o.limit]
	}
	if g.json {
		raws := make([]json.RawMessage, 0, len(tasks))
		for _, t := range tasks {
			raws = append(raws, t.Raw)
		}
		return a.printRawList(raws)
	}
	if len(tasks) == 0 {
		fmt.Fprintln(a.Stdout, "No tasks.")
		return nil
	}
	byID := map[string]project{}
	for _, p := range projects {
		byID[p.ID] = p
	}
	tbl := newTable("ID", "P", "DUE", "PROJECT", "TITLE")
	for _, t := range tasks {
		dueText, overdue := describeDue(t.Due, today)
		dueCell := plain(dueText)
		if overdue {
			dueCell.style = styleRed
		} else if t.Due != nil && t.Due.Date == today {
			dueCell.style = styleBold
		}
		pr := plain(fmt.Sprintf("P%d", t.Priority))
		if t.Priority == 1 {
			pr.style = styleRed
		}
		projName := ""
		if t.ProjectID != nil {
			if p, ok := byID[*t.ProjectID]; ok {
				projName = p.Name
			}
		}
		title := t.Title
		if t.CompletedAt != nil {
			title = "[done] " + title
		}
		tbl.add(cell{text: shortID(t.ID), style: styleCyan}, pr, dueCell, plain(projName), plain(title))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

// filterTasks applies one view the way the web app does. Tasks of archived or
// missing projects stay out of cross-project views.
func filterTasks(all []task, projects []project, view string, selected *project, today string) []task {
	visible := map[string]bool{}
	for _, p := range projects {
		visible[p.ID] = !p.Archived && p.DeletedAt == nil
	}
	out := make([]task, 0, len(all))
	for _, t := range all {
		if t.DeletedAt != nil {
			continue
		}
		if view == "project" {
			if t.ProjectID == nil || *t.ProjectID != selected.ID || t.CompletedAt != nil {
				continue
			}
			out = append(out, t)
			continue
		}
		if t.ProjectID != nil && !visible[*t.ProjectID] {
			continue
		}
		open := t.CompletedAt == nil
		switch view {
		case "inbox":
			if !open || t.ProjectID != nil {
				continue
			}
		case "today":
			if !open || t.Due == nil || t.Due.Date > today {
				continue
			}
		case "upcoming":
			if !open || t.Due == nil || t.Due.Date <= today {
				continue
			}
		case "completed":
			if open {
				continue
			}
		case "all":
		default: // open
			if !open {
				continue
			}
		}
		out = append(out, t)
	}
	switch view {
	case "inbox", "project":
		sort.SliceStable(out, func(i, j int) bool { return byPosition(out[i], out[j]) })
	case "completed":
		sort.SliceStable(out, func(i, j int) bool { return *out[i].CompletedAt > *out[j].CompletedAt })
	default:
		sort.SliceStable(out, func(i, j int) bool { return byDueThenPriority(out[i], out[j]) })
	}
	return out
}

func byPosition(a, b task) bool {
	if a.Position != b.Position {
		return a.Position < b.Position
	}
	return a.CreatedAt < b.CreatedAt
}

func compareDue(a, b *due) int {
	switch {
	case a == nil && b == nil:
		return 0
	case a == nil:
		return 1
	case b == nil:
		return -1
	case a.Date != b.Date:
		return strings.Compare(a.Date, b.Date)
	}
	ta, tb := "99:99", "99:99"
	if a.Time != nil {
		ta = *a.Time
	}
	if b.Time != nil {
		tb = *b.Time
	}
	return strings.Compare(ta, tb)
}

func byDueThenPriority(a, b task) bool {
	if c := compareDue(a.Due, b.Due); c != 0 {
		return c < 0
	}
	if a.Priority != b.Priority {
		return a.Priority < b.Priority
	}
	return byPosition(a, b)
}

// ---- reference resolution ----

// resolveTask matches a full id, then a unique prefix, among the given (non-deleted) tasks.
func resolveTask(all []task, ref string) (*task, error) {
	if ref == "" {
		return nil, usageErr("empty task reference")
	}
	var matches []*task
	for i := range all {
		t := &all[i]
		if t.DeletedAt != nil {
			continue
		}
		if t.ID == ref {
			return t, nil
		}
		if strings.HasPrefix(t.ID, ref) {
			matches = append(matches, t)
		}
	}
	switch len(matches) {
	case 0:
		return nil, usageErr("no task matches %q", ref)
	case 1:
		return matches[0], nil
	}
	lines := make([]string, 0, len(matches))
	for _, m := range matches {
		lines = append(lines, fmt.Sprintf("  %s  %s", m.ID, m.Title))
	}
	return nil, usageErr("%q is ambiguous; it matches %d tasks:\n%s\nUse a longer prefix or the full id.", ref, len(matches), strings.Join(lines, "\n"))
}

// resolveTasks resolves every ref before anything changes, so an ambiguous ref
// aborts the whole command.
func resolveTasks(all []task, refs []string) ([]*task, error) {
	out := make([]*task, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		t, err := resolveTask(all, ref)
		if err != nil {
			return nil, err
		}
		if !seen[t.ID] {
			seen[t.ID] = true
			out = append(out, t)
		}
	}
	return out, nil
}

// findProject matches a project by name (case-insensitive), full id or unique id prefix.
func findProject(ps []project, ref string) (*project, error) {
	var byName []*project
	var byPrefix []*project
	for i := range ps {
		p := &ps[i]
		if p.DeletedAt != nil {
			continue
		}
		if p.ID == ref {
			return p, nil
		}
		if strings.EqualFold(p.Name, ref) {
			byName = append(byName, p)
		}
		if strings.HasPrefix(p.ID, ref) {
			byPrefix = append(byPrefix, p)
		}
	}
	if len(byName) == 1 {
		return byName[0], nil
	}
	if len(byName) > 1 {
		return nil, usageErr("%d projects are named %q; use the id (see `ot project list`)", len(byName), ref)
	}
	if len(byPrefix) == 1 {
		return byPrefix[0], nil
	}
	if len(byPrefix) > 1 {
		return nil, usageErr("%q matches several project ids; use a longer prefix", ref)
	}
	names := sortedNames(ps)
	if len(names) == 0 {
		return nil, usageErr("no project %q; there are no projects yet (create one with `ot project add <name>`)", ref)
	}
	return nil, usageErr("no project %q. Available projects: %s", ref, strings.Join(names, ", "))
}

// ---- add / edit ----

type taskFlags struct {
	title, project, dueWord, clock, note string
	priority                             int
	labels                               stringList
}

func (f *taskFlags) bind(fs *flag.FlagSet, edit bool) {
	if edit {
		fs.StringVar(&f.title, "title", "", "new title")
	}
	fs.StringVar(&f.project, "project", "", "project name or id (edit: `none` moves to Inbox)")
	fs.StringVar(&f.dueWord, "due", "", "YYYY-MM-DD, today, tomorrow or a weekday (edit: `none` clears)")
	fs.StringVar(&f.clock, "time", "", "due time HH:MM")
	fs.IntVar(&f.priority, "priority", 0, "1 (highest) to 4 (lowest)")
	fs.Var(&f.labels, "label", "label (repeatable; edit replaces the list)")
	fs.StringVar(&f.note, "note", "", "description")
}

// validateLocal checks everything that needs no server round trip.
func (f *taskFlags) validateLocal(set map[string]bool) error {
	if set["priority"] && (f.priority < 1 || f.priority > 4) {
		return usageErr("--priority must be 1 (highest) to 4 (lowest), got %d", f.priority)
	}
	if set["time"] && f.clock != "" {
		if err := validClock(f.clock); err != nil {
			return err
		}
	}
	return nil
}

func visited(fs *flag.FlagSet) map[string]bool {
	set := map[string]bool{}
	fs.Visit(func(fl *flag.Flag) { set[fl.Name] = true })
	return set
}

func cmdAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("add", g)
	var f taskFlags
	f.bind(fs, false)
	pos, err := parseArgs(fs, "add", args)
	if err != nil {
		return a.helpOr("add", err)
	}
	title := strings.TrimSpace(strings.Join(pos, " "))
	if title == "" {
		return usageErr("usage: ot add <title> [flags]")
	}
	set := visited(fs)
	if err := f.validateLocal(set); err != nil {
		return err
	}
	body := map[string]any{"title": title}
	if set["due"] || set["time"] {
		d := due{}
		if set["due"] {
			if strings.EqualFold(f.dueWord, "none") {
				return usageErr("--due none only makes sense with `ot edit`")
			}
			if d.Date, err = resolveDate(f.dueWord, a.Now()); err != nil {
				return err
			}
		} else {
			d.Date = localDate(a.Now())
		}
		if f.clock != "" {
			d.Time = &f.clock
		}
		body["due"] = d
	}
	if set["priority"] {
		body["priority"] = f.priority
	}
	if set["note"] {
		body["description"] = f.note
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	if f.project != "" && !strings.EqualFold(f.project, "none") {
		projects, err := c.projects(ctx)
		if err != nil {
			return err
		}
		p, err := findProject(projects, f.project)
		if err != nil {
			return err
		}
		body["project_id"] = p.ID
	}
	if len(f.labels) > 0 {
		ids, err := c.resolveLabels(ctx, f.labels)
		if err != nil {
			return err
		}
		body["labels"] = ids
	}
	var raw json.RawMessage
	if err := c.postJSON(ctx, "/tasks", body, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var created task
	_ = json.Unmarshal(raw, &created)
	fmt.Fprintln(a.Stdout, created.ID)
	return nil
}

func cmdEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("edit", g)
	var f taskFlags
	f.bind(fs, true)
	pos, err := parseArgs(fs, "edit", args)
	if err != nil {
		return a.helpOr("edit", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot edit <ref> [flags]")
	}
	set := visited(fs)
	if err := f.validateLocal(set); err != nil {
		return err
	}
	patch := map[string]any{}
	if set["title"] {
		if strings.TrimSpace(f.title) == "" {
			return usageErr("--title cannot be empty")
		}
		patch["title"] = f.title
	}
	if set["priority"] {
		patch["priority"] = f.priority
	}
	if set["note"] {
		patch["description"] = f.note
	}
	clearDue := set["due"] && strings.EqualFold(f.dueWord, "none")
	newDate := ""
	if set["due"] && !clearDue {
		if newDate, err = resolveDate(f.dueWord, a.Now()); err != nil {
			return err
		}
	}
	if !set["title"] && !set["priority"] && !set["label"] && !set["note"] && !set["due"] && !set["time"] && !set["project"] {
		return usageErr("nothing to change; pass at least one of --title, --project, --due, --time, --priority, --label, --note")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	if set["project"] {
		if strings.EqualFold(f.project, "none") || f.project == "" {
			patch["project_id"] = nil
		} else {
			projects, err := c.projects(ctx)
			if err != nil {
				return err
			}
			p, err := findProject(projects, f.project)
			if err != nil {
				return err
			}
			patch["project_id"] = p.ID
		}
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	t, err := resolveTask(all, pos[0])
	if err != nil {
		return err
	}
	if set["label"] {
		ids, err := c.resolveLabels(ctx, f.labels)
		if err != nil {
			return err
		}
		patch["labels"] = ids
	}
	switch {
	case clearDue:
		patch["due"] = nil
	case set["due"] || set["time"]:
		d := due{}
		if t.Due != nil {
			// A zoned due is edited as shown here and converted back to its zone.
			d = *t.Due.inZone(a.Now().Location())
		}
		if newDate != "" {
			d.Date = newDate
		}
		if set["time"] {
			if f.clock == "" {
				d.Time = nil
			} else {
				d.Time = &f.clock
			}
		}
		if d.Date == "" {
			return usageErr("task %s has no due date; pass --due together with --time", shortID(t.ID))
		}
		patch["due"] = d.rezone(a.Now().Location())
	}
	var raw json.RawMessage
	if err := c.patchJSON(ctx, "/tasks/"+t.ID, patch, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var updated task
	_ = json.Unmarshal(raw, &updated)
	fmt.Fprintf(a.Stdout, "updated  %s  %s\n", shortID(updated.ID), updated.Title)
	return nil
}

// ---- done / reopen / rm ----

func cmdDone(a *App, ctx context.Context, g *globalFlags, args []string) error {
	return setCompleted(a, ctx, g, args, "done", true)
}

func cmdReopen(a *App, ctx context.Context, g *globalFlags, args []string) error {
	return setCompleted(a, ctx, g, args, "reopen", false)
}

func setCompleted(a *App, ctx context.Context, g *globalFlags, args []string, name string, complete bool) error {
	fs := a.flagSet(name, g)
	refs, err := parseArgs(fs, name, args)
	if err != nil {
		return a.helpOr(name, err)
	}
	if len(refs) == 0 {
		return usageErr("usage: ot %s <ref>...", name)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	targets, err := resolveTasks(all, refs)
	if err != nil {
		return err
	}
	var value any
	if complete {
		value = a.Now().UnixMilli()
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, t := range targets {
		var raw json.RawMessage
		if err := c.patchJSON(ctx, "/tasks/"+t.ID, map[string]any{"completed_at": value}, &raw); err != nil {
			return err
		}
		results = append(results, raw)
		if !g.json {
			fmt.Fprintf(a.Stdout, "%-8s %s  %s\n", name, shortID(t.ID), t.Title)
		}
	}
	if g.json {
		if len(results) == 1 {
			return a.printJSON(results[0])
		}
		return a.printRawList(results)
	}
	return nil
}

func cmdRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	refs, err := parseArgs(fs, "rm", args)
	if err != nil {
		return a.helpOr("rm", err)
	}
	if len(refs) == 0 {
		return usageErr("usage: ot rm <ref>... [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	targets, err := resolveTasks(all, refs)
	if err != nil {
		return err
	}
	if !*yes && !g.json {
		for _, t := range targets {
			fmt.Fprintf(a.Stderr, "  %s  %s\n", shortID(t.ID), t.Title)
		}
		ok, err := a.confirm(fmt.Sprintf("Delete %d task(s)?", len(targets)))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, t := range targets {
		if err := c.delete(ctx, "/tasks/"+t.ID); err != nil {
			return err
		}
		results = append(results, t.Raw)
		if !g.json {
			fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(t.ID), t.Title)
		}
	}
	if g.json {
		if len(results) == 1 {
			return a.printJSON(results[0])
		}
		return a.printRawList(results)
	}
	return nil
}
