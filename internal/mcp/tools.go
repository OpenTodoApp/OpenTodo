package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// ---- tool definitions (tools/list) ----

type tool struct {
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	Annotations map[string]any `json:"annotations"`
}

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

func toolDefinitions() []tool {
	return []tool{
		{
			Name: "list_projects", Title: "List projects",
			Description: "List the user's projects (their own and shared ones they are a member of) with the number of open tasks in each. Archived projects are left out unless include_archived is true.",
			InputSchema: object(nil, map[string]any{
				"include_archived": map[string]any{"type": "boolean", "default": false, "description": "Also return archived projects."},
			}),
			Annotations: annotations("List projects"),
		},
		{
			Name: "list_tasks", Title: "List tasks",
			Description: "List tasks with filters. view: all (default), inbox (no project), today (open tasks due today or overdue, overdue first) or upcoming (open tasks due after today). " +
				"Tasks of archived projects are left out unless project_id names that project. Results are paged: pass next_cursor back as cursor.",
			InputSchema: object(nil, map[string]any{
				"view":              map[string]any{"type": "string", "enum": []string{"all", "inbox", "today", "upcoming"}, "default": "all"},
				"project_id":        map[string]any{"type": "string", "description": "Only tasks of this project (see list_projects)."},
				"label":             map[string]any{"type": "string", "description": "Only tasks carrying this label (name, case-insensitive, or id)."},
				"priority":          map[string]any{"type": "integer", "minimum": 1, "maximum": 4, "description": "Only tasks of this priority: 1 is the highest, 4 the default."},
				"due_from":          map[string]any{"type": "string", "format": "date", "description": "Only tasks due on or after this date (YYYY-MM-DD)."},
				"due_to":            map[string]any{"type": "string", "format": "date", "description": "Only tasks due on or before this date (YYYY-MM-DD)."},
				"include_completed": completedArg,
				"timezone":          timezoneProp,
				"limit":             limitProp,
				"cursor":            cursorProp,
			}),
			Annotations: annotations("List tasks"),
		},
		{
			Name: "get_task", Title: "Get a task",
			Description: "Get one task with its description, project, section, labels, subtasks and comments.",
			InputSchema: object([]string{"id"}, map[string]any{
				"id":       map[string]any{"type": "string", "description": "Task id."},
				"timezone": timezoneProp,
			}),
			Annotations: annotations("Get a task"),
		},
		{
			Name: "search_tasks", Title: "Search tasks",
			Description: "Find tasks whose title or description contains the query (case-insensitive). Open tasks only unless include_completed is true. Paged like list_tasks.",
			InputSchema: object([]string{"query"}, map[string]any{
				"query":             map[string]any{"type": "string", "minLength": 1, "description": "Text to look for."},
				"include_completed": completedArg,
				"timezone":          timezoneProp,
				"limit":             limitProp,
				"cursor":            cursorProp,
			}),
			Annotations: annotations("Search tasks"),
		},
		{
			Name: "today_summary", Title: "Today summary",
			Description: "One-call overview of the user's day: overdue tasks, tasks due today, and open task counts for the inbox and each project.",
			InputSchema: object(nil, map[string]any{
				"timezone": timezoneProp,
			}),
			Annotations: annotations("Today summary"),
		},
	}
}

// ---- tools/call ----

type content struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type toolResult struct {
	Content           []content `json:"content"`
	StructuredContent any       `json:"structuredContent,omitempty"`
	IsError           bool      `json:"isError,omitempty"`
}

// errToolDomain marks an error reported inside the tool result (isError) rather
// than as a JSON-RPC error: the call was well formed but names nothing visible.
type errToolDomain struct{ msg string }

func (e *errToolDomain) Error() string { return e.msg }

