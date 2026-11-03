package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/email"
)

// Vikunja: the ZIP from Settings → Export your data (OpenSpec change
// migration-everywhere, design D2). It holds VERSION, data.json (an array of
// projects with their tasks nested), filters.json and files/<file id> for each
// attachment. Verified against exports of Vikunja 0.22.1 and 2.7.1: 0.22 keeps
// a project's Kanban buckets on the project (task.bucket_id, the project's
// done_bucket_id), later versions on the project's Kanban view
// (project.task_buckets, the view's done_bucket_id).

const vikunjaFormat = "vikunja-export"

// vikunjaZero is how Vikunja writes an unset date.
const vikunjaZero = "0001-01-01T00:00:00Z"

type vikunjaProfile struct{}

func (vikunjaProfile) Name() string { return vikunjaFormat }
func (vikunjaProfile) Description() string {
	return "Vikunja: the ZIP from Settings → Export your data"
}

// Detect accepts data.json: an array of project objects, each with id, title,
// tasks and hex_color (the ZIP itself is routed by parseArchive).
func (vikunjaProfile) Detect(data []byte) bool {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || data[0] != '[' {
		return false
	}
	var list []map[string]json.RawMessage
	if json.Unmarshal(data, &list) != nil || len(list) == 0 {
		return false
	}
	for _, p := range list {
		for _, k := range []string{"id", "title", "tasks", "hex_color"} {
			if _, ok := p[k]; !ok {
				return false
			}
		}
	}
	return true
}

// isVikunjaArchive reports whether the entries are a Vikunja export: VERSION
// and a data.json the profile accepts, at the archive's top level.
func isVikunjaArchive(entries []archiveEntry) (data []byte, ok bool) {
	hasVersion := false
	for _, e := range entries {
		switch e.name {
		case "VERSION":
			hasVersion = true
		case "data.json":
			data = e.data
		}
	}
	return data, hasVersion && data != nil && (vikunjaProfile{}).Detect(data)
}

// vikunjaFiles are the attachment files of the export by file id.
func vikunjaFiles(entries []archiveEntry) map[string][]byte {
	out := map[string][]byte{}
	for _, e := range entries {
		if dir, name := path.Split(e.name); dir == "files/" && name != "" {
			out[name] = e.data
		}
	}
	return out
}

