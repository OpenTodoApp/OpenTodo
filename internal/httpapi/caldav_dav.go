package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/caldav"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// inboxCalendar is the path segment of the Inbox calendar (tasks without a project).
const inboxCalendar = "inbox"

// davPath is a parsed /dav/ path.
type davPath struct {
	kind     string // root, principal, home, calendar, resource
	calendar string // inbox or a project id
	name     string // resource name (calendar member)
}

const (
	kindRoot      = "root"
	kindPrincipal = "principal"
	kindHome      = "home"
	kindCalendar  = "calendar"
	kindResource  = "resource"
)

// parseDavPath resolves a request path for user uid; ok is false for anything
// outside the user's own tree (other users' ids answer 404, never 403).
func parseDavPath(p, uid string) (davPath, bool) {
	rest, ok := strings.CutPrefix(p, "/dav")
	if !ok {
		return davPath{}, false
	}
	rest = strings.Trim(rest, "/")
	if rest == "" {
		return davPath{kind: kindRoot}, true
	}
	seg := strings.Split(rest, "/")
	switch {
	case seg[0] == "principals" && len(seg) == 2 && seg[1] == uid:
		return davPath{kind: kindPrincipal}, true
	case seg[0] == "calendars" && len(seg) >= 2 && seg[1] == uid:
		switch len(seg) {
		case 2:
			return davPath{kind: kindHome}, true
		case 3:
			return davPath{kind: kindCalendar, calendar: seg[2]}, seg[2] != ""
		case 4:
			return davPath{kind: kindResource, calendar: seg[2], name: seg[3]}, seg[2] != "" && seg[3] != ""
		}
	}
	return davPath{}, false
}

func principalHref(uid string) string { return "/dav/principals/" + uid + "/" }
func homeHref(uid string) string      { return "/dav/calendars/" + uid + "/" }
func calendarHref(uid, cal string) string {
	return homeHref(uid) + url.PathEscape(cal) + "/"
}
func resourceHref(uid, cal, name string) string { return calendarHref(uid, cal) + url.PathEscape(name) }

