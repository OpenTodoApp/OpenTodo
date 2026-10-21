package agenttools

import (
	"context"
	"errors"
	"github.com/pixari/opentodo/internal/e2ee"
	"sort"
	"strings"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// ---- read tools (always offered) ----
//
// The five read tools of the archived `mcp-server` change, moved here without
// changing their definitions: TestToolsListReadOnlyUnchanged pins tools/list
// byte for byte.

func annotations(title string) map[string]any {
	return map[string]any{"title": title, "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false}
}

func object(required []string, props map[string]any) map[string]any {
	s := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

var (
	timezoneProp = map[string]any{"type": "string", "description": "IANA time zone used to decide what is today, overdue or upcoming, e.g. \"Europe/Rome\". Default: UTC. Due dates are floating, so pass the user's zone."}
	limitProp    = map[string]any{"type": "integer", "minimum": 1, "maximum": MaxItems, "description": "Maximum number of tasks to return (default and maximum 200)."}
	cursorProp   = map[string]any{"type": "string", "description": "next_cursor from a previous result, to get the following page."}
	completedArg = map[string]any{"type": "boolean", "default": false, "description": "Also return completed tasks."}
)

func readDef(name, title, desc string, schema map[string]any) func(Caller) Definition {
	return func(Caller) Definition {
		return Definition{Name: name, Title: title, Description: desc, InputSchema: schema, Annotations: annotations(title), Kind: KindRead}
	}
}

func init() {
	register(tool{
		def: readDef("list_projects", "List projects",
			"List the user's projects (their own and shared ones they are a member of) with the number of open tasks in each. Archived projects are left out unless include_archived is true.",
			object(nil, map[string]any{
				"include_archived": map[string]any{"type": "boolean", "default": false, "description": "Also return archived projects."},
			})),
		read: (*Registry).listProjects,
	})
	register(tool{
		def: readDef("list_tasks", "List tasks",
			"List tasks with filters. view: all (default), inbox (open tasks without a project that are not scheduled: no do-on date, start date or Someday), today (open tasks due today or overdue, overdue first) or upcoming (open tasks due after today). "+
				"Tasks of archived projects are left out unless project_id names that project. Results are paged: pass next_cursor back as cursor.",
			object(nil, map[string]any{
				"view":              map[string]any{"type": "string", "enum": []string{"all", "inbox", "today", "upcoming"}, "default": "all"},
				"project_id":        map[string]any{"type": "string", "description": "Only tasks of this project (see list_projects)."},
				"label":             map[string]any{"type": "string", "description": "Only tasks carrying this label (name, case-insensitive, or id)."},
				"priority":          map[string]any{"type": "integer", "minimum": 1, "maximum": 4, "description": "Only tasks of this priority: 1 is the highest, 4 the default."},
				"due_from":          map[string]any{"type": "string", "format": "date", "description": "Only tasks due on or after this date (YYYY-MM-DD)."},
				"due_to":            map[string]any{"type": "string", "format": "date", "description": "Only tasks due on or before this date (YYYY-MM-DD)."},
				"completed_after":   map[string]any{"type": "string", "description": "Only tasks completed at or after this time: YYYY-MM-DD (start of that day in timezone), an RFC 3339 time or Unix milliseconds. Implies completed tasks only."},
				"completed_before":  map[string]any{"type": "string", "description": "Only tasks completed before this time, in the same forms as completed_after. Implies completed tasks only."},
				"include_completed": completedArg,
				"timezone":          timezoneProp,
				"limit":             limitProp,
				"cursor":            cursorProp,
			})),
		read: (*Registry).listTasks,
	})
	register(tool{
		def: readDef("get_task", "Get a task",
			"Get one task with its description, project, section, labels, subtasks and comments.",
			object([]string{"id"}, map[string]any{
				"id":       map[string]any{"type": "string", "description": "Task id."},
				"timezone": timezoneProp,
			})),
		read: (*Registry).getTask,
	})
	register(tool{
		def: readDef("search_tasks", "Search tasks",
			"Find tasks whose title or description contains the query (case-insensitive). Open tasks only unless include_completed is true. Paged like list_tasks.",
			object([]string{"query"}, map[string]any{
				"query":             map[string]any{"type": "string", "minLength": 1, "description": "Text to look for."},
				"include_completed": completedArg,
				"timezone":          timezoneProp,
				"limit":             limitProp,
				"cursor":            cursorProp,
			})),
		read: (*Registry).searchTasks,
	})
	register(tool{
		def: readDef("today_summary", "Today summary",
			"One-call overview of the user's day: overdue tasks, tasks due today, and open task counts for the Inbox (tasks without a project that are not scheduled) and each project.",
			object(nil, map[string]any{
				"timezone": timezoneProp,
			})),
		read: (*Registry).todaySummary,
	})
}

func (r *Registry) today(loc *time.Location) string {
	d, _ := zoned.Local(r.now(), loc)
	return d
}

// ---- list_projects ----

type nameText struct {
	Name string `json:"name"`
}

// projectText is a project's user-written content: its name and its note
// (OpenSpec project-notes), both untrusted data for an assistant.
type projectText struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type projectOut struct {
	ID        string      `json:"id"`
	Untrusted projectText `json:"untrusted_text"`
	// Encrypted marks a project whose name or note is end-to-end encrypted:
	// the server shows the placeholder instead.
	Encrypted bool    `json:"encrypted"`
	Color     string  `json:"color,omitempty"`
	Archived  bool    `json:"archived"`
	ParentID  *string `json:"parent_id,omitempty"`
	Shared    bool    `json:"shared"`
	Role      string  `json:"role,omitempty"`
	OpenCount int     `json:"open_count"`
	// Fields are the project's live custom field definitions (custom-fields).
	Fields []fieldOut `json:"fields"`
}

// inboxCount counts the Inbox tasks (internal/inbox): open, no project, not scheduled.
func (snap *snapshot) inboxCount() int {
	n := 0
	inInbox := snap.inboxRule()
	for _, t := range snap.tasks {
		if inInbox(t) {
			n++
		}
	}
	return n
}

func (snap *snapshot) openCounts() map[string]int {
	counts := map[string]int{}
	for _, t := range snap.tasks {
		if isOpen(t) {
			counts[str(t, "project_id")]++
		}
	}
	return counts
}

func (snap *snapshot) renderProject(p opsync.Entity, counts map[string]int) projectOut {
	id := str(p, "id")
	out := projectOut{ID: id, Untrusted: projectText{Name: str(p, "name"), Description: str(p, "description")}, Color: str(p, "color"),
		Archived: boolean(p, "archived"), ParentID: strPtr(p, "parent_id"), OpenCount: counts[id], Fields: snap.renderFields(id),
		Encrypted: e2ee.IsCiphertext(rawStr(p, "name")) || e2ee.IsCiphertext(rawStr(p, "description"))}
	if acc, ok := snap.shared[id]; ok {
		out.Shared, out.Role = true, acc.Role
	}
	return out
}

func (r *Registry) projectsPayload(snap *snapshot, includeArchived bool) map[string]any {
	counts := snap.openCounts()
	items := []keyed[projectOut]{}
	for _, p := range snap.projList {
		if !includeArchived && boolean(p, "archived") {
			continue
		}
		items = append(items, keyed[projectOut]{key: sortableFloat(num(p, "position")) + "|" + sortableFloat(num(p, "created_at")), id: str(p, "id"), v: snap.renderProject(p, counts)})
	}
	list, _, _ := page(items, "", len(items))
	truncated := len(list) > MaxItems
	if truncated {
		list = list[:MaxItems]
	}
	out := map[string]any{"projects": list, "inbox_open_count": snap.inboxCount(), "server_time": r.serverTime()}
	if truncated {
		out["truncated"] = true
	}
	return out
}

func (r *Registry) listProjects(ctx context.Context, userID string, a args) (map[string]any, error) {
	includeArchived, err := a.boolean("include_archived")
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return r.projectsPayload(snap, includeArchived), nil
}

// ---- list_tasks ----

type taskQuery struct {
	view             string
	projectID        string
	label            string
	priority         int
	dueFrom, dueTo   string
	includeCompleted bool
	// Completion range [completedAfter, completedBefore) in Unix ms; 0 = open end
	// (OpenSpec change completed-date-filters, design D6).
	completedAfter, completedBefore int64
	loc                             *time.Location
	limit                           int
	cursor                          string
}

func parseTaskQuery(a args) (taskQuery, error) {
	var q taskQuery
	var err error
	if q.view, err = a.str("view"); err != nil {
		return q, err
	}
	switch q.view {
	case "":
		q.view = "all"
	case "all", "inbox", "today", "upcoming":
	default:
		return q, argErr("view: must be one of all, inbox, today, upcoming")
	}
	if q.projectID, err = a.str("project_id"); err != nil {
		return q, err
	}
	if q.label, err = a.str("label"); err != nil {
		return q, err
	}
	p, has, err := a.integer("priority")
	if err != nil || (has && (p < 1 || p > 4)) {
		return q, argErr("priority: must be an integer from 1 (highest) to 4")
	}
	q.priority = p
	if q.dueFrom, err = a.date("due_from"); err != nil {
		return q, err
	}
	if q.dueTo, err = a.date("due_to"); err != nil {
		return q, err
	}
	if q.includeCompleted, err = a.boolean("include_completed"); err != nil {
		return q, err
	}
	if q.loc, err = a.location(); err != nil {
		return q, err
	}
	for _, b := range []struct {
		name string
		dst  *int64
	}{{"completed_after", &q.completedAfter}, {"completed_before", &q.completedBefore}} {
		v, err := a.str(b.name)
		if err != nil {
			return q, err
		}
		if *b.dst, err = ParseCompletionBound(b.name, v, q.loc); err != nil {
			return q, err
		}
	}
	if q.limit, err = a.limit(); err != nil {
		return q, err
	}
	if q.cursor, err = a.str("cursor"); err != nil {
		return q, err
	}
	return q, nil
}

// labelIDs resolves a label argument (name, case-insensitive, or id).
func (snap *snapshot) labelIDs(label string) map[string]bool {
	ids := map[string]bool{}
	for id, name := range snap.labels {
		if id == label || strings.EqualFold(name, label) {
			ids[id] = true
		}
	}
	return ids
}

func (r *Registry) queryTasks(snap *snapshot, q taskQuery) (map[string]any, error) {
	today := r.today(q.loc)
	if q.projectID != "" {
		if _, ok := snap.projects[q.projectID]; !ok {
			return nil, argErr("project_id: no such project")
		}
	}
	var wantLabels map[string]bool
	if q.label != "" {
		if wantLabels = snap.labelIDs(q.label); len(wantLabels) == 0 {
			return nil, argErr("label: no such label")
		}
	}
	items := []keyed[taskOut]{}
	inInbox := snap.inboxRule()
	for _, t := range snap.tasks {
		pid := str(t, "project_id")
		if q.projectID != "" && pid != q.projectID {
			continue
		}
		if !snap.visible(t, q.projectID != "") {
			continue
		}
		open := isOpen(t)
		d := taskDue(t)
		var date string
		if d != nil {
			date, _ = localDue(d, q.loc)
		}
		switch q.view {
		case "inbox":
			if !inInbox(t) {
				continue
			}
		case "today":
			if d == nil || date > today || !open {
				continue
			}
		case "upcoming":
			if d == nil || date <= today || !open {
				continue
			}
		}
		if !open && !q.includeCompleted && q.completedAfter == 0 && q.completedBefore == 0 {
			continue
		}
		// A habit's skipped occurrence record is not a completion (habits D6).
		if (q.completedAfter != 0 || q.completedBefore != 0) && string(t["skipped"]) == "true" {
			continue
		}
		if !InCompletionRange(int64(num(t, "completed_at")), q.completedAfter, q.completedBefore) {
			continue
		}
		if q.priority != 0 && priority(t) != q.priority {
			continue
		}
		if (q.dueFrom != "" || q.dueTo != "") && (d == nil || (q.dueFrom != "" && date < q.dueFrom) || (q.dueTo != "" && date > q.dueTo)) {
			continue
		}
		if wantLabels != nil && !hasAny(stringList(t, "labels"), wantLabels) {
			continue
		}
		items = append(items, keyed[taskOut]{key: taskKey(t, q.loc), id: str(t, "id"), v: snap.render(t, q.loc, today, false)})
	}
	list, next, err := page(items, q.cursor, q.limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"tasks": list, "next_cursor": nullable(next), "timezone": q.loc.String(), "today": today, "server_time": r.serverTime()}, nil
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func hasAny(list []string, want map[string]bool) bool {
	for _, v := range list {
		if want[v] {
			return true
		}
	}
	return false
}

func (r *Registry) listTasks(ctx context.Context, userID string, a args) (map[string]any, error) {
	q, err := parseTaskQuery(a)
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return r.queryTasks(snap, q)
}

// ---- get_task ----

type commentText struct {
	Body   string `json:"body"`
	Author string `json:"author,omitempty"`
}

type commentOut struct {
	ID        string      `json:"id"`
	Untrusted commentText `json:"untrusted_text"`
	ParentID  *string     `json:"parent_id,omitempty"`
	AuthorID  string      `json:"author_id"`
	// AuthorIsYou is false for comments other members wrote (design D9.6).
	AuthorIsYou bool    `json:"author_is_you"`
	CreatedAt   *string `json:"created_at,omitempty"`
	EditedAt    *string `json:"edited_at,omitempty"`
}

type attachmentText struct {
	Name string  `json:"name"`
	Mime *string `json:"mime,omitempty"`
	URL  *string `json:"url,omitempty"`
}

// attachmentOut is the metadata of a file or link on the task or one of the
// listed comments (OpenSpec attachments, design D14); the content is never read.
type attachmentOut struct {
	ID        string         `json:"id"`
	Untrusted attachmentText `json:"untrusted_text"`
	Size      *int64         `json:"size,omitempty"`
	// Uploaded is false for a file whose bytes have not reached the server yet.
	Uploaded  bool    `json:"uploaded"`
	CommentID *string `json:"comment_id,omitempty"`
	CreatedAt *string `json:"created_at,omitempty"`
}

// ErrTaskNotFound is get_task's answer for an id that is unknown, deleted or
// not visible to the user (indistinguishable on purpose).
var ErrTaskNotFound = &ToolError{Message: "task not found"}

// taskDetail is get_task's payload, or ErrTaskNotFound for an id that is
// unknown, deleted or not visible to the user (indistinguishable on purpose).
func (r *Registry) taskDetail(ctx context.Context, userID, id string, loc *time.Location) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	var task opsync.Entity
	for _, t := range snap.tasks {
		if str(t, "id") == id {
			task = t
			break
		}
	}
	if task == nil {
		return nil, ErrTaskNotFound
	}
	today := r.today(loc)
	out := snap.render(task, loc, today, true)
	subs := []keyed[taskOut]{}
	for _, t := range snap.tasks {
		if str(t, "parent_id") == id {
			subs = append(subs, keyed[taskOut]{key: sortableFloat(num(t, "position")) + "|" + sortableFloat(num(t, "created_at")), id: str(t, "id"), v: snap.render(t, loc, today, false)})
		}
	}
	subtasks, _, _ := page(subs, "", MaxItems)
	comments := []commentOut{}
	list, err := r.taskComments(ctx, userID, id)
	if errors.Is(err, opsync.ErrNotFound) {
		return nil, ErrTaskNotFound
	}
	if err != nil {
		return nil, err
	}
	for _, c := range list {
		if len(comments) == MaxItems {
			break
		}
		aid := str(c, "author_id")
		name := snap.people[aid]
		comments = append(comments, commentOut{ID: str(c, "id"), ParentID: strPtr(c, "parent_id"), AuthorID: aid, AuthorIsYou: aid == userID,
			Untrusted: commentText{Body: str(c, "body"), Author: name}, CreatedAt: isoTime(num(c, "created_at")), EditedAt: isoTime(num(c, "edited_at"))})
	}
	shown := map[string]bool{}
	for _, c := range comments {
		shown[c.ID] = true
	}
	attachments := []attachmentOut{}
	all, err := r.list(ctx, userID, "attachment", false)
	if err != nil {
		return nil, err
	}
	for _, a := range all {
		if str(a, "task_id") != id || len(attachments) == MaxItems {
			continue
		}
		cid := strPtr(a, "comment_id")
		if cid != nil && !shown[*cid] {
			continue
		}
		o := attachmentOut{ID: str(a, "id"), CommentID: cid, CreatedAt: isoTime(num(a, "created_at")),
			Untrusted: attachmentText{Name: str(a, "name"), Mime: strPtr(a, "mime"), URL: strPtr(a, "url")}}
		if o.Untrusted.URL == nil {
			size := int64(num(a, "size"))
			o.Size = &size
			o.Uploaded = num(a, "uploaded_at") > 0
		} else {
			o.Uploaded = true
		}
		attachments = append(attachments, o)
	}
	return map[string]any{"task": out, "subtasks": subtasks, "comments": comments, "attachments": attachments, "timezone": loc.String(), "today": today, "server_time": r.serverTime()}, nil
}

func (r *Registry) getTask(ctx context.Context, userID string, a args) (map[string]any, error) {
	id, err := a.str("id")
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, argErr("id: the task id is required")
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	return r.taskDetail(ctx, userID, id, loc)
}

// ---- search_tasks ----

func (r *Registry) searchTasks(ctx context.Context, userID string, a args) (map[string]any, error) {
	query, err := a.str("query")
	if err != nil {
		return nil, err
	}
	if query == "" {
		return nil, argErr("query: must not be empty")
	}
	includeCompleted, err := a.boolean("include_completed")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	limit, err := a.limit()
	if err != nil {
		return nil, err
	}
	cursor, err := a.str("cursor")
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	today := r.today(loc)
	needle := strings.ToLower(query)
	items := []keyed[taskOut]{}
	for _, t := range snap.tasks {
		if !snap.visible(t, false) || (!includeCompleted && !isOpen(t)) {
			continue
		}
		// Encrypted content (OpenSpec `e2ee`) cannot be searched server-side; the
		// placeholder text must not match either.
		if !strings.Contains(strings.ToLower(plainOrEmpty(t, "title")), needle) && !strings.Contains(strings.ToLower(plainOrEmpty(t, "description")), needle) {
			continue
		}
		items = append(items, keyed[taskOut]{key: taskKey(t, loc), id: str(t, "id"), v: snap.render(t, loc, today, true)})
	}
	list, next, err := page(items, cursor, limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"tasks": list, "next_cursor": nullable(next), "timezone": loc.String(), "today": today, "server_time": r.serverTime()}, nil
}

// ---- today_summary ----

type projectCount struct {
	ID        string   `json:"id"`
	Untrusted nameText `json:"untrusted_text"`
	Open      int      `json:"open"`
}

func (r *Registry) todaySummary(ctx context.Context, userID string, a args) (map[string]any, error) {
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	today := r.today(loc)
	var overdueItems, todayItems []keyed[taskOut]
	inbox := 0
	perProject := map[string]int{}
	inInbox := snap.inboxRule()
	for _, t := range snap.tasks {
		if !isOpen(t) || !snap.visible(t, false) {
			continue
		}
		pid := str(t, "project_id")
		if inInbox(t) {
			inbox++
		} else if pid != "" {
			perProject[pid]++
		}
		d := taskDue(t)
		if d == nil {
			continue
		}
		date, _ := localDue(d, loc)
		item := keyed[taskOut]{key: taskKey(t, loc), id: str(t, "id")}
		switch {
		case date < today:
			item.v = snap.render(t, loc, today, false)
			overdueItems = append(overdueItems, item)
		case date == today:
			item.v = snap.render(t, loc, today, false)
			todayItems = append(todayItems, item)
		}
	}
	overdue, _, _ := page(overdueItems, "", MaxItems)
	dueToday, _, _ := page(todayItems, "", MaxItems-len(overdue))
	counts := []projectCount{}
	for _, p := range snap.projList {
		id := str(p, "id")
		if boolean(p, "archived") {
			continue
		}
		counts = append(counts, projectCount{ID: id, Untrusted: nameText{Name: str(p, "name")}, Open: perProject[id]})
	}
	sort.SliceStable(counts, func(i, j int) bool { return counts[i].Open > counts[j].Open })
	if len(counts) > MaxItems {
		counts = counts[:MaxItems]
	}
	out := map[string]any{
		"timezone": loc.String(), "today": today,
		"overdue": overdue, "due_today": dueToday,
		"counts": map[string]any{
			"overdue": len(overdueItems), "due_today": len(todayItems), "inbox": inbox, "per_project": counts,
		},
		"server_time": r.serverTime(),
	}
	if len(overdue) < len(overdueItems) || len(dueToday) < len(todayItems) {
		out["truncated"] = true
	}
	return out, nil
}