func (vikunjaProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	list := asList(v)
	if list == nil {
		return nil, &FileError{"expected the array of projects of a Vikunja data.json"}
	}
	vr := &vikunjaReader{opts: opts, loc: opts.Location(), out: &Parsed{}}
	var projects []obj
	for i, p := range list {
		o := asObj(p)
		if o == nil {
			vr.out.Rows = append(vr.out.Rows, Row{Line: i + 1, Kind: KindProject, Err: fmt.Sprintf("project #%d is not an object", i+1)})
			continue
		}
		projects = append(projects, o)
	}
	// The array's order is not the user's: projects by their position, then id.
	sort.SliceStable(projects, func(i, j int) bool {
		pi, pj := num(projects[i]["position"]), num(projects[j]["position"])
		if pi != pj {
			return pi < pj
		}
		return num(projects[i]["id"]) < num(projects[j]["id"])
	})
	if opts.vikunjaFiles == nil {
		vr.noFiles = true
	}
	for _, p := range projects {
		vr.project(p)
		if len(vr.out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	if vr.inbox != "" && vr.inboxTasks > 0 {
		vr.out.Notes = append(vr.out.Notes, fmt.Sprintf("the project %q is Vikunja's default project; its tasks go to the target project (the Inbox unless you choose one)", vr.inbox))
	}
	return vr.out, nil
}

type vikunjaReader struct {
	opts    Options
	loc     *time.Location
	out     *Parsed
	line    int
	inbox   string
	noFiles bool
	// inboxTasks counts the tasks of the default project.
	inboxTasks int
}

func num(v any) float64 {
	switch t := v.(type) {
	case json.Number:
		f, _ := t.Float64()
		return f
	case float64:
		return t
	}
	return 0
}

// project appends the project's row (none for the default Inbox) and its tasks.
func (vr *vikunjaReader) project(p obj) {
	vr.line++
	id := p.str("id")
	source := "vikunja:project:" + id
	title := p.str("title")
	parent := p.str("parent_project_id")
	if strings.EqualFold(title, "Inbox") && (parent == "" || parent == "0") && vr.inbox == "" {
		// Vikunja creates an Inbox for every account: its tasks are the importer's inbox.
		vr.inbox, source = title, ""
	} else {
		row := Row{Line: vr.line, Kind: KindProject, SourceID: source, Title: title,
			Description: email.HTMLToMarkdown(p.str("description")), Archived: p.boolean("is_archived")}
		if parent != "" && parent != "0" {
			row.ParentSourceID = "vikunja:project:" + parent
		}
		if row.Title == "" {
			row.fail("project title is required")
		}
		vr.out.Rows = append(vr.out.Rows, row)
	}
	sections, order := vikunjaBoard(p)
	tasks := asList(p["tasks"])
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := asObj(tasks[i]), asObj(tasks[j])
		oa, ob := order(a), order(b)
		if oa != ob {
			return oa < ob
		}
		return num(a["id"]) < num(b["id"])
	})
	board := false
	for ti, t := range tasks {
		o := asObj(t)
		vr.line++
		if o == nil {
			row := Row{Line: vr.line, Kind: KindTask, ProjectSourceID: source}
			row.fail("task #%d of %q is not an object", ti+1, title)
			vr.out.Rows = append(vr.out.Rows, row)
			continue
		}
		row := vr.task(o, source)
		if source == "" {
			vr.inboxTasks++
		}
		if source != "" && !row.Completed {
			row.SectionName = sections(o)
			board = board || row.SectionName != ""
		}
		vr.out.Rows = append(vr.out.Rows, row)
	}
	if board {
		vr.out.ViewHints = append(vr.out.ViewHints, ViewHint{ProjectSourceID: source, View: "board"})
	}
}

// vikunjaBoard reads the project's first Kanban view: the bucket of each task
// (except the done bucket) and each task's order. When the open tasks all sit
// in one bucket the project never used its board, and no section is made.
func vikunjaBoard(p obj) (section func(obj) string, order func(obj) float64) {
	bucketName := map[string]string{}
	taskBucket := map[string]string{}
	done := ""
	position := map[string]float64{}
	view := ""
	// Vikunja 0.23 and later: buckets belong to the project's Kanban views.
	var kanban obj
	for _, v := range asList(p["views"]) {
		o := asObj(v)
		if o == nil {
			continue
		}
		if o.str("view_kind") == "kanban" && (kanban == nil || num(o["position"]) < num(kanban["position"])) {
			kanban = o
		}
		if o.str("view_kind") == "list" && view == "" {
			view = o.str("id")
		}
	}
	if kanban != nil {
		kid := kanban.str("id")
		done = kanban.str("done_bucket_id")
		for _, b := range asList(p["buckets"]) {
			if o := asObj(b); o != nil && o.str("project_view_id") == kid {
				bucketName[o.str("id")] = o.str("title")
			}
		}
		for _, tb := range asList(p["task_buckets"]) {
			if o := asObj(tb); o != nil && o.str("project_view_id") == kid {
				taskBucket[o.str("task_id")] = o.str("bucket_id")
			}
		}
		for _, ps := range asList(p["positions"]) {
			if o := asObj(ps); o != nil && o.str("project_view_id") == view {
				position[o.str("task_id")] = num(o["position"])
			}
		}
	} else {
		// Vikunja 0.22: buckets belong to the project, tasks name theirs.
		done = p.str("done_bucket_id")
		for _, b := range asList(p["buckets"]) {
			if o := asObj(b); o != nil {
				bucketName[o.str("id")] = o.str("title")
			}
		}
		for _, t := range asList(p["tasks"]) {
			if o := asObj(t); o != nil {
				taskBucket[o.str("id")] = o.str("bucket_id")
				position[o.str("id")] = num(o["position"])
			}
		}
	}
	used := map[string]bool{}
	for _, t := range asList(p["tasks"]) {
		o := asObj(t)
		if o == nil || o.boolean("done") {
			continue
		}
		if b := taskBucket[o.str("id")]; b != "" && b != "0" && b != done && bucketName[b] != "" {
			used[b] = true
		}
	}
	section = func(t obj) string {
		b := taskBucket[t.str("id")]
		if len(used) < 2 || !used[b] {
			return ""
		}
		return bucketName[b]
	}
	order = func(t obj) float64 { return position[t.str("id")] }
	return section, order
}

