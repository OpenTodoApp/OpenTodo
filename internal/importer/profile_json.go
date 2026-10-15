package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// The JSON profiles below read the shapes other task managers commonly export.
// Each is detected structurally (never by product name), fails soft (unknown or
// malformed attributes become row warnings or row errors) and is pinned by a
// fixture in testdata/ and a mapping table in docs/import.md.

// obj is a decoded JSON object with lenient accessors.
type obj map[string]any

func decodeJSON(r io.Reader) (any, error) {
	dec := json.NewDecoder(r)
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, &FileError{fmt.Sprintf("not readable JSON: %v", err)}
	}
	return v, nil
}

func asObj(v any) obj {
	m, _ := v.(map[string]any)
	return obj(m)
}

func asList(v any) []any {
	l, _ := v.([]any)
	return l
}

// first returns the first present, non-null value among keys.
func (o obj) first(keys ...string) (any, bool) {
	for _, k := range keys {
		if v, ok := o[k]; ok && v != nil {
			return v, true
		}
	}
	return nil, false
}

// str reads a string (or a number rendered as a string) from the first present key.
func (o obj) str(keys ...string) string {
	v, ok := o.first(keys...)
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case json.Number:
		return t.String()
	case map[string]any:
		// {"name": "..."} or {"title": "..."} references
		return obj(t).str("name", "title")
	}
	return ""
}

// boolean reads a boolean marker (true, "true", 1, "completed", …).
func (o obj) boolean(keys ...string) bool {
	v, ok := o.first(keys...)
	if !ok {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return truthy(t)
	case json.Number:
		return t.String() != "0"
	}
	return false
}

// names reads a list of names: an array of strings or {name} objects, or a
// comma-separated string.
func (o obj) names(keys ...string) []string {
	v, ok := o.first(keys...)
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case string:
		return splitList(t)
	case []any:
		var out []string
		for _, e := range t {
			switch x := e.(type) {
			case string:
				out = append(out, x)
			case map[string]any:
				out = append(out, obj(x).str("name", "title"))
			}
		}
		return dedupeNames(out)
	}
	return nil
}

// present reports whether any key carries a non-empty value (used for warnings).
func (o obj) present(keys ...string) bool {
	for _, k := range keys {
		switch t := o[k].(type) {
		case nil:
		case bool:
			if t {
				return true
			}
		case string:
			if strings.TrimSpace(t) != "" {
				return true
			}
		case []any:
			if len(t) > 0 {
				return true
			}
		case map[string]any:
			if len(t) > 0 {
				return true
			}
		default:
			return true
		}
	}
	return false
}

// timestamp reads a point in time from the first present key.
func (o obj) timestamp(row *Row, field string, loc *time.Location, keys ...string) int64 {
	s := o.str(keys...)
	if s == "" {
		return 0
	}
	ts, err := parseTimestamp(s, loc)
	if err != nil {
		row.fail("%s: %v", field, err)
		return 0
	}
	return ts
}

// due reads a due value that is either a string or an object {date, time?,
// datetime?}. A due object marked recurring returns its rule text ("string")
// for setRecurrence, or true when it has none.
func (o obj) due(row *Row, loc *time.Location, keys ...string) (recurring any) {
	v, ok := o.first(keys...)
	if !ok {
		return nil
	}
	var s, clock string
	switch t := v.(type) {
	case string:
		s = t
	case map[string]any:
		d := obj(t)
		if dt := d.str("datetime", "dateTime"); dt != "" {
			s = dt
		} else {
			s = d.str("date")
			clock = d.str("time")
		}
		if d.boolean("is_recurring", "isRecurring", "recurring") {
			recurring = true
			if text := d.str("string", "text", "rule"); text != "" {
				recurring = text
			}
		}
	default:
		row.fail("invalid due value")
		return nil
	}
	due, err := parseDue(s, loc)
	if err != nil {
		row.fail("%v", err)
		return nil
	}
	if due != nil && clock != "" {
		c, err := parseClock(clock)
		if err != nil {
			row.fail("%v", err)
			return nil
		}
		due.Time = c
	}
	row.Due = due
	return recurring
}