func (s *Server) callTool(ctx context.Context, userID string, params json.RawMessage) (any, error) {
	var p struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if len(params) == 0 || json.Unmarshal(params, &p) != nil || p.Name == "" {
		return nil, invalidParams("name: the tool name is required")
	}
	a := args{}
	if len(p.Arguments) > 0 && string(p.Arguments) != "null" {
		if json.Unmarshal(p.Arguments, &a) != nil {
			return nil, invalidParams("arguments: must be an object")
		}
	}
	var fn func(context.Context, string, args) (any, error)
	switch p.Name {
	case "list_projects":
		fn = s.listProjects
	case "list_tasks":
		fn = s.listTasks
	case "get_task":
		fn = s.getTask
	case "search_tasks":
		fn = s.searchTasks
	case "today_summary":
		fn = s.todaySummary
	default:
		return nil, invalidParams("unknown tool: " + p.Name)
	}
	out, err := fn(ctx, userID, a)
	var dom *errToolDomain
	if errors.As(err, &dom) {
		return toolResult{Content: []content{{Type: "text", Text: dom.msg}}, IsError: true}, nil
	}
	if err != nil {
		return nil, err
	}
	text, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return toolResult{Content: []content{{Type: "text", Text: string(text)}}, StructuredContent: out}, nil
}

func (s *Server) serverTime() string { return s.now().UTC().Format(time.RFC3339) }

func (s *Server) today(loc *time.Location) string {
	d, _ := zoned.Local(s.now(), loc)
	return d
}

// ---- list_projects ----

type projectOut struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Color     string  `json:"color,omitempty"`
	Archived  bool    `json:"archived"`
	ParentID  *string `json:"parent_id,omitempty"`
	Shared    bool    `json:"shared"`
	Role      string  `json:"role,omitempty"`
	OpenCount int     `json:"open_count"`
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
	out := projectOut{ID: id, Name: str(p, "name"), Color: str(p, "color"), Archived: boolean(p, "archived"),
		ParentID: strPtr(p, "parent_id"), OpenCount: counts[id]}
	if acc, ok := snap.shared[id]; ok {
		out.Shared, out.Role = true, acc.Role
	}
	return out
}

func (s *Server) projectsPayload(snap *snapshot, includeArchived bool) map[string]any {
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
	out := map[string]any{"projects": list, "inbox_open_count": counts[""], "server_time": s.serverTime()}
	if truncated {
		out["truncated"] = true
	}
	return out
}

func (s *Server) listProjects(ctx context.Context, userID string, a args) (any, error) {
	includeArchived, err := a.boolean("include_archived")
	if err != nil {
		return nil, err
	}
	snap, err := s.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.projectsPayload(snap, includeArchived), nil
}

// ---- list_tasks ----