// task reads one Vikunja task.
func (vr *vikunjaReader) task(o obj, project string) Row {
	id := o.str("id")
	row := Row{Line: vr.line, Kind: KindTask, SourceID: "vikunja:" + id, Title: o.str("title"), ProjectSourceID: project}
	row.Origin = importedOrigin("vikunja", row.SourceID)
	if row.Title == "" {
		row.fail("title is required")
	}
	row.Description = email.HTMLToMarkdown(o.str("description"))
	row.Completed = o.boolean("done")
	if row.Completed {
		at := vr.instant(o.str("done_at"))
		if at == 0 {
			at = vr.instant(o.str("updated"))
		}
		row.CompletedAt = at
	}
	row.CreatedAt = vr.instant(o.str("created"))
	if due, ok := vr.floating(o.str("due_date")); ok {
		row.Due = due
	}
	if start, ok := vr.floating(o.str("start_date")); ok {
		row.Start = start.Date
	}
	if _, ok := vr.floating(o.str("end_date")); ok {
		row.warn("end date dropped (OpenTodo has a due date and a start date)")
	}
	row.Priority = map[string]int{"5": 1, "4": 1, "3": 2, "2": 3}[o.str("priority")]
	for _, l := range asList(o["labels"]) {
		if lo := asObj(l); lo != nil && lo.str("title") != "" {
			row.Labels = append(row.Labels, lo.str("title"))
		}
	}
	row.Labels = dedupeNames(row.Labels)
	vr.repeat(&row, o)
	vr.reminders(&row, o)
	vr.relations(&row, o)
	vr.attachments(&row, o)
	vr.comments(&row, o)
	if len(asList(o["assignees"])) > 0 {
		row.warn("assignees dropped (an import only adds tasks to your account)")
	}
	return row
}

// instant reads an RFC 3339 time as Unix ms; 0 for an unset or unreadable one.
func (vr *vikunjaReader) instant(s string) int64 {
	if s == "" || s == vikunjaZero {
		return 0
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil || t.Year() <= 1 {
		return 0
	}
	return t.UnixMilli()
}

// floating is a Vikunja date-time in the import's time zone: a date, with its
// time unless that is midnight (a date picked without a time).
func (vr *vikunjaReader) floating(s string) (*Due, bool) {
	ms := vr.instant(s)
	if ms == 0 {
		return nil, false
	}
	t := time.UnixMilli(ms).In(vr.loc)
	d := &Due{Date: t.Format("2006-01-02")}
	if t.Hour() != 0 || t.Minute() != 0 {
		d.Time = t.Format("15:04")
	}
	return d, true
}

// repeat maps repeat_after (seconds) and repeat_mode (0 from the due date, 1
// monthly, 2 from the done date).
func (vr *vikunjaReader) repeat(row *Row, o obj) {
	after, _ := strconv.ParseInt(o.str("repeat_after"), 10, 64)
	mode := o.str("repeat_mode")
	text := ""
	switch {
	case mode == "1":
		text = "every month"
	case after <= 0:
		return
	case after%86400 != 0:
		row.warn("repeat every %s dropped (only whole days can be imported)", time.Duration(after)*time.Second)
		return
	case after == 86400:
		text = "every day"
	default:
		text = fmt.Sprintf("every %d days", after/86400)
	}
	if mode == "2" {
		text += " after completion"
	}
	due := ""
	if row.Due != nil {
		due = row.Due.Date
	}
	rule, err := parseRecurrence(text, due)
	if err != nil || rule == "" {
		row.warn("repeat rule %q not supported; imported without it", text)
		return
	}
	row.Recurrence = rule
}

// reminders keeps absolute reminders and those relative to the due date; one
// relative to the start date fires at the instant Vikunja computed, and one
// relative to the end date is dropped.
func (vr *vikunjaReader) reminders(row *Row, o obj) {
	for _, r := range asList(o["reminders"]) {
		ro := asObj(r)
		if ro == nil {
			continue
		}
		period, _ := strconv.ParseInt(ro.str("relative_period"), 10, 64)
		switch ro.str("relative_to") {
		case "due_date":
			if row.Due != nil {
				row.Reminders = append(row.Reminders, Reminder{Offset: int(period / 60)})
				continue
			}
			fallthrough
		case "", "start_date":
			if at := vr.instant(ro.str("reminder")); at > 0 {
				row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: at})
			}
		default:
			row.warn("reminder relative to the end date dropped")
		}
	}
}