// handleDAV is the CalDAV endpoint: 404 while disabled (before any
// authentication), a redirect for the well-known address, then Basic auth.
func (s *Server) handleDAV(w http.ResponseWriter, r *http.Request) {
	if !s.caldavEnabled(r.Context()) {
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/.well-known/") {
		http.Redirect(w, r, "/dav/", http.StatusMovedPermanently)
		return
	}
	u, apID, ok := s.davAuth(w, r)
	if !ok {
		return
	}
	w.Header().Set("DAV", "1, 3, calendar-access")
	p, ok := parseDavPath(r.URL.Path, u.ID)
	if !ok {
		http.NotFound(w, r)
		return
	}
	d := &davRequest{s: s, w: w, r: r, user: u, device: "caldav:" + apID, path: p}
	switch r.Method {
	case http.MethodOptions:
		w.Header().Set("Allow", "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR")
		w.WriteHeader(http.StatusOK)
	case "PROPFIND":
		d.propfind()
	case "REPORT":
		d.report()
	case http.MethodGet, http.MethodHead:
		d.get()
	case http.MethodPut:
		d.put()
	case http.MethodDelete:
		d.delete()
	case "MKCALENDAR":
		d.mkcalendar()
	case "PROPPATCH":
		d.proppatch()
	default:
		w.Header().Set("Allow", "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// davRequest carries one authenticated CalDAV request.
type davRequest struct {
	s      *Server
	w      http.ResponseWriter
	r      *http.Request
	user   *auth.User
	device string
	path   davPath
	view   *davView
}

func (d *davRequest) ctx() context.Context { return d.r.Context() }

func (d *davRequest) fail(err error) {
	d.s.log.Error("caldav request failed", "method", d.r.Method, "err", err)
	http.Error(d.w, "internal error", http.StatusInternalServerError)
}

func (d *davRequest) precondition(code int, prefix, element string) {
	d.w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	d.w.WriteHeader(code)
	_, _ = d.w.Write(caldav.ErrorBody(prefix, element))
}

func (d *davRequest) multistatus(m *caldav.Multistatus) {
	d.w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	d.w.WriteHeader(http.StatusMultiStatus)
	_, _ = d.w.Write(m.Bytes())
}

// davView is the user's data as CalDAV sees it, loaded once per request.
type davView struct {
	uid      string
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
}

func (d *davRequest) load() (*davView, error) {
	if d.view != nil {
		return d.view, nil
	}
	ctx, uid := d.ctx(), d.user.ID
	v := &davView{uid: uid, projects: map[string]opsync.Entity{}, roles: map[string]string{}, byID: map[string]opsync.Entity{},
		labels: map[string]string{}, byName: map[string]string{}, names: map[string]string{}, uids: map[string]string{}}
	var err error
	// The cursor is read first: anything written while the view loads moves the
	// next token past it, so a client never misses a change.
	if v.cursor, err = d.s.sync.Cursor(ctx, uid); err != nil {
		return nil, err
	}
	projects, err := d.s.sync.List(ctx, uid, "project", false)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		v.projects[idOf(p["id"])] = p
	}
	ms, err := d.s.sync.Memberships(ctx, uid)
	if err != nil {
		return nil, err
	}
	for _, m := range ms {
		v.roles[m.ProjectID] = m.Role
	}
	if v.tasks, err = d.s.sync.List(ctx, uid, "task", false); err != nil {
		return nil, err
	}
	for _, t := range v.tasks {
		v.byID[idOf(t["id"])] = t
	}
	labels, err := d.s.sync.List(ctx, uid, "label", false)
	if err != nil {
		return nil, err
	}
	for _, l := range labels {
		id, name := idOf(l["id"]), idOf(l["name"])
		v.labels[id] = name
		if _, dup := v.byName[strings.ToLower(name)]; !dup {
			v.byName[strings.ToLower(name)] = id
		}
	}
	if v.modified, err = d.s.sync.Modified(ctx, uid, "task"); err != nil {
		return nil, err
	}
	rows, err := d.s.sync.DB().QueryContext(ctx, `SELECT task_id, name, uid FROM caldav_resources`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, u string
		if err := rows.Scan(&id, &name, &u); err != nil {
			return nil, err
		}
		if _, live := v.byID[id]; live {
			v.names[id], v.uids[id] = name, u
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	d.view = v
	return v, nil
}

// calendarVisible reports whether cal names a calendar of this user: the Inbox
// or a live, non-archived project.
func (v *davView) calendarVisible(cal string) bool {
	if cal == inboxCalendar {
		return true
	}
	p, ok := v.projects[cal]
	return ok && string(p["archived"]) != "true"
}

// calendarIDs lists the visible calendars, Inbox first, projects by position.
func (v *davView) calendarIDs() []string {
	out := []string{inboxCalendar}
	var ps []opsync.Entity
	for id := range v.projects {
		if v.calendarVisible(id) {
			ps = append(ps, v.projects[id])
		}
	}
	sort.SliceStable(ps, func(i, j int) bool {
		pi, pj := numberOf(ps[i]["position"]), numberOf(ps[j]["position"])
		if pi != pj {
			return pi < pj
		}
		return idOf(ps[i]["id"]) < idOf(ps[j]["id"])
	})
	for _, p := range ps {
		out = append(out, idOf(p["id"]))
	}
	return out
}

func numberOf(raw json.RawMessage) float64 {
	var f float64
	_ = json.Unmarshal(raw, &f)
	return f
}

// role is the user's role on a calendar: owner for the Inbox and personal
// projects, the membership role for shared ones.
func (v *davView) role(cal string) string {
	if r, ok := v.roles[cal]; ok {
		return r
	}
	return opsync.RoleOwner
}

// calendarOf is the calendar a live task is served in ("" when none: its
// project is archived, deleted or unknown).
func (v *davView) calendarOf(t opsync.Entity) string {
	pid := idOf(t["project_id"])
	if pid == "" {
		return inboxCalendar
	}
	if v.calendarVisible(pid) {
		return pid
	}
	return ""
}

func (v *davView) tasksIn(cal string) []opsync.Entity {
	var out []opsync.Entity
	for _, t := range v.tasks {
		if v.calendarOf(t) == cal {
			out = append(out, t)
		}
	}
	return out
}

func (v *davView) resourceName(id string) string {
	if n, ok := v.names[id]; ok {
		return n
	}
	return id + ".ics"
}

func (v *davView) uidOf(id string) string {
	if u, ok := v.uids[id]; ok {
		return u
	}
	return id
}

// find returns the live task stored under name in calendar cal, or nil.
func (v *davView) find(cal, name string) opsync.Entity {
	for _, t := range v.tasksIn(cal) {
		if v.resourceName(idOf(t["id"])) == name {
			return t
		}
	}
	return nil
}

// taskByUID returns the live task with the given UID anywhere, or nil.
func (v *davView) taskByUID(uid string) opsync.Entity {
	for id, u := range v.uids {
		if u == uid {
			return v.byID[id]
		}
	}
	if t, ok := v.byID[uid]; ok {
		if _, mapped := v.uids[uid]; !mapped {
			return t
		}
	}
	return nil
}

// encode renders a task as calendar data and its ETag.
func (v *davView) encode(t opsync.Entity) ([]byte, string) {
	id := idOf(t["id"])
	ct := caldav.Task{
		UID: v.uidOf(id), Title: idOf(t["title"]), Description: idOf(t["description"]),
		Priority: int(numberOf(t["priority"])), CreatedAt: int64(numberOf(t["created_at"])),
		Recurrence: idOf(t["recurrence"]), Extra: idOf(t["ical_extra"]), Modified: v.modified[id],
	}
	if ct.Priority == 0 {
		ct.Priority = 4
	}
	if d := decodeDue(t["due"]); d != nil {
		ct.Due = &caldav.Due{Date: d.Date, Time: d.Time, TZ: d.TZ}
	}
	if !isNullish(t["completed_at"]) {
		c := int64(numberOf(t["completed_at"]))
		ct.CompletedAt = &c
	}
	var labels []string
	_ = json.Unmarshal(t["labels"], &labels)
	for _, l := range labels {
		if name, ok := v.labels[l]; ok && name != "" {
			ct.Categories = append(ct.Categories, name)
		}
	}
	if pid := idOf(t["parent_id"]); pid != "" {
		if _, ok := v.byID[pid]; ok {
			ct.ParentUID = v.uidOf(pid)
		}
	}
	body := caldav.Encode(ct)
	sum := sha256.Sum256(body)
	return body, `"` + hex.EncodeToString(sum[:16]) + `"`
}

func syncToken(seq int64) string { return "urn:opentodo:sync:" + strconv.FormatInt(seq, 10) }

// parseSyncToken accepts this server's tokens (and the short ot-<seq> form).
func parseSyncToken(tok string) (int64, bool) {
	tok = strings.TrimSpace(tok)
	n, ok := strings.CutPrefix(tok, "urn:opentodo:sync:")
	if !ok {
		n, ok = strings.CutPrefix(tok, "ot-")
	}
	if !ok {
		return 0, false
	}
	seq, err := strconv.ParseInt(n, 10, 64)
	return seq, err == nil && seq >= 0
}

// ---- properties ----

type propFunc func() string

func pn(space, local string) caldav.PropName { return caldav.PropName{Space: space, Local: local} }

var (
	pResourceType      = pn(caldav.NSDAV, "resourcetype")
	pDisplayName       = pn(caldav.NSDAV, "displayname")
	pCurrentPrincipal  = pn(caldav.NSDAV, "current-user-principal")
	pPrincipalURL      = pn(caldav.NSDAV, "principal-URL")
	pPrincipalColl     = pn(caldav.NSDAV, "principal-collection-set")
	pOwner             = pn(caldav.NSDAV, "owner")
	pPrivileges        = pn(caldav.NSDAV, "current-user-privilege-set")
	pReports           = pn(caldav.NSDAV, "supported-report-set")
	pSyncToken         = pn(caldav.NSDAV, "sync-token")
	pETag              = pn(caldav.NSDAV, "getetag")
	pContentType       = pn(caldav.NSDAV, "getcontenttype")
	pContentLength     = pn(caldav.NSDAV, "getcontentlength")
	pLastModified      = pn(caldav.NSDAV, "getlastmodified")
	pHomeSet           = pn(caldav.NSCalDAV, "calendar-home-set")
	pAddressSet        = pn(caldav.NSCalDAV, "calendar-user-address-set")
	pComponentSet      = pn(caldav.NSCalDAV, "supported-calendar-component-set")
	pCalendarData      = pn(caldav.NSCalDAV, "calendar-data")
	pSupportedData     = pn(caldav.NSCalDAV, "supported-calendar-data")
	pMaxResourceSize   = pn(caldav.NSCalDAV, "max-resource-size")
	pCalendarDesc      = pn(caldav.NSCalDAV, "calendar-description")
	pCTag              = pn(caldav.NSCS, "getctag")
	pColor             = pn(caldav.NSApple, "calendar-color")
	pOrder             = pn(caldav.NSApple, "calendar-order")
	reportSet          = `<d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report><d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report><d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>`
	privilegesReadOnly = privileges("read", "read-current-user-privilege-set")
)

func privileges(names ...string) string {
	var b strings.Builder
	for _, n := range names {
		b.WriteString("<d:privilege><d:" + n + "/></d:privilege>")
	}
	return b.String()
}

// calendarPrivileges follows the sharing role table: viewers read, editors write
// tasks, admins and owners also rename and recolour; the Inbox cannot be renamed.
func calendarPrivileges(cal, role string) string {
	switch {
	case role == opsync.RoleViewer:
		return privilegesReadOnly
	case role == opsync.RoleEditor || cal == inboxCalendar:
		return privileges("read", "read-current-user-privilege-set", "write-content", "bind", "unbind")
	}
	return privileges("read", "read-current-user-privilege-set", "write", "write-properties", "write-content", "bind", "unbind")
}

func (d *davRequest) commonProps(m map[caldav.PropName]propFunc) {
	uid := d.user.ID
	m[pCurrentPrincipal] = func() string { return caldav.Href(principalHref(uid)) }
	m[pPrincipalColl] = func() string { return caldav.Href("/dav/principals/") }
}

func (d *davRequest) rootProps() map[caldav.PropName]propFunc {
	m := map[caldav.PropName]propFunc{
		pResourceType: func() string { return "<d:collection/>" },
		pDisplayName:  func() string { return "OpenTodo" },
	}
	d.commonProps(m)
	return m
}

func (d *davRequest) principalProps() map[caldav.PropName]propFunc {
	uid := d.user.ID
	m := map[caldav.PropName]propFunc{
		pResourceType: func() string { return "<d:principal/>" },
		pDisplayName: func() string {
			if d.user.Name != "" {
				return caldav.Esc(d.user.Name)
			}
			return caldav.Esc(d.user.Email)
		},
		pPrincipalURL: func() string { return caldav.Href(principalHref(uid)) },
		pHomeSet:      func() string { return caldav.Href(homeHref(uid)) },
		pAddressSet:   func() string { return caldav.Href("mailto:" + d.user.Email) },
		pReports:      func() string { return "" },
	}
	d.commonProps(m)
	return m
}

func (d *davRequest) homeProps() map[caldav.PropName]propFunc {
	uid := d.user.ID
	m := map[caldav.PropName]propFunc{
		pResourceType: func() string { return "<d:collection/>" },
		pDisplayName:  func() string { return "Calendars" },
		pOwner:        func() string { return caldav.Href(principalHref(uid)) },
		pPrivileges:   func() string { return privileges("read", "read-current-user-privilege-set", "bind", "unbind") },
		pReports:      func() string { return reportSet },
	}
	d.commonProps(m)
	return m
}

func (d *davRequest) calendarProps(v *davView, cal string) map[caldav.PropName]propFunc {
	uid := d.user.ID
	tok := syncToken(v.cursor)
	m := map[caldav.PropName]propFunc{
		pResourceType: func() string { return "<d:collection/><c:calendar/>" },
		pDisplayName: func() string {
			if cal == inboxCalendar {
				return "Inbox"
			}
			return caldav.Esc(idOf(v.projects[cal]["name"]))
		},
		pOwner:           func() string { return caldav.Href(principalHref(uid)) },
		pPrivileges:      func() string { return calendarPrivileges(cal, v.role(cal)) },
		pReports:         func() string { return reportSet },
		pComponentSet:    func() string { return `<c:comp name="VTODO"/>` },
		pSupportedData:   func() string { return `<c:calendar-data content-type="text/calendar" version="2.0"/>` },
		pMaxResourceSize: func() string { return strconv.Itoa(caldav.MaxBodyBytes) },
		pCTag:            func() string { return caldav.Esc(tok) },
		pSyncToken:       func() string { return caldav.Esc(tok) },
	}
	if cal != inboxCalendar {
		m[pColor] = func() string { return caldav.Esc(idOf(v.projects[cal]["color"])) }
		order := 1
		for i, id := range v.calendarIDs() {
			if id == cal {
				order = i
			}
		}
		m[pOrder] = func() string { return strconv.Itoa(order) }
	}
	d.commonProps(m)
	return m
}

func (d *davRequest) resourceProps(v *davView, t opsync.Entity) map[caldav.PropName]propFunc {
	body, etag := v.encode(t)
	mod := v.modified[idOf(t["id"])]
	return map[caldav.PropName]propFunc{
		pResourceType:  func() string { return "" },
		pETag:          func() string { return caldav.Esc(etag) },
		pContentType:   func() string { return "text/calendar; charset=utf-8; component=vtodo" },
		pContentLength: func() string { return strconv.Itoa(len(body)) },
		pLastModified:  func() string { return time.UnixMilli(mod).UTC().Format(http.TimeFormat) },
		pCalendarData:  func() string { return caldav.Esc(string(body)) },
	}
}

// allpropSkip lists properties left out of <allprop/> (expensive or large).
var allpropSkip = map[caldav.PropName]bool{pCalendarData: true}

// respond adds one resource to m with the requested properties.
func respond(m *caldav.Multistatus, href string, props map[caldav.PropName]propFunc, names []caldav.PropName, all bool) {
	var found []caldav.PropValue
	var missing []caldav.PropName
	if all {
		keys := make([]caldav.PropName, 0, len(props))
		for k := range props {
			if !allpropSkip[k] {
				keys = append(keys, k)
			}
		}
		sort.Slice(keys, func(i, j int) bool { return keys[i].Space+keys[i].Local < keys[j].Space+keys[j].Local })
		names = keys
	}
	for _, n := range names {
		if f, ok := props[n]; ok {
			found = append(found, caldav.PropValue{Name: n, Inner: f()})
		} else {
			missing = append(missing, n)
		}
	}
	m.Response(href, found, missing)
}

// ---- PROPFIND ----

func (d *davRequest) propfind() {
	body, err := caldav.ParseXML(d.r.Body)
	if err != nil {
		http.Error(d.w, err.Error(), http.StatusBadRequest)
		return
	}
	if body != nil && !body.Is(caldav.NSDAV, "propfind") {
		http.Error(d.w, "expected a DAV:propfind body", http.StatusBadRequest)
		return
	}
	names, all := caldav.RequestedProps(body)
	depth1 := d.r.Header.Get("Depth") != "0"
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	uid := d.user.ID
	m := caldav.NewMultistatus()
	switch d.path.kind {
	case kindRoot:
		respond(m, "/dav/", d.rootProps(), names, all)
	case kindPrincipal:
		respond(m, principalHref(uid), d.principalProps(), names, all)
	case kindHome:
		respond(m, homeHref(uid), d.homeProps(), names, all)
		if depth1 {
			for _, cal := range v.calendarIDs() {
				respond(m, calendarHref(uid, cal), d.calendarProps(v, cal), names, all)
			}
		}
	case kindCalendar:
		if !v.calendarVisible(d.path.calendar) {
			http.NotFound(d.w, d.r)
			return
		}
		respond(m, calendarHref(uid, d.path.calendar), d.calendarProps(v, d.path.calendar), names, all)
		if depth1 {
			for _, t := range v.tasksIn(d.path.calendar) {
				respond(m, resourceHref(uid, d.path.calendar, v.resourceName(idOf(t["id"]))), d.resourceProps(v, t), names, all)
			}
		}
	case kindResource:
		t := d.resource(v)
		if t == nil {
			http.NotFound(d.w, d.r)
			return
		}
		respond(m, resourceHref(uid, d.path.calendar, d.path.name), d.resourceProps(v, t), names, all)
	}
	d.multistatus(m)
}

// resource returns the task addressed by a resource path, or nil.
func (d *davRequest) resource(v *davView) opsync.Entity {
	if d.path.kind != kindResource || !v.calendarVisible(d.path.calendar) {
		return nil
	}
	return v.find(d.path.calendar, d.path.name)
}

// ---- GET / HEAD ----

func (d *davRequest) get() {
	if d.path.kind != kindResource {
		d.w.Header().Set("Allow", "OPTIONS, PROPFIND, PROPPATCH, REPORT, MKCALENDAR, DELETE")
		http.Error(d.w, "collections have no body; use PROPFIND or REPORT", http.StatusMethodNotAllowed)
		return
	}
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	t := d.resource(v)
	if t == nil {
		http.NotFound(d.w, d.r)
		return
	}
	body, etag := v.encode(t)
	h := d.w.Header()
	h.Set("Content-Type", "text/calendar; charset=utf-8")
	h.Set("ETag", etag)
	h.Set("Last-Modified", time.UnixMilli(v.modified[idOf(t["id"])]).UTC().Format(http.TimeFormat))
	h.Set("Content-Length", strconv.Itoa(len(body)))
	h.Set("Cache-Control", "no-store")
	if d.r.Header.Get("If-None-Match") == etag {
		d.w.WriteHeader(http.StatusNotModified)
		return
	}
	d.w.WriteHeader(http.StatusOK)
	if d.r.Method == http.MethodGet {
		_, _ = d.w.Write(body)
	}
}

// ---- REPORT ----

func (d *davRequest) report() {
	body, err := caldav.ParseXML(d.r.Body)
	if err != nil || body == nil {
		http.Error(d.w, "malformed REPORT body", http.StatusBadRequest)
		return
	}
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	if d.path.kind != kindCalendar || !v.calendarVisible(d.path.calendar) {
		if d.path.kind == kindCalendar || d.path.kind == kindResource {
			http.NotFound(d.w, d.r)
			return
		}
		d.precondition(http.StatusForbidden, "d", "supported-report")
		return
	}
	names, all := caldav.RequestedProps(body)
	switch {
	case body.Is(caldav.NSCalDAV, "calendar-multiget"):
		d.multiget(v, body, names, all)
	case body.Is(caldav.NSCalDAV, "calendar-query"):
		d.query(v, body, names, all)
	case body.Is(caldav.NSDAV, "sync-collection"):
		d.syncCollection(v, body, names, all)
	default:
		d.precondition(http.StatusForbidden, "d", "supported-report")
	}
}

func (d *davRequest) multiget(v *davView, body *caldav.Node, names []caldav.PropName, all bool) {
	uid, cal := d.user.ID, d.path.calendar
	prefix := calendarHref(uid, cal)
	m := caldav.NewMultistatus()
	for _, h := range body.Children {
		if !h.Is(caldav.NSDAV, "href") {
			continue
		}
		raw := strings.TrimSpace(h.Text)
		u, err := url.Parse(raw)
		var t opsync.Entity
		if err == nil {
			p := u.EscapedPath()
			if strings.HasPrefix(p, prefix) {
				if name, err := url.PathUnescape(strings.TrimPrefix(p, prefix)); err == nil && !strings.Contains(name, "/") {
					t = v.find(cal, name)
				}
			}
		}
		if t == nil {
			m.Status(raw, http.StatusNotFound)
			continue
		}
		respond(m, resourceHref(uid, cal, v.resourceName(idOf(t["id"]))), d.resourceProps(v, t), names, all)
	}
	d.multistatus(m)
}

func (d *davRequest) query(v *davView, body *caldav.Node, names []caldav.PropName, all bool) {
	uid, cal := d.user.ID, d.path.calendar
	filter := body.Child(caldav.NSCalDAV, "filter")
	m := caldav.NewMultistatus()
	for _, t := range v.tasksIn(cal) {
		data, _ := v.encode(t)
		comp, err := caldav.Parse(data)
		if err != nil || !caldav.Matches(filter, comp) {
			continue
		}
		respond(m, resourceHref(uid, cal, v.resourceName(idOf(t["id"]))), d.resourceProps(v, t), names, all)
	}
	d.multistatus(m)
}

// syncCollection answers RFC 6578: with an empty token every member, otherwise
// the members whose task changed since the token and the removed ones (tasks
// tombstoned, purged or moved to another calendar since then).
func (d *davRequest) syncCollection(v *davView, body *caldav.Node, names []caldav.PropName, all bool) {
	uid, cal := d.user.ID, d.path.calendar
	tokNode := body.Child(caldav.NSDAV, "sync-token")
	tok := ""
	if tokNode != nil {
		tok = strings.TrimSpace(tokNode.Text)
	}
	m := caldav.NewMultistatus()
	m.SyncToken(syncToken(v.cursor))
	if tok == "" {
		for _, t := range v.tasksIn(cal) {
			respond(m, resourceHref(uid, cal, v.resourceName(idOf(t["id"]))), d.resourceProps(v, t), names, all)
		}
		d.multistatus(m)
		return
	}
	since, ok := parseSyncToken(tok)
	if !ok || since > v.cursor {
		// Unknown or from the future (a restored backup): the client starts over.
		d.precondition(http.StatusForbidden, "d", "valid-sync-token")
		return
	}
	delta, err := d.s.sync.ChangedSince(d.ctx(), uid, since)
	if err != nil {
		d.fail(err)
		return
	}
	candidates := map[string]bool{}
	for id := range delta.Fields["task"] {
		candidates[id] = true
	}
	for id := range delta.Purged["task"] {
		candidates[id] = true
	}
	// A renamed label changes CATEGORIES of every task that carries it.
	if changed := delta.Fields["label"]; len(changed) > 0 {
		for _, t := range v.tasks {
			var labels []string
			_ = json.Unmarshal(t["labels"], &labels)
			for _, l := range labels {
				if changed[l] != nil {
					candidates[idOf(t["id"])] = true
				}
			}
		}
	}
	ids := make([]string, 0, len(candidates))
	for id := range candidates {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if t, live := v.byID[id]; live && v.calendarOf(t) == cal {
			respond(m, resourceHref(uid, cal, v.resourceName(id)), d.resourceProps(v, t), names, all)
			continue
		}
		f := delta.Fields["task"][id]
		if delta.Purged["task"][id] || f["deleted_at"] || f["project_id"] {
			name := id + ".ics"
			if n, err := d.storedName(id); err == nil && n != "" {
				name = n
			}
			m.Status(resourceHref(uid, cal, name), http.StatusNotFound)
		}
	}
	d.multistatus(m)
}

// storedName is the client-chosen resource name of a task that is no longer
// live ("" when it used the default name).
func (d *davRequest) storedName(id string) (string, error) {
	var name string
	err := d.s.sync.DB().QueryRowContext(d.ctx(), `SELECT name FROM caldav_resources WHERE task_id = ?`, id).Scan(&name)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	return name, nil
}
