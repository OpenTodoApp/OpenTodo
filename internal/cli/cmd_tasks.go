package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/inbox"
	"github.com/pixari/opentodo/internal/origin"
	"github.com/pixari/opentodo/internal/quickadd"
	"github.com/pixari/opentodo/internal/recurrence"
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
	// Completion range (OpenSpec change completed-date-filters, design D6).
	completedAfter, completedBefore string
}

func (o *listOptions) bind(fs *flag.FlagSet) {
	fs.BoolVar(&o.inbox, "inbox", false, "the Inbox: tasks without a project that are not scheduled")
	fs.BoolVar(&o.today, "today", false, "due today or earlier, overdue first")
	fs.BoolVar(&o.upcoming, "upcoming", false, "due after today")
	fs.BoolVar(&o.completed, "completed", false, "completed tasks, most recent first")
	fs.BoolVar(&o.all, "all", false, "open and completed tasks")
	fs.StringVar(&o.project, "project", "", "tasks of one project (name or id)")
	fs.IntVar(&o.limit, "limit", 0, "print at most n tasks")
	fs.StringVar(&o.completedAfter, "completed-after", "", "only tasks completed at or after: YYYY-MM-DD (local), an RFC 3339 time or Unix ms")
	fs.StringVar(&o.completedBefore, "completed-before", "", "only tasks completed before: YYYY-MM-DD (local), an RFC 3339 time or Unix ms")
}

// completionRange parses --completed-after and --completed-before as Unix ms
// (0 = open end); a date is local midnight in loc.
func (o *listOptions) completionRange(loc *time.Location) (after, before int64, err error) {
	parse := func(flagName, v string) (int64, error) {
		v = strings.TrimSpace(v)
		if v == "" {
			return 0, nil
		}
		if d, err := time.ParseInLocation("2006-01-02", v, loc); err == nil && d.Format("2006-01-02") == v {
			return d.UnixMilli(), nil
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t.UnixMilli(), nil
		}
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil && ms > 0 {
			return ms, nil
		}
		return 0, usageErr("--%s: use a date (YYYY-MM-DD), an RFC 3339 time or Unix milliseconds (got %q)", flagName, v)
	}
	if after, err = parse("completed-after", o.completedAfter); err != nil {
		return 0, 0, err
	}
	before, err = parse("completed-before", o.completedBefore)
	return after, before, err
}

func (o *listOptions) ranged() bool { return o.completedAfter != "" || o.completedBefore != "" }

