package davroutes

import (
	"database/sql"
	"strings"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/syncscope"
)

// davView is the user's data as CalDAV sees it, loaded once per request.
type davView struct {
	uid      string
	scope    syncscope.Scope
	projects map[string]opsync.Entity // live (not deleted) projects
	roles    map[string]string        // shared project id -> role
	tasks    []opsync.Entity          // live tasks
	byID     map[string]opsync.Entity // live tasks by id
	labels   map[string]string        // live label id -> name
	byName   map[string]string        // lower-case label name -> id
	modified map[string]int64
	names    map[string]string // task id -> resource name (when not <id>.ics)
	uids     map[string]string // task id -> UID (when not the id)
	cursor   int64
	// Indexes built once per request (server-query-costs): tasks per calendar in
	// list order, by "calendar NUL resource name", and task id per stored UID.
	byCal   map[string][]opsync.Entity
	byRes   map[string]opsync.Entity
	uidToID map[string]string
	// The user's live reminders by task id, and each reminder's task, loaded
	// once per request (caldav-interop D5): they are served as VALARMs.
	reminders map[string][]opsync.Entity
	remTask   map[string]string
	// ws places calendars in workspaces (caldav_workspaces.go); inboxName is
	// the Inbox's name in the user's language, read on first use.
	ws        *davWorkspaces
	inboxName string
	// today is the server's calendar date; bySeries groups the tasks pointing
	// at each series (occurrences.go, series-exceptions).
	today    string
	bySeries map[string][]opsync.Entity
	// hasSplit is set with bySeries when a task continues a split series.
	hasSplit bool
	// full is set once every task of the account is loaded (load). Until then
	// the view holds only the tasks a request asked for (narrow.go): the
	// lookups above are filled for them by the request's own reads, so the
	// work of a request follows what it asks, not the size of the account
	// (caldav-verified, "Large-account budgets").
	full bool
	// fetched and served are the task ids a partial view has read, and those
	// read with what serving them needs (narrow.go).
	fetched, served map[string]bool
	// labelsRead is set once the account's labels are loaded (labelsLoaded),
	// projectsRead once its projects are (calendars); until then the view
	// holds the projects its tasks and calendars name (narrow.go).
	labelsRead, projectsRead, rolesRead bool
	projectsFetched                     map[string]bool
	// order is each listed calendar's place in the listing (calendar-order).
	order map[string]int
}

// base loads the part of the view every request needs: the cursor, the
// projects and the workspaces, without any task.
func (d *davRequest) base() (*davView, error) {
	if d.view != nil {
		return d.view, nil
	}
	ctx, uid := d.ctx(), d.user.ID
	v := &davView{uid: uid, scope: d.scope, projects: map[string]opsync.Entity{}, roles: map[string]string{},
		labels: map[string]string{}, byName: map[string]string{}, today: localToday(d.s.now()), projectsFetched: map[string]bool{}}
	v.resetTasks()
	var err error
	// The cursor is read first: anything written while the view loads moves the
	// next token past it, so a client never misses a change.
	if v.cursor, err = d.s.sync.Cursor(ctx, uid); err != nil {
		return nil, err
	}
	if err := d.loadWorkspaces(ctx, v); err != nil {
		return nil, err
	}
	d.view = v
	return v, nil
}

// rolesLoaded reads the user's roles on shared projects once: what a
// calendar's privileges and a write's permission check read.
func (d *davRequest) rolesLoaded(v *davView) error {
	if v.rolesRead {
		return nil
	}
	ms, err := d.s.sync.Memberships(d.ctx(), v.uid)
	if err != nil {
		return err
	}
	for _, m := range ms {
		v.roles[m.ProjectID] = m.Role
	}
	v.rolesRead = true
	return nil
}

// calendars is the view with every project: what listing the calendars or
// serving a calendar's own properties reads.
func (d *davRequest) calendars() (*davView, error) {
	v, err := d.base()
	if err != nil || v.projectsRead {
		return v, err
	}
	if err := d.rolesLoaded(v); err != nil {
		return nil, err
	}
	projects, err := d.s.sync.List(d.ctx(), v.uid, "project", false)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		v.addProject(p)
	}
	v.projectsRead = true
	return v, nil
}

// addProject puts a live project in the view.
func (v *davView) addProject(p opsync.Entity) {
	id := idOf(p["id"])
	v.projects[id] = p
	v.ws.part.Projects[id] = opsync.PartitionProject{WorkspaceID: idOf(p["workspace_id"]), ParentID: idOf(p["parent_id"])}
}