// recurrenceKeys and reminderKeys name the attributes read as recurrence and
// reminders by the JSON profiles (docs/import.md).
var (
	recurrenceKeys = []string{"recurrence", "rrule", "repeat", "recurring", "recurrence_rule", "recurrenceRule", "repeatRule", "repeat_rule"}
	reminderKeys   = []string{"reminders", "reminder", "alarms", "reminder_at", "remind_at", "reminderDateTime"}
)

// schedule reads the row's recurrence (from the object or its due) and its
// reminders, after the due date is known.
// deadline reads a deadline key into the row (OpenSpec change deadlines): a
// date string, or an object with "date" (the Todoist API form).
func (o obj) deadline(row *Row, loc *time.Location, keys ...string) {
	v, ok := o.first(keys...)
	if !ok || v == nil {
		return
	}
	switch t := v.(type) {
	case string:
		setDeadline(row, t, loc)
	case map[string]any:
		setDeadline(row, obj(t).str("date"), loc)
	default:
		row.fail("invalid deadline value")
	}
}

func (o obj) schedule(row *Row, loc *time.Location, fromDue any) {
	if v, ok := o.first(recurrenceKeys...); ok {
		setRecurrence(row, v)
	} else if fromDue != nil {
		setRecurrence(row, fromDue)
	}
	if v, ok := o.first(reminderKeys...); ok {
		addReminders(row, v, loc)
	}
}

// commonWarnings records attributes the data model cannot hold.
func (o obj) commonWarnings(row *Row) {
	if o.present("attachments", "files", "attachment") {
		row.warn("attachment dropped (not supported)")
	}
	if o.present("comments") {
		row.warn("comments dropped (not supported)")
	}
	if o.present("assignee", "assigned_to", "assignedTo", "responsible_uid", "assignees") {
		row.warn("assignee dropped (not supported)")
	}
	if o.present("links") {
		row.warn("links dropped (not supported)")
	}
}

func jsonPriority(row *Row, o obj, keys ...string) {
	v, ok := o.first(keys...)
	if !ok {
		return
	}
	var s string
	switch t := v.(type) {
	case string:
		s = t
	case json.Number:
		s = t.String()
	default:
		row.fail("invalid priority")
		return
	}
	p, err := parsePriority(s)
	if err != nil {
		row.fail("%v", err)
		return
	}
	row.Priority = p
}

func sourceID(o obj, keys ...string) string {
	return o.str(keys...)
}

// prefixed namespaces a source id so project and task ids from one file never collide.
func prefixed(prefix, id string) string {
	if id == "" {
		return ""
	}
	return prefix + id
}

// ---- json-generic --------------------------------------------------------------

// genericProfile reads a flat or nested list of task objects, either as the
// top-level array or under "tasks", with optional "projects". Key names are
// matched leniently (title/name/content, notes/description, tags/labels, …).
type genericProfile struct{}

func (genericProfile) Name() string { return "json-generic" }
func (genericProfile) Description() string {
	return `JSON task list: an array of tasks, or {"tasks":[…], "projects":[…]}, with optional nested subtasks`
}

func (genericProfile) Detect(data []byte) bool {
	t := bytes.TrimSpace(data)
	if len(t) > 0 && t[0] == '[' {
		var l []json.RawMessage
		if json.Unmarshal(t, &l) != nil {
			return false
		}
		return len(l) == 0 || bytes.HasPrefix(bytes.TrimSpace(l[0]), []byte("{"))
	}
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	return isArray(top["tasks"])
}

func isArray(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && t[0] == '['
}