func (o *listOptions) view() (string, error) {
	views := []string{}
	for name, on := range map[string]bool{"inbox": o.inbox, "today": o.today, "upcoming": o.upcoming, "completed": o.completed, "all": o.all, "project": o.project != ""} {
		if on {
			views = append(views, "--"+name)
		}
	}
	sort.Strings(views)
	if o.ranged() {
		// A completion range lists completed tasks, of one project or of all.
		for _, v := range views {
			if v != "--completed" && v != "--project" {
				return "", usageErr("--completed-after and --completed-before list completed tasks; drop %s", v)
			}
		}
		if o.project != "" {
			return "project", nil
		}
		return "completed", nil
	}
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
	pos, err := a.parse(g, fs, "list", args)
	if err != nil {
		return a.helpOr("list", err)
	}
	if len(pos) > 0 {
		return usageErr("list takes no arguments (got %q); did you mean --project %q?", pos[0], pos[0])
	}
	if o.limit < 0 {
		return usageErr("--limit must be zero or positive")
	}
	if _, _, err := o.completionRange(a.Now().Location()); err != nil {
		return err
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
		pos, err := a.parse(g, fs, name, args)
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
	var tasks []task
	if o.ranged() {
		after, before, err := o.completionRange(a.Now().Location())
		if err != nil {
			return err
		}
		tasks = completedBetween(all, projects, selected, after, before)
	} else {
		tasks = filterTasks(all, projects, view, selected, today)
	}
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
	// The origin's id or host as a column, only when a listed task has one (task-origin).
	showOrigin := false
	for _, t := range tasks {
		showOrigin = showOrigin || t.originLabel() != ""
	}
	headers := []string{"ID", "P", "DUE", "PROJECT", "TITLE"}
	if showOrigin {
		headers = []string{"ID", "P", "DUE", "PROJECT", "ORIGIN", "TITLE"}
	}
	tbl := newTable(headers...)
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
		cells := []cell{{text: shortID(t.ID), style: styleCyan}, pr, dueCell, plain(projName)}
		if showOrigin {
			cells = append(cells, plain(t.originLabel()))
		}
		tbl.add(append(cells, plain(title))...)
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
	inInbox := inboxRule(all)
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
			if !inInbox(t) {
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

// completedBetween lists the tasks completed in [after, before) (0 = open end),
// most recent first: of the selected project, or of every visible one.
func completedBetween(all []task, projects []project, selected *project, after, before int64) []task {
	visible := map[string]bool{}
	for _, p := range projects {
		visible[p.ID] = !p.Archived && p.DeletedAt == nil
	}
	out := make([]task, 0)
	for _, t := range all {
		if t.DeletedAt != nil || t.CompletedAt == nil {
			continue
		}
		at := int64(*t.CompletedAt)
		if (after != 0 && at < after) || (before != 0 && at >= before) {
			continue
		}
		if selected != nil {
			if t.ProjectID == nil || *t.ProjectID != selected.ID {
				continue
			}
		} else if t.ProjectID != nil && !visible[*t.ProjectID] {
			continue
		}
		out = append(out, t)
	}
	sort.SliceStable(out, func(i, j int) bool { return *out[i].CompletedAt > *out[j].CompletedAt })
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

// resolveTaskRefs resolves every ref before anything changes, so an ambiguous
// ref aborts the whole command. refOf maps each task id to the ref given.
func resolveTaskRefs(all []task, refs []string) ([]*task, map[string]string, error) {
	out := make([]*task, 0, len(refs))
	refOf := map[string]string{}
	for _, ref := range refs {
		t, err := resolveTask(all, ref)
		if err != nil {
			return nil, nil, err
		}
		if _, seen := refOf[t.ID]; !seen {
			refOf[t.ID] = ref
			out = append(out, t)
		}
	}
	return out, refOf, nil
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
	repeat                               string
	// originURL is --origin-url (task-origin): the page or issue the task comes from.
	originURL string
	// add only (quick-add-recurrence D6)
	remind  stringList
	natural bool
	lang    string
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
	fs.StringVar(&f.repeat, "repeat", "", "recurrence rule, e.g. \"every monday\" (edit: `none` clears)")
	fs.StringVar(&f.originURL, "origin-url", "", "http(s) URL the task comes from; GitHub, GitLab, Jira and Linear issues are recognised (edit: `none` clears)")
	if !edit {
		fs.Var(&f.remind, "remind", "reminder: \"30 min before\", \"at 9\", \"tomorrow at 9\" (repeatable)")
		fs.BoolVar(&f.natural, "natural", false, "parse the title like the app's quick add (dates, #project, @label, p1, every …, remind me …)")
		fs.StringVar(&f.lang, "lang", "", "languages for --natural and --remind, e.g. de,en (default: the locale, English always)")
	}
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
	if set["repeat"] && !strings.EqualFold(f.repeat, "none") {
		if _, err := recurrence.Canonicalize(f.repeat); err != nil {
			return usageErr("--repeat: %v", err)
		}
	}
	if set["origin-url"] && !strings.EqualFold(f.originURL, "none") {
		if _, err := origin.FromURL(f.originURL, ""); err != nil {
			return usageErr("--origin-url must be an http or https URL, got %q", f.originURL)
		}
	}
	return nil
}

// addOrigin puts the --origin-url origin into an `ot add` body.
func (f *taskFlags) addOrigin(set map[string]bool, body map[string]any) error {
	if !set["origin-url"] {
		return nil
	}
	if strings.EqualFold(f.originURL, "none") {
		return usageErr("--origin-url none only makes sense with `ot edit`")
	}
	body["origin"] = f.originValue()
	return nil
}

// originValue is the origin --origin-url sends: derived on this machine through
// internal/origin (nothing is requested from the URL), or nil for `none`.
func (f *taskFlags) originValue() any {
	if strings.EqualFold(f.originURL, "none") {
		return nil
	}
	o, _ := origin.FromURL(f.originURL, "")
	return o
}

// quickLanguages are the --lang languages, else the locale's (LC_ALL,
// LC_MESSAGES, LANG); English is always added by the parser.
func (a *App) quickLanguages(flagValue string) []string {
	if flagValue != "" {
		return strings.Split(flagValue, ",")
	}
	for _, k := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if v := a.Getenv(k); v != "" && v != "C" && v != "POSIX" {
			return []string{strings.SplitN(v, ".", 2)[0]}
		}
	}
	return nil
}

func (a *App) quickContext(langs []string, projects []project) quickadd.Context {
	now := a.Now()
	var ps []quickadd.Project
	for _, p := range projects {
		ps = append(ps, quickadd.Project{ID: p.ID, Name: p.Name, Archived: p.Archived})
	}
	// The CLI cannot read the user's preferences: weeks start on Monday and
	// numeric dates follow the first language (design D7).
	return quickadd.Context{Today: localDate(now), Now: now.Format("15:04"), Languages: langs, Projects: ps}
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
	key := fs.String("idempotency-key", "", "retry-safe create")
	pos, err := a.parse(g, fs, "add", args)
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
	headers, err := idempotencyHeaders(set["idempotency-key"], *key)
	if err != nil {
		return err
	}
	langs := a.quickLanguages(f.lang)
	var phrases []quickadd.Reminder
	for _, p := range f.remind {
		r, ok := quickadd.ParseReminder(p, a.quickContext(langs, nil))
		if !ok {
			return usageErr("--remind %q: use an offset such as \"30 min before\" or a moment such as \"at 9\" or \"tomorrow at 9\"", p)
		}
		phrases = append(phrases, r)
	}
	body := map[string]any{"title": title}
	if set["repeat"] {
		body["recurrence"], _ = recurrence.Canonicalize(f.repeat)
	}
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
	if err := f.addOrigin(set, body); err != nil {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	labelRefs, spent := []string(f.labels), 0
	if f.natural {
		if labelRefs, phrases, spent, err = a.applyNatural(ctx, c, title, langs, body, set, &f, phrases); err != nil {
			return err
		}
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
	if len(labelRefs) > 0 {
		ids, err := c.resolveLabels(ctx, labelRefs)
		if err != nil {
			return err
		}
		body["labels"] = ids
	}
	raw, _, err := c.do(ctx, "POST", "/tasks", body, headers)
	if err != nil {
		return err
	}
	var created task
	_ = json.Unmarshal(raw, &created)
	waiting, err := a.createReminders(ctx, c, created.ID, body, phrases, set["idempotency-key"], *key)
	if err != nil {
		return err
	}
	if err := a.logSpent(ctx, c, created.ID, spent, set["idempotency-key"], *key); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	fmt.Fprintln(a.Stdout, created.ID)
	if waiting > 0 {
		fmt.Fprintf(a.Stderr, "%d reminder(s) will fire once the task has a due date\n", waiting)
	}
	return nil
}

// createReminders posts one reminder per phrase after the task, resolved
// against its due like quick add (design D6). With an idempotency key K the
// n-th reminder sends K.r<n>, so a retry converges to one set. It returns how
// many relative reminders wait for a due date.
func (a *App) createReminders(ctx context.Context, c *client, taskID string, body map[string]any, phrases []quickadd.Reminder, keyed bool, key string) (int, error) {
	if len(phrases) == 0 {
		return 0, nil
	}
	now := a.Now()
	dueDate, dueTime := "", ""
	if d, ok := body["due"].(due); ok {
		dueDate = d.Date
		if d.Time != nil {
			dueTime = *d.Time
		}
	}
	waiting := 0
	for n, p := range phrases {
		res := quickadd.Resolve(p, dueDate, dueTime, localDate(now), now.Format("15:04"))
		rb := map[string]any{"task_id": taskID}
		if res.Relative {
			rb["kind"], rb["offset_minutes"] = "relative", res.OffsetMinutes
			if dueDate == "" {
				waiting++
			}
		} else {
			at, err := time.ParseInLocation("2006-01-02 15:04", res.Date+" "+res.Time, now.Location())
			if err != nil {
				return 0, err
			}
			rb["kind"], rb["fire_at"] = "absolute", at.UnixMilli()
		}
		var headers map[string]string
		if keyed {
			headers = map[string]string{"Idempotency-Key": fmt.Sprintf("%s.r%d", key, n+1)}
		}
		if _, _, err := c.do(ctx, "POST", "/reminders", rb, headers); err != nil {
			var ee *exitError
			if errors.As(err, &ee) {
				return 0, &exitError{code: ee.code, jsonCode: ee.jsonCode, envelope: ee.envelope,
					msg: fmt.Sprintf("%s (the task was created: %s; add the reminder in the app or with the API)", ee.msg, taskID)}
			}
			return 0, fmt.Errorf("%w (the task was created: %s)", err, taskID)
		}
	}
	return waiting, nil
}

func cmdEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("edit", g)
	var f taskFlags
	f.bind(fs, true)
	pos, err := a.parse(g, fs, "edit", args)
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
	if set["origin-url"] {
		patch["origin"] = f.originValue()
	}
	if set["repeat"] {
		if strings.EqualFold(f.repeat, "none") || f.repeat == "" {
			patch["recurrence"] = nil
		} else {
			patch["recurrence"], _ = recurrence.Canonicalize(f.repeat)
		}
	}
	clearDue := set["due"] && strings.EqualFold(f.dueWord, "none")
	newDate := ""
	if set["due"] && !clearDue {
		if newDate, err = resolveDate(f.dueWord, a.Now()); err != nil {
			return err
		}
	}
	if !set["title"] && !set["priority"] && !set["label"] && !set["note"] && !set["due"] && !set["time"] && !set["project"] && !set["repeat"] && !set["origin-url"] {
		return usageErr("nothing to change; pass at least one of --title, --project, --due, --time, --priority, --label, --note, --repeat, --origin-url")
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
	// Values equal to the current ones send nothing (design D5).
	if patchIsNoop(t.Raw, patch) {
		a.target(pos[0], t.ID, t.Title, "unchanged")
		if g.json {
			return a.printJSON(t.Raw)
		}
		fmt.Fprintf(a.Stdout, "unchanged  %s  %s\n", shortID(t.ID), t.Title)
		return nil
	}
	a.target(pos[0], t.ID, t.Title, "")
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

// patchIsNoop reports whether every patched field already holds that value.
func patchIsNoop(current json.RawMessage, patch map[string]any) bool {
	var cur map[string]json.RawMessage
	if json.Unmarshal(current, &cur) != nil {
		return false
	}
	for f, v := range patch {
		want, err := json.Marshal(v)
		if err != nil || !sameJSON(cur[f], want) {
			return false
		}
	}
	return true
}

// sameJSON compares two JSON values structurally (a missing value is null).
func sameJSON(a, b json.RawMessage) bool {
	var x, y any
	if len(a) == 0 {
		a = json.RawMessage("null")
	}
	if len(b) == 0 {
		b = json.RawMessage("null")
	}
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	ja, _ := json.Marshal(x)
	jb, _ := json.Marshal(y)
	return string(ja) == string(jb)
}

// withStatus adds the command-line reference and the outcome to an entity
// for done, reopen and rm (schema task_result).
func withStatus(raw json.RawMessage, ref, status string) json.RawMessage {
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil || m == nil {
		m = map[string]json.RawMessage{}
	}
	m["ref"], _ = json.Marshal(ref)
	m["status"], _ = json.Marshal(status)
	return encodeCompact(m)
}

// idempotencyHeaders validates --idempotency-key locally (exit 2) and returns
// the Idempotency-Key header for it.
func idempotencyHeaders(given bool, key string) (map[string]string, error) {
	if !given {
		return nil, nil
	}
	if !validIdempotencyKey(key) {
		return nil, usageErr("--idempotency-key must be 1 to 128 characters of letters, digits and . _ : -")
	}
	return map[string]string{"Idempotency-Key": key}, nil
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
	refs, err := a.parse(g, fs, name, args)
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
	targets, refOf, err := resolveTaskRefs(all, refs)
	if err != nil {
		return err
	}
	var value any
	status := "reopened"
	if complete {
		value = a.Now().UnixMilli()
		status = "completed"
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, t := range targets {
		// Already in the requested state: report it, send nothing (design D5).
		if (t.CompletedAt != nil) == complete {
			a.target(refOf[t.ID], t.ID, t.Title, "unchanged")
			results = append(results, withStatus(t.Raw, refOf[t.ID], "unchanged"))
			if !g.json {
				fmt.Fprintf(a.Stdout, "%-8s %s  %s\n", "unchanged", shortID(t.ID), t.Title)
			}
			continue
		}
		a.target(refOf[t.ID], t.ID, t.Title, status)
		var raw json.RawMessage
		if err := c.patchJSON(ctx, "/tasks/"+t.ID, map[string]any{"completed_at": value}, &raw); err != nil {
			return err
		}
		results = append(results, withStatus(raw, refOf[t.ID], status))
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
	refs, err := a.parse(g, fs, "rm", args)
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
	targets, refOf, err := resolveTaskRefs(all, refs)
	if err != nil {
		return err
	}
	// Off a terminal or with --json, a.parse already refused without --yes.
	if !*yes && !a.dryRun() {
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
		a.target(refOf[t.ID], t.ID, t.Title, "deleted")
		if err := c.delete(ctx, "/tasks/"+t.ID); err != nil {
			return err
		}
		results = append(results, withStatus(t.Raw, refOf[t.ID], "deleted"))
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

// inboxTask is the part of a task the Inbox rule reads (internal/inbox).
func inboxTask(t task) inbox.Task {
	it := inbox.Task{HasDue: t.Due != nil, Completed: t.CompletedAt != nil, Deleted: t.DeletedAt != nil}
	if t.ProjectID != nil {
		it.ProjectID = *t.ProjectID
	}
	if t.Start != nil {
		it.Start = *t.Start
	}
	if t.ParentID != nil {
		it.ParentID = *t.ParentID
	}
	return it
}

// inboxRule returns the Inbox rule (internal/inbox, OpenSpec change inbox-means-unplaced)
// over all: open, live, not placed, and no placed parent.
func inboxRule(all []task) func(task) bool {
	byID := make(map[string]task, len(all))
	for _, t := range all {
		byID[t.ID] = t
	}
	parentOf := func(id string) (inbox.Task, bool) {
		p, ok := byID[id]
		if !ok {
			return inbox.Task{}, false
		}
		return inboxTask(p), true
	}
	return func(t task) bool { return inbox.IsTask(inboxTask(t), parentOf) }
}