// resetTasks empties the task part of the view.
func (v *davView) resetTasks() {
	v.tasks, v.byID, v.names, v.uids = nil, map[string]opsync.Entity{}, map[string]string{}, map[string]string{}
	v.modified, v.reminders, v.remTask = map[string]int64{}, map[string][]opsync.Entity{}, map[string]string{}
	v.byCal, v.byRes, v.uidToID = map[string][]opsync.Entity{}, map[string]opsync.Entity{}, map[string]string{}
	v.fetched, v.served = map[string]bool{}, map[string]bool{}
	// A partial view fills bySeries itself (narrow.go); a full one builds it on
	// first use from every task.
	v.bySeries, v.hasSplit = map[string][]opsync.Entity{}, false
	if v.ws != nil {
		v.ws.part.Tasks = map[string]opsync.PartitionTask{}
	}
}

// labelsLoaded reads the account's labels once.
func (d *davRequest) labelsLoaded(v *davView) error {
	if v.labelsRead {
		return nil
	}
	labels, err := d.s.sync.List(d.ctx(), v.uid, "label", false)
	if err != nil {
		return err
	}
	for _, l := range labels {
		id, name := idOf(l["id"]), idOf(l["name"])
		v.labels[id] = name
		if _, dup := v.byName[strings.ToLower(name)]; !dup {
			v.byName[strings.ToLower(name)] = id
		}
	}
	v.labelsRead = true
	return nil
}

// load is the whole view: every task of the account, indexed. Requests that
// serve or change a calendar as a whole use it; a partial view loaded before
// is completed in place, so a request may widen its view at any point.
func (d *davRequest) load() (*davView, error) {
	v, err := d.calendars()
	if err != nil || v.full {
		return v, err
	}
	ctx, uid := d.ctx(), d.user.ID
	if err := d.labelsLoaded(v); err != nil {
		return nil, err
	}
	v.resetTasks()
	v.bySeries = nil
	if v.tasks, err = d.s.sync.List(ctx, uid, "task", false); err != nil {
		return nil, err
	}
	for _, t := range v.tasks {
		v.addTask(t)
	}
	reminders, err := d.s.sync.List(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	v.addReminders(reminders)
	if v.modified, err = d.s.sync.Modified(ctx, uid, "task"); err != nil {
		return nil, err
	}
	rows, err := d.s.sync.DB().QueryContext(ctx, `SELECT task_id, name, uid FROM caldav_resources WHERE user_id = ?`, uid)
	if err != nil {
		return nil, err
	}
	if err := v.addResources(rows); err != nil {
		return nil, err
	}
	v.full = true
	v.index()
	return v, nil
}

// addTask puts a live task in the view.
func (v *davView) addTask(t opsync.Entity) {
	id := idOf(t["id"])
	v.byID[id] = t
	v.ws.part.Tasks[id] = opsync.PartitionTask{WorkspaceID: idOf(t["workspace_id"]), ProjectID: idOf(t["project_id"]), ParentID: idOf(t["parent_id"])}
}

// addReminders records reminders: every one by id, the live VALARM ones by
// their (live) task.
func (v *davView) addReminders(reminders []opsync.Entity) {
	for _, r := range reminders {
		tid := idOf(r["task_id"])
		v.remTask[idOf(r["id"])] = tid
		// A location reminder is never a VALARM (location-reminders D6): it is
		// not served, so a PUT without it never deletes it either.
		if _, live := v.byID[tid]; live && isNullish(r["deleted_at"]) && !opsync.IsLocationKind(idOf(r["kind"])) {
			v.reminders[tid] = append(v.reminders[tid], r)
		}
	}
}

// addResources records the client-chosen names and UIDs of live tasks.
func (v *davView) addResources(rows *sql.Rows) error {
	defer rows.Close()
	for rows.Next() {
		var id, name, u string
		if err := rows.Scan(&id, &name, &u); err != nil {
			return err
		}
		if _, live := v.byID[id]; live {
			v.names[id], v.uids[id] = name, u
		}
	}
	return rows.Err()
}

// index builds the per-request lookups so that finding a resource or a UID
// does not scan every task (a multiget of n hrefs was n times the account).
func (v *davView) index() {
	v.byCal, v.byRes, v.uidToID = map[string][]opsync.Entity{}, map[string]opsync.Entity{}, map[string]string{}
	for _, t := range v.tasks {
		cal := v.calendarOf(t)
		v.byCal[cal] = append(v.byCal[cal], t)
		key := cal + "\x00" + v.resourceName(idOf(t["id"]))
		if _, dup := v.byRes[key]; !dup {
			v.byRes[key] = t
		}
	}
	for id, u := range v.uids {
		if prev, dup := v.uidToID[u]; !dup || id < prev {
			v.uidToID[u] = id
		}
	}
}