func (genericProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	var tasks, projects []any
	if l, ok := v.([]any); ok {
		tasks = l
	} else if o := asObj(v); o != nil {
		tasks = asList(o["tasks"])
		projects = asList(o["projects"])
	} else {
		return nil, &FileError{"expected an array of tasks or an object with a tasks array"}
	}
	out := &Parsed{}
	loc := opts.Location()
	for i, p := range projects {
		o := asObj(p)
		row := Row{Line: i + 1, Kind: KindProject}
		if o == nil {
			row.fail("project #%d is not an object", i+1)
			out.Rows = append(out.Rows, row)
			continue
		}
		row.SourceID = prefixed("project:", sourceID(o, "id", "uuid"))
		if row.SourceID == "" {
			row.SourceID = "project:#" + strconv.Itoa(i+1)
		}
		row.Title = o.str("name", "title")
		row.ParentSourceID = prefixed("project:", o.str("parent_id", "parentId", "parent"))
		if row.Title == "" {
			row.fail("project name is required")
		}
		out.Rows = append(out.Rows, row)
	}
	n := 0
	var walk func(list []any, parent string, inherited obj)
	walk = func(list []any, parent string, inherited obj) {
		for _, t := range list {
			n++
			if n > MaxRows+1 {
				return
			}
			o := asObj(t)
			row := Row{Line: n, Kind: KindTask}
			if o == nil {
				row.fail("task #%d is not an object", n)
				out.Rows = append(out.Rows, row)
				continue
			}
			row.SourceID = prefixed("task:", sourceID(o, "id", "uuid"))
			if row.SourceID == "" {
				row.SourceID = "task:#" + strconv.Itoa(n)
			}
			row.Title = o.str("title", "name", "content", "summary", "text")
			if row.Title == "" {
				row.fail("title is required")
			}
			row.Description = o.str("description", "notes", "note", "body")
			row.ProjectSourceID = prefixed("project:", o.str("project_id", "projectId"))
			row.ProjectName = o.str("project", "project_name", "projectName", "list", "list_name", "listName")
			if row.ProjectSourceID == "" && row.ProjectName == "" && inherited != nil {
				row.ProjectSourceID = prefixed("project:", inherited.str("project_id", "projectId"))
				row.ProjectName = inherited.str("project", "project_name", "projectName", "list", "list_name", "listName")
			}
			row.SectionName = o.str("section", "section_name", "sectionName", "column", "heading")
			row.ParentSourceID = prefixed("task:", o.str("parent_id", "parentId", "parent"))
			if parent != "" {
				row.ParentSourceID = parent
			}
			jsonPriority(&row, o, "priority")
			o.schedule(&row, loc, o.due(&row, loc, "due", "due_date", "dueDate"))
			o.deadline(&row, loc, "deadline")
			row.Labels = o.names("labels", "tags")
			if o.boolean("completed", "done", "checked", "isCompleted", "is_completed") || isDoneStatus(o.str("status")) {
				row.Completed = true
			}
			if ts := o.timestamp(&row, "completed_at", loc, "completed_at", "completedAt", "completed_on", "completion_date", "completedDate"); ts > 0 {
				row.Completed, row.CompletedAt = true, ts
			}
			row.CreatedAt = o.timestamp(&row, "created_at", loc, "created_at", "createdAt", "created", "added_at", "creationDate")
			o.commonWarnings(&row)
			out.Rows = append(out.Rows, row)
			if children := asList(firstVal(o, "subtasks", "children", "items")); len(children) > 0 {
				walk(children, row.SourceID, o)
			}
		}
	}
	walk(tasks, "", nil)
	if len(out.Rows) > MaxRows {
		return nil, ErrTooManyRows
	}
	return out, nil
}

func firstVal(o obj, keys ...string) any {
	v, _ := o.first(keys...)
	return v
}

func isDoneStatus(s string) bool {
	switch strings.ToLower(s) {
	case "completed", "complete", "done", "closed", "finished":
		return true
	}
	return false
}

// ---- json-items ----------------------------------------------------------------

// itemsProfile reads the "projects / sections / items" backup shape: flat arrays
// joined by ids, priority counted upwards (4 is the most urgent), due as an object,
// labels as names, comments in a separate "notes" array.
type itemsProfile struct{}

func (itemsProfile) Name() string { return "json-items" }
func (itemsProfile) Description() string {
	return `JSON backup with "projects", "sections" and "items" arrays joined by ids (priority 4 = most urgent)`
}