type taskQuery struct {
	view             string
	projectID        string
	label            string
	priority         int
	dueFrom, dueTo   string
	includeCompleted bool
	loc              *time.Location
	limit            int
	cursor           string
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
		return q, invalidParams("view: must be one of all, inbox, today, upcoming")
	}
	if q.projectID, err = a.str("project_id"); err != nil {
		return q, err
	}
	if q.label, err = a.str("label"); err != nil {
		return q, err
	}
	p, has, err := a.integer("priority")
	if err != nil || (has && (p < 1 || p > 4)) {
		return q, invalidParams("priority: must be an integer from 1 (highest) to 4")
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

func (s *Server) queryTasks(snap *snapshot, q taskQuery) (map[string]any, error) {
	today := s.today(q.loc)
	if q.projectID != "" {
		if _, ok := snap.projects[q.projectID]; !ok {
			return nil, invalidParams("project_id: no such project")
		}
	}
	var wantLabels map[string]bool
	if q.label != "" {
		if wantLabels = snap.labelIDs(q.label); len(wantLabels) == 0 {
			return nil, invalidParams("label: no such label")
		}
	}
	items := []keyed[taskOut]{}
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
			if pid != "" {
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
		if !open && !q.includeCompleted {
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
	return map[string]any{"tasks": list, "next_cursor": nullable(next), "timezone": q.loc.String(), "today": today, "server_time": s.serverTime()}, nil
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

func (s *Server) listTasks(ctx context.Context, userID string, a args) (any, error) {
	q, err := parseTaskQuery(a)
	if err != nil {
		return nil, err
	}
	snap, err := s.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.queryTasks(snap, q)
}

// ---- get_task ----

type commentOut struct {
	ID        string  `json:"id"`
	ParentID  *string `json:"parent_id,omitempty"`
	Author    person  `json:"author"`
	Body      string  `json:"body"`
	CreatedAt *string `json:"created_at,omitempty"`
	EditedAt  *string `json:"edited_at,omitempty"`
}

var errTaskNotFound = &errToolDomain{msg: "task not found"}

// taskDetail is get_task's payload, or errTaskNotFound for an id that is
// unknown, deleted or not visible to the user (indistinguishable on purpose).
func (s *Server) taskDetail(ctx context.Context, userID, id string, loc *time.Location) (map[string]any, error) {
	snap, err := s.load(ctx, userID)
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
		return nil, errTaskNotFound
	}
	today := s.today(loc)
	out := snap.render(task, loc, today, true)
	subs := []keyed[taskOut]{}
	for _, t := range snap.tasks {
		if str(t, "parent_id") == id {
			subs = append(subs, keyed[taskOut]{key: sortableFloat(num(t, "position")) + "|" + sortableFloat(num(t, "created_at")), id: str(t, "id"), v: snap.render(t, loc, today, false)})
		}
	}
	subtasks, _, _ := page(subs, "", MaxItems)
	comments := []commentOut{}
	list, err := s.sync.TaskComments(ctx, userID, id)
	if errors.Is(err, opsync.ErrNotFound) {
		return nil, errTaskNotFound
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
		comments = append(comments, commentOut{ID: str(c, "id"), ParentID: strPtr(c, "parent_id"), Author: person{ID: aid, Name: name},
			Body: str(c, "body"), CreatedAt: isoTime(num(c, "created_at")), EditedAt: isoTime(num(c, "edited_at"))})
	}
	return map[string]any{"task": out, "subtasks": subtasks, "comments": comments, "timezone": loc.String(), "today": today, "server_time": s.serverTime()}, nil
}

func (s *Server) getTask(ctx context.Context, userID string, a args) (any, error) {
	id, err := a.str("id")
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, invalidParams("id: the task id is required")
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	return s.taskDetail(ctx, userID, id, loc)
}

// ---- search_tasks ----

func (s *Server) searchTasks(ctx context.Context, userID string, a args) (any, error) {
	query, err := a.str("query")
	if err != nil {
		return nil, err
	}
	if query == "" {
		return nil, invalidParams("query: must not be empty")
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
	snap, err := s.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	today := s.today(loc)
	needle := strings.ToLower(query)
	items := []keyed[taskOut]{}
	for _, t := range snap.tasks {
		if !snap.visible(t, false) || (!includeCompleted && !isOpen(t)) {
			continue
		}
		if !strings.Contains(strings.ToLower(str(t, "title")), needle) && !strings.Contains(strings.ToLower(str(t, "description")), needle) {
			continue
		}
		items = append(items, keyed[taskOut]{key: taskKey(t, loc), id: str(t, "id"), v: snap.render(t, loc, today, true)})
	}
	list, next, err := page(items, cursor, limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"tasks": list, "next_cursor": nullable(next), "timezone": loc.String(), "today": today, "server_time": s.serverTime()}, nil
}

// ---- today_summary ----

type projectCount struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Open int    `json:"open"`
}

func (s *Server) todaySummary(ctx context.Context, userID string, a args) (any, error) {
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	snap, err := s.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	today := s.today(loc)
	var overdueItems, todayItems []keyed[taskOut]
	inbox := 0
	perProject := map[string]int{}
	for _, t := range snap.tasks {
		if !isOpen(t) || !snap.visible(t, false) {
			continue
		}
		pid := str(t, "project_id")
		if pid == "" {
			inbox++
		} else {
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
		counts = append(counts, projectCount{ID: id, Name: str(p, "name"), Open: perProject[id]})
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
		"server_time": s.serverTime(),
	}
	if len(overdue) < len(overdueItems) || len(dueToday) < len(todayItems) {
		out["truncated"] = true
	}
	return out, nil
}