// relations: a parent task gives the parent, blocked tasks the blockers;
// the mirrored subtask and blocking lists need nothing more.
func (vr *vikunjaReader) relations(row *Row, o obj) {
	rel := asObj(o["related_tasks"])
	var dropped []string
	kinds := make([]string, 0, len(rel))
	for k := range rel {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	for _, kind := range kinds {
		list := asList(rel[kind])
		switch kind {
		case "parenttask":
			for i, t := range list {
				if to := asObj(t); to != nil && to.str("id") != "" {
					if i == 0 {
						row.ParentSourceID = "vikunja:" + to.str("id")
					} else {
						row.warn("more than one parent task; kept the first")
						break
					}
				}
			}
		case "blocked":
			for _, t := range list {
				if to := asObj(t); to != nil && to.str("id") != "" {
					row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, "vikunja:"+to.str("id"))
				}
			}
		case "subtask", "blocking":
		default:
			if len(list) > 0 {
				dropped = append(dropped, kind)
			}
		}
	}
	if len(dropped) > 0 {
		row.warn("relations dropped: %s", strings.Join(dropped, ", "))
	}
}

// attachments become file attachments with their bytes from files/<file id>.
func (vr *vikunjaReader) attachments(row *Row, o obj) {
	for _, a := range asList(o["attachments"]) {
		ao := asObj(a)
		if ao == nil {
			continue
		}
		f := asObj(ao["file"])
		if f == nil {
			continue
		}
		name := f.str("name")
		data, ok := vr.opts.vikunjaFiles[f.str("id")]
		if !ok {
			if vr.noFiles {
				row.warn("attachment %q dropped (upload the whole export ZIP to bring files)", name)
			} else {
				row.warn("attachment %q dropped (its file is not in the export)", name)
			}
			continue
		}
		mt, _, err := mime.ParseMediaType(f.str("mime"))
		if err != nil || mt == "" {
			mt, _, _ = mime.ParseMediaType(http.DetectContentType(data))
		}
		row.Files = append(row.Files, FileAttachment{Name: name, Mime: mt, Data: data})
	}
}

// comments are kept as text under the description, oldest first.
func (vr *vikunjaReader) comments(row *Row, o obj) {
	var parts []string
	for _, c := range asList(o["comments"]) {
		co := asObj(c)
		if co == nil {
			continue
		}
		text := email.HTMLToMarkdown(co.str("comment"))
		if text == "" {
			continue
		}
		if at := vr.instant(co.str("created")); at > 0 {
			text = "Comment, " + time.UnixMilli(at).In(vr.loc).Format("2006-01-02 15:04") + ":\n" + text
		}
		parts = append(parts, text)
	}
	if len(parts) == 0 {
		return
	}
	if row.Description != "" {
		parts = append([]string{row.Description}, parts...)
	}
	row.Description = strings.Join(parts, "\n\n---\n\n")
}