func (itemsProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	return isArray(top["items"]) && isArray(top["projects"])
}

func (itemsProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	top := asObj(v)
	if top == nil {
		return nil, &FileError{"expected a JSON object"}
	}
	out := &Parsed{}
	loc := opts.Location()
	for i, p := range asList(top["projects"]) {
		o := asObj(p)
		row := Row{Line: i + 1, Kind: KindProject}
		if o == nil {
			row.fail("project #%d is not an object", i+1)
			out.Rows = append(out.Rows, row)
			continue
		}
		if o.boolean("inbox_project", "is_inbox_project") {
			// The source's inbox maps onto ours: its items land in the target project.
			continue
		}
		row.SourceID = "project:" + o.str("id")
		row.Title = o.str("name")
		if pid := o.str("parent_id"); pid != "" {
			row.ParentSourceID = "project:" + pid
		}
		if row.Title == "" {
			row.fail("project name is required")
		}
		if o.boolean("is_deleted") {
			continue
		}
		out.Rows = append(out.Rows, row)
	}
	inbox := map[string]bool{}
	for _, p := range asList(top["projects"]) {
		if o := asObj(p); o != nil && o.boolean("inbox_project", "is_inbox_project") {
			inbox[o.str("id")] = true
		}
	}
	sections := map[string]string{}
	for i, s := range asList(top["sections"]) {
		o := asObj(s)
		if o == nil {
			continue
		}
		sections[o.str("id")] = o.str("name")
		if opts.Sections != "section" || o.boolean("is_deleted") {
			continue
		}
		// Listed sections become sections of their project even when empty, in
		// file order, so the board looks like it did (import-completeness D6).
		row := Row{Line: i + 1, Kind: KindSection, SourceID: "section:" + o.str("id"), Title: o.str("name")}
		if pid := o.str("project_id"); pid != "" && !inbox[pid] {
			row.ProjectSourceID = "project:" + pid
		}
		if row.Title == "" {
			row.fail("section name is required")
		}
		out.Rows = append(out.Rows, row)
	}
	comments := map[string]bool{}
	for _, n := range asList(firstVal(top, "notes", "comments")) {
		if o := asObj(n); o != nil {
			comments[o.str("item_id", "task_id")] = true
		}
	}
	reminders := map[string]any{}
	for _, n := range asList(top["reminders"]) {
		if o := asObj(n); o != nil && !o.boolean("is_deleted") {
			id := o.str("item_id", "task_id")
			list, _ := reminders[id].([]any)
			reminders[id] = append(list, n)
		}
	}
	for i, it := range asList(top["items"]) {
		o := asObj(it)
		row := Row{Line: i + 1, Kind: KindTask}
		if o == nil {
			row.fail("item #%d is not an object", i+1)
			out.Rows = append(out.Rows, row)
			continue
		}
		if o.boolean("is_deleted") {
			continue
		}
		id := o.str("id")
		row.SourceID = "item:" + id
		row.Title = o.str("content")
		if row.Title == "" {
			row.fail("content is required")
		}
		row.Description = o.str("description")
		if pid := o.str("project_id"); pid != "" && !inbox[pid] {
			row.ProjectSourceID = "project:" + pid
		}
		if sid := o.str("section_id"); sid != "" {
			row.SectionName = sections[sid]
		}
		if pid := o.str("parent_id"); pid != "" {
			row.ParentSourceID = "item:" + pid
		}
		if s := o.str("priority"); s != "" {
			n, err := strconv.Atoi(s)
			if err != nil || n < 1 || n > 4 {
				row.fail("invalid priority %q (expected 1-4)", s)
			} else {
				row.Priority = 5 - n
			}
		}
		o.schedule(&row, loc, o.due(&row, loc, "due"))
		addReminders(&row, reminders[id], loc)
		o.deadline(&row, loc, "deadline")
		if o.present("duration") {
			row.warn("duration dropped (not supported)")
		}
		row.Labels = o.names("labels")
		if o.boolean("checked", "completed") {
			row.Completed = true
		}
		if ts := o.timestamp(&row, "completed_at", loc, "completed_at", "date_completed"); ts > 0 && row.Completed {
			row.CompletedAt = ts
		}
		row.CreatedAt = o.timestamp(&row, "added_at", loc, "added_at", "date_added", "created_at")
		if comments[id] {
			row.warn("comments dropped (not supported)")
		}
		o.commonWarnings(&row)
		out.Rows = append(out.Rows, row)
		if len(out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	return out, nil
}

// ---- json-lists ----------------------------------------------------------------

// listsProfile reads the "lists of tasks" shape: {"lists":[{"title", "tasks":[…]}]}
// where each list becomes a project, tasks carry notes, an RFC 3339 due, a
// completion status and either a parent id or nested subtasks.
type listsProfile struct{}

func (listsProfile) Name() string { return "json-lists" }
func (listsProfile) Description() string {
	return `JSON with a "lists" array, each list holding its "tasks" (lists become projects)`
}

func (listsProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	return isArray(top["lists"])
}

func (listsProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	top := asObj(v)
	if top == nil {
		return nil, &FileError{"expected a JSON object"}
	}
	out := &Parsed{}
	loc := opts.Location()
	n := 0
	for li, l := range asList(top["lists"]) {
		lo := asObj(l)
		if lo == nil {
			out.Rows = append(out.Rows, Row{Line: li + 1, Kind: KindProject, Err: fmt.Sprintf("list #%d is not an object", li+1)})
			continue
		}
		listName := lo.str("title", "name")
		listID := "list:" + lo.str("id")
		if lo.str("id") == "" {
			listID = "list:#" + strconv.Itoa(li+1)
		}
		prow := Row{Line: li + 1, Kind: KindProject, SourceID: listID, Title: listName}
		if listName == "" {
			prow.fail("list title is required")
		}
		out.Rows = append(out.Rows, prow)
		var walk func(tasks []any, parent string)
		walk = func(tasks []any, parent string) {
			for _, t := range tasks {
				n++
				if n > MaxRows+1 {
					return
				}
				o := asObj(t)
				row := Row{Line: n, Kind: KindTask, ProjectSourceID: listID}
				if o == nil {
					row.fail("task #%d is not an object", n)
					out.Rows = append(out.Rows, row)
					continue
				}
				if o.boolean("deleted") {
					continue
				}
				row.SourceID = "task:" + o.str("id")
				if o.str("id") == "" {
					row.SourceID = "task:#" + strconv.Itoa(n)
				}
				row.Title = o.str("title", "name")
				if row.Title == "" {
					row.fail("title is required")
				}
				row.Description = o.str("notes", "description")
				if pid := o.str("parent"); pid != "" {
					row.ParentSourceID = "task:" + pid
				}
				if parent != "" {
					row.ParentSourceID = parent
				}
				o.schedule(&row, loc, o.due(&row, loc, "due"))
				if o.boolean("starred", "important", "flagged") {
					row.Priority = 1
				}
				if isDoneStatus(o.str("status")) || o.boolean("completed_flag") {
					row.Completed = true
				}
				if s, ok := o["completed"].(string); ok && s != "" {
					if ts, err := parseTimestamp(s, loc); err == nil {
						row.Completed, row.CompletedAt = true, ts
					} else if truthy(s) {
						row.Completed = true
					} else {
						row.fail("completed: %v", err)
					}
				} else if b, ok := o["completed"].(bool); ok && b {
					row.Completed = true
				}
				row.CreatedAt = o.timestamp(&row, "created", loc, "created", "created_at", "createdAt")
				row.Labels = o.names("labels", "tags")
				o.commonWarnings(&row)
				out.Rows = append(out.Rows, row)
				if children := asList(firstVal(o, "subtasks", "children")); len(children) > 0 {
					walk(children, row.SourceID)
				}
			}
		}
		walk(asList(firstVal(lo, "tasks", "items")), "")
	}
	if len(out.Rows) > MaxRows {
		return nil, ErrTooManyRows
	}
	return out, nil
}
