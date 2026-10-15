package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/caldav"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/recurrence"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Every CalDAV write is a batch of ops applied with ApplyStrict under the
// device id caldav:<app-password-id> and server time; nothing is written to
// task or project rows directly (design D5).

// usableID matches a client-chosen UID or collection name we can use as an
// entity id as is.
var usableID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._@+-]{0,63}$`)

// maxExtraBytes keeps ical_extra inside the op value limit once JSON-encoded.
const maxExtraBytes = opsync.MaxValueBytes - 4096

func (d *davRequest) op(entity, id, field string, value json.RawMessage, ts int64) opsync.Op {
	return opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: field, Value: value, TS: ts, Device: d.device}
}

// apply runs a batch and wakes every device; it maps refusals to responses and
// reports whether the caller may continue.
func (d *davRequest) apply(ops []opsync.Op) (opsync.ApplyResult, error) {
	res, err := d.s.sync.ApplyStrict(d.ctx(), d.user.ID, ops)
	if err == nil && res.Applied > 0 {
		d.s.sync.NotifyApplied(res, d.device)
	}
	return res, err
}

// writeError answers a failed apply: a refused op is a 403 need-privileges.
func (d *davRequest) applyError(err error) {
	var rej *opsync.RejectedError
	switch {
	case errors.As(err, &rej):
		d.precondition(http.StatusForbidden, "d", "need-privileges")
	case errors.Is(err, opsync.ErrInvalidOp):
		d.precondition(http.StatusForbidden, "c", "valid-calendar-object-resource")
	default:
		d.fail(err)
	}
}

// checkPreconditions applies If-Match / If-None-Match to a resource whose
// current ETag is etag ("" when it does not exist). false means 412 was sent.
func (d *davRequest) checkPreconditions(etag string) bool {
	if inm := strings.TrimSpace(d.r.Header.Get("If-None-Match")); inm != "" {
		if inm == "*" && etag != "" || etag != "" && etagListHas(inm, etag) {
			http.Error(d.w, "precondition failed", http.StatusPreconditionFailed)
			return false
		}
	}
	if im := strings.TrimSpace(d.r.Header.Get("If-Match")); im != "" {
		if etag == "" || (im != "*" && !etagListHas(im, etag)) {
			http.Error(d.w, "precondition failed", http.StatusPreconditionFailed)
			return false
		}
	}
	return true
}

func etagListHas(list, etag string) bool {
	for _, e := range strings.Split(list, ",") {
		e = strings.TrimPrefix(strings.TrimSpace(e), "W/")
		if e == etag {
			return true
		}
	}
	return false
}

// ---- PUT ----

func (d *davRequest) put() {
	if d.path.kind != kindResource {
		http.Error(d.w, "PUT is only allowed on calendar resources", http.StatusMethodNotAllowed)
		return
	}
	if ct := d.r.Header.Get("Content-Type"); ct != "" {
		if mt, _, err := mime.ParseMediaType(ct); err != nil || mt != "text/calendar" {
			d.precondition(http.StatusUnsupportedMediaType, "c", "supported-calendar-data")
			return
		}
	}
	raw, err := io.ReadAll(io.LimitReader(d.r.Body, caldav.MaxBodyBytes+1))
	if err != nil {
		http.Error(d.w, "could not read body", http.StatusBadRequest)
		return
	}
	if len(raw) > caldav.MaxBodyBytes {
		d.precondition(http.StatusForbidden, "c", "max-resource-size")
		return
	}
	in, err := caldav.Decode(raw)
	switch {
	case errors.Is(err, caldav.ErrUnsupportedComponent):
		d.precondition(http.StatusForbidden, "c", "supported-calendar-component")
		return
	case errors.Is(err, caldav.ErrInvalidObject):
		d.precondition(http.StatusForbidden, "c", "valid-calendar-object-resource")
		return
	case err != nil:
		d.precondition(http.StatusUnsupportedMediaType, "c", "valid-calendar-data")
		return
	}
	if len(in.Extra) > maxExtraBytes {
		d.precondition(http.StatusForbidden, "c", "max-resource-size")
		return
	}
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	cal := d.path.calendar
	if !v.calendarVisible(cal) {
		http.Error(d.w, "calendar not found", http.StatusConflict)
		return
	}
	if v.role(cal) == opsync.RoleViewer {
		d.precondition(http.StatusForbidden, "d", "need-privileges")
		return
	}
	existing := v.find(cal, d.path.name)
	etag := ""
	if existing != nil {
		_, etag = v.encode(existing)
	}
	if !d.checkPreconditions(etag) {
		return
	}
	// The same UID in another calendar: the client moved the task here.
	if existing == nil {
		if other := v.taskByUID(in.UID); other != nil && v.calendarOf(other) != "" {
			existing = other
		}
	}
	var id string
	var created bool
	if existing == nil {
		id, err = d.create(v, in)
		created = true
	} else {
		id, err = d.update(v, existing, in)
	}
	if err != nil {
		d.applyError(err)
		return
	}
	d.view = nil
	v, err = d.load()
	if err != nil {
		d.fail(err)
		return
	}
	if t := v.byID[id]; t != nil {
		_, newTag := v.encode(t)
		d.w.Header().Set("ETag", newTag)
	}
	if created {
		d.w.WriteHeader(http.StatusCreated)
		return
	}
	d.w.WriteHeader(http.StatusNoContent)
}

// projectValue is the project_id JSON value of a calendar.
func projectValue(cal string) json.RawMessage {
	if cal == inboxCalendar {
		return json.RawMessage("null")
	}
	return mustJSON(cal)
}

// fields maps an inbound VTODO onto task field values (everything but
// created_at, completed_at and the recurrence decision, which depend on the
// current task). New labels needed for unknown categories are returned as ops.
func (d *davRequest) fields(v *davView, in *caldav.Inbound, current opsync.Entity, ts int64) (map[string]json.RawMessage, []opsync.Op) {
	f := map[string]json.RawMessage{
		"title":       mustJSON(in.Title),
		"description": mustJSON(in.Description),
		"priority":    mustJSON(in.Priority),
	}
	if in.Due != nil {
		f["due"] = mustJSON(due{Date: in.Due.Date, Time: in.Due.Time, TZ: in.Due.TZ})
	} else {
		f["due"] = json.RawMessage("null")
	}
	// Deadlines (design D6): DTSTART and a differing DUE carry both dates. A DUE
	// alone on a task that has a deadline is the deadline, as it was served;
	// without DUE the deadline is gone. The field is only written when a
	// deadline is or was set, so tasks without one keep their op footprint.
	deadline := json.RawMessage("null")
	switch {
	case in.Deadline != "":
		deadline = mustJSON(in.Deadline)
	case in.DueOnly && !isNullish(current["deadline"]):
		deadline = mustJSON(in.Due.Date)
		f["due"] = json.RawMessage("null")
	}
	if !isNullish(deadline) || !isNullish(current["deadline"]) {
		f["deadline"] = deadline
	}
	// X-OPENTODO-START / -EVENING (someday-and-evening D7): only a property the
	// client sent changes the field; absence leaves it alone.
	if in.Start != nil {
		f["start"] = mustJSON(*in.Start)
	}
	if in.Evening != nil && (*in.Evening || string(current["evening"]) == "true") {
		f["evening"] = mustJSON(*in.Evening)
	}
	extra := in.Extra
	f["parent_id"] = json.RawMessage("null")
	if in.ParentUID != "" {
		if p := v.taskByUID(in.ParentUID); p != nil {
			f["parent_id"] = mustJSON(idOf(p["id"]))
		} else {
			// Not known yet (the client may upload the parent later): keep the
			// relation as client data so the next PUT can resolve it.
			line := caldav.Prop{Name: "RELATED-TO", Value: caldav.EscapeText(in.ParentUID)}.Line()
			if extra == "" {
				extra = line
			} else {
				extra += "\r\n" + line
			}
		}
	}
	// DEPENDS-ON lines name blockers by UID (task-dependencies D10): those that
	// resolve in this calendar become blocked_by; the rest stay client data.
	// Blockers outside this calendar (other projects of the same sharing) are
	// kept, since the client never saw them.
	var currentBlockers []string
	_ = json.Unmarshal(current["blocked_by"], &currentBlockers)
	var blockedBy []string
	for _, b := range currentBlockers {
		if _, here := v.byID[b]; !here {
			blockedBy = append(blockedBy, b)
		}
	}
	for _, uid := range in.DependsOn {
		if uid == in.UID {
			continue
		}
		if b := v.taskByUID(uid); b != nil && !slices.Contains(blockedBy, idOf(b["id"])) {
			blockedBy = append(blockedBy, idOf(b["id"]))
			continue
		}
		line := caldav.Prop{Name: "RELATED-TO", Params: []caldav.Param{{Name: "RELTYPE", Values: []string{"DEPENDS-ON"}}}, Value: caldav.EscapeText(uid)}.Line()
		if extra == "" {
			extra = line
		} else {
			extra += "\r\n" + line
		}
	}
	if len(blockedBy) > 0 || len(currentBlockers) > 0 {
		if blockedBy == nil {
			blockedBy = []string{}
		}
		f["blocked_by"] = mustJSON(blockedBy)
	}
	if extra == "" {
		f["ical_extra"] = json.RawMessage("null")
	} else {
		f["ical_extra"] = mustJSON(extra)
	}
	// CATEGORIES name the user's labels; unknown names become new labels. Label
	// ids this user cannot resolve (another member's labels on a shared task)
	// are kept.
	var labels []string
	var extraOps []opsync.Op
	if current != nil {
		var cur []string
		_ = json.Unmarshal(current["labels"], &cur)
		for _, l := range cur {
			if _, mine := v.labels[l]; !mine {
				labels = append(labels, l)
			}
		}
	}
	seen := map[string]bool{}
	for _, c := range in.Categories {
		key := strings.ToLower(c)
		if seen[key] {
			continue
		}
		seen[key] = true
		lid, ok := v.byName[key]
		if !ok {
			lid = ids.New()
			v.byName[key], v.labels[lid] = lid, c
			for field, val := range map[string]json.RawMessage{
				"name": mustJSON(c), "color": mustJSON("#64748b"), "position": mustJSON(ts),
				"created_at": mustJSON(ts), "deleted_at": json.RawMessage("null"),
			} {
				extraOps = append(extraOps, d.op("label", lid, field, val, ts))
			}
		}
		labels = append(labels, lid)
	}
	if labels == nil {
		labels = []string{}
	}
	f["labels"] = mustJSON(labels)
	return f, extraOps
}

func sameLabels(a, b json.RawMessage) bool {
	var x, y []string
	_ = json.Unmarshal(a, &x)
	_ = json.Unmarshal(b, &y)
	if len(x) != len(y) {
		return false
	}
	sort.Strings(x)
	sort.Strings(y)
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

// create stores a new task from a client's VTODO. The task id is the UID when
// that is usable; otherwise (or when the id is taken, e.g. by a purged or
// foreign task) a fresh id is used and the UID and resource name are kept in
// caldav_resources.
func (d *davRequest) create(v *davView, in *caldav.Inbound) (string, error) {
	id := in.UID
	if !usableID.MatchString(id) {
		id = ids.New()
	} else if t, err := d.s.sync.Get(d.ctx(), d.user.ID, "task", id); err != nil {
		return "", err
	} else if t != nil {
		id = ids.New()
	}
	for attempt := 0; ; attempt++ {
		res, err := d.applyCreate(v, in, id, d.path.calendar)
		var rej *opsync.RejectedError
		if attempt == 0 && ((err == nil && res.Applied == 0) || (errors.As(err, &rej) && rej.Op.EntityID == id)) {
			id = ids.New() // purged or foreign id: retry once under a fresh id
			continue
		}
		if err != nil {
			return "", err
		}
		return id, d.recordName(id, d.path.name, in.UID)
	}
}

func (d *davRequest) applyCreate(v *davView, in *caldav.Inbound, id, cal string) (opsync.ApplyResult, error) {
	ts := d.s.opTS()
	f, extra := d.fields(v, in, nil, ts)
	now := time.Now().UnixMilli()
	f["project_id"] = projectValue(cal)
	f["position"] = mustJSON(now)
	f["created_at"] = mustJSON(now)
	if in.CreatedAt != nil && *in.CreatedAt > 0 {
		f["created_at"] = mustJSON(*in.CreatedAt)
	}
	f["deleted_at"] = json.RawMessage("null")
	f["completed_at"] = json.RawMessage("null")
	if in.Completed {
		c := now
		if in.CompletedAt != nil {
			c = *in.CompletedAt
		}
		f["completed_at"] = mustJSON(c)
	}
	f["recurrence"] = json.RawMessage("null")
	if in.Rule != "" {
		f["recurrence"] = mustJSON(in.Rule)
	}
	ops := extra
	for field, val := range f {
		ops = append(ops, d.op("task", id, field, val, ts))
	}
	return d.apply(ops)
}

// recordName remembers a client-chosen resource name or UID that differs from
// the defaults (<id>.ics, UID = id).
func (d *davRequest) recordName(id, name, uid string) error {
	if name == id+".ics" && uid == id {
		_, err := d.s.sync.DB().ExecContext(d.ctx(), `DELETE FROM caldav_resources WHERE task_id = ?`, id)
		return err
	}
	_, err := d.s.sync.DB().ExecContext(d.ctx(), `INSERT INTO caldav_resources(task_id,name,uid) VALUES(?,?,?)
		ON CONFLICT(task_id) DO UPDATE SET name = excluded.name, uid = excluded.uid`, id, name, uid)
	return err
}

// update applies the differences between a client's VTODO and the stored task,
// one op per changed field. A move into a calendar that is shared differently
// becomes a copy plus a tombstone, as in the app.
func (d *davRequest) update(v *davView, cur opsync.Entity, in *caldav.Inbound) (string, error) {
	id := idOf(cur["id"])
	ts := d.s.opTS()
	f, extraOps := d.fields(v, in, cur, ts)
	body := map[string]json.RawMessage{}
	for field, val := range f {
		same := opsync.SameJSON(val, cur[field])
		if field == "labels" {
			same = sameLabels(val, cur["labels"])
		}
		if field == "ical_extra" && isNullish(cur[field]) && isNullish(val) {
			same = true
		}
		if !same {
			body[field] = val
		}
	}
	// Recurrence: an RRULE equal to the current rule's keeps the rule (and its
	// "after completion" flavour, which RRULE cannot express).
	curRule := idOf(cur["recurrence"])
	keep := false
	if curRule != "" && in.RRULE != "" {
		if r, err := recurrence.Parse(curRule); err == nil && recurrence.SameRRULE(r.RRULE(), in.RRULE) {
			keep = true
		}
	}
	if !keep && in.Rule != curRule {
		if in.Rule == "" {
			if curRule != "" {
				body["recurrence"] = json.RawMessage("null")
			}
		} else {
			body["recurrence"] = mustJSON(in.Rule)
		}
	}
	// Completion: only a change of state writes; reopening clears completed_at.
	wasDone := !isNullish(cur["completed_at"])
	switch {
	case in.Completed && !wasDone:
		c := time.Now().UnixMilli()
		if in.CompletedAt != nil {
			c = *in.CompletedAt
		}
		body["completed_at"] = mustJSON(c)
	case !in.Completed && wasDone:
		body["completed_at"] = json.RawMessage("null")
	}
	moving := v.calendarOf(cur) != d.path.calendar
	if moving {
		body["project_id"] = projectValue(d.path.calendar)
		if !isNullish(cur["section_id"]) {
			body["section_id"] = json.RawMessage("null")
		}
	}
	var extra []opsync.Op
	extra = append(extra, extraOps...)
	// Completing a recurring task records the occurrence and moves the series,
	// exactly like a REST completion.
	recordID, record, ok, err := d.s.recurringCompletion(d.ctx(), d.user.ID, id, body, cur, localToday(time.Now()))
	if err != nil {
		return "", err
	}
	if ok {
		for field, val := range record {
			extra = append(extra, d.op("task", recordID, field, val, ts))
		}
	}
	rops, err := d.s.reminderOpsForTaskAs(d.ctx(), d.user.ID, id, body, ts, d.device)
	if err != nil {
		return "", err
	}
	extra = append(extra, rops...)
	ops := extra
	for field, val := range body {
		ops = append(ops, d.op("task", id, field, val, ts))
	}
	if len(ops) == 0 {
		return id, d.recordMoveName(id, moving, in.UID)
	}
	_, err = d.apply(ops)
	var rej *opsync.RejectedError
	if moving && errors.As(err, &rej) && rej.Reason == opsync.ReasonScopeChange {
		return d.copyMove(v, cur, in)
	}
	if err != nil {
		return "", err
	}
	return id, d.recordMoveName(id, moving, in.UID)
}

func (d *davRequest) recordMoveName(id string, moving bool, uid string) error {
	if !moving && d.view != nil && d.view.resourceName(id) == d.path.name && d.view.uidOf(id) == uid {
		return nil
	}
	return d.recordName(id, d.path.name, uid)
}

// copyMove moves a task into a calendar with another sharing scope: a copy is
// created there under a new id (keeping the client's UID and resource name) and
// the original is tombstoned.
func (d *davRequest) copyMove(v *davView, cur opsync.Entity, in *caldav.Inbound) (string, error) {
	id := ids.New()
	ts := d.s.opTS()
	f, extraOps := d.fields(v, in, nil, ts)
	f["project_id"] = projectValue(d.path.calendar)
	f["position"] = cur["position"]
	f["created_at"] = cur["created_at"]
	f["deleted_at"] = json.RawMessage("null")
	f["completed_at"] = json.RawMessage("null")
	if in.Completed {
		c := time.Now().UnixMilli()
		if in.CompletedAt != nil {
			c = *in.CompletedAt
		}
		f["completed_at"] = mustJSON(c)
	}
	f["recurrence"] = cur["recurrence"]
	if in.RRULE == "" {
		f["recurrence"] = json.RawMessage("null")
	} else if in.Rule != "" && !opsync.SameJSON(mustJSON(in.Rule), cur["recurrence"]) {
		f["recurrence"] = mustJSON(in.Rule)
	}
	if isNullish(f["recurrence"]) {
		f["recurrence"] = json.RawMessage("null")
	}
	if est, ok := cur["estimate_minutes"]; ok {
		f["estimate_minutes"] = est
	}
	ops := extraOps
	for field, val := range f {
		ops = append(ops, d.op("task", id, field, val, ts))
	}
	ops = append(ops, d.op("task", idOf(cur["id"]), "deleted_at", mustJSON(time.Now().UnixMilli()), ts))
	if _, err := d.apply(ops); err != nil {
		return "", err
	}
	return id, d.recordName(id, d.path.name, in.UID)
}

// ---- DELETE ----

func (d *davRequest) delete() {
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	switch d.path.kind {
	case kindResource:
		t := d.resource(v)
		if t == nil {
			http.NotFound(d.w, d.r)
			return
		}
		_, etag := v.encode(t)
		if !d.checkPreconditions(etag) {
			return
		}
		if v.role(d.path.calendar) == opsync.RoleViewer {
			d.precondition(http.StatusForbidden, "d", "need-privileges")
			return
		}
		ts := d.s.opTS()
		if _, err := d.apply([]opsync.Op{d.op("task", idOf(t["id"]), "deleted_at", mustJSON(time.Now().UnixMilli()), ts)}); err != nil {
			d.applyError(err)
			return
		}
		d.w.WriteHeader(http.StatusNoContent)
	case kindCalendar:
		d.deleteCalendar(v)
	default:
		http.Error(d.w, "this collection cannot be deleted", http.StatusForbidden)
	}
}

// deleteCalendar soft-deletes a project and moves its open tasks to the Inbox:
// in place for a personal project, as copies (plus tombstones of every task) for
// a shared one, whose tasks cannot change sharing scope. Sub-projects move up to
// the deleted project's parent, as in the app. The Inbox is protected.
func (d *davRequest) deleteCalendar(v *davView) {
	cal := d.path.calendar
	if cal == inboxCalendar {
		d.precondition(http.StatusForbidden, "d", "need-privileges")
		return
	}
	if !v.calendarVisible(cal) {
		http.NotFound(d.w, d.r)
		return
	}
	if v.role(cal) != opsync.RoleOwner {
		d.precondition(http.StatusForbidden, "d", "need-privileges")
		return
	}
	ts := d.s.opTS()
	now := time.Now().UnixMilli()
	_, shared := v.roles[cal]
	var ops []opsync.Op
	tasks := []opsync.Entity{}
	for _, t := range v.tasks {
		if idOf(t["project_id"]) == cal {
			tasks = append(tasks, t)
		}
	}
	if shared {
		newIDs := map[string]string{}
		for _, t := range tasks {
			if isNullish(t["completed_at"]) {
				newIDs[idOf(t["id"])] = ids.New()
			}
		}
		for _, t := range tasks {
			old := idOf(t["id"])
			if nid, open := newIDs[old]; open {
				for field, val := range t {
					switch field {
					case "id":
						continue
					case "project_id", "section_id":
						val = json.RawMessage("null")
					case "parent_id":
						if np, ok := newIDs[idOf(val)]; ok {
							val = mustJSON(np)
						} else {
							val = json.RawMessage("null")
						}
					case "assignee_id":
						if idOf(val) != d.user.ID {
							val = json.RawMessage("null")
						}
					}
					ops = append(ops, d.op("task", nid, field, val, ts))
				}
			}
			ops = append(ops, d.op("task", old, "deleted_at", mustJSON(now), ts))
		}
	} else {
		for _, t := range tasks {
			if isNullish(t["completed_at"]) {
				id := idOf(t["id"])
				ops = append(ops, d.op("task", id, "project_id", json.RawMessage("null"), ts))
				if !isNullish(t["section_id"]) {
					ops = append(ops, d.op("task", id, "section_id", json.RawMessage("null"), ts))
				}
			}
		}
	}
	parent := v.projects[cal]["parent_id"]
	if isNullish(parent) {
		parent = json.RawMessage("null")
	}
	for pid, p := range v.projects {
		if pid != cal && idOf(p["parent_id"]) == cal {
			ops = append(ops, d.op("project", pid, "parent_id", parent, ts))
		}
	}
	ops = append(ops, d.op("project", cal, "deleted_at", mustJSON(now), ts))
	if _, err := d.apply(ops); err != nil {
		d.applyError(err)
		return
	}
	d.w.WriteHeader(http.StatusNoContent)
}

// ---- MKCALENDAR and PROPPATCH ----

// normalizeColor turns #RRGGBB or #RRGGBBAA into lower-case #rrggbb ("" when
// the value is not a colour).
func normalizeColor(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "#") || (len(s) != 7 && len(s) != 9) {
		return ""
	}
	for _, c := range s[1:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return ""
		}
	}
	return strings.ToLower(s[:7])
}

// calendarSettable are the calendar properties a client may set. Those mapped
// to nil are accepted and not stored (client display preferences).
var calendarSettable = map[caldav.PropName]string{
	pDisplayName:                             "name",
	pColor:                                   "color",
	pOrder:                                   "",
	pCalendarDesc:                            "",
	pn(caldav.NSCalDAV, "calendar-timezone"): "",
}

func (d *davRequest) mkcalendar() {
	if d.path.kind != kindCalendar {
		http.Error(d.w, "calendars can only be created in the calendar home", http.StatusForbidden)
		return
	}
	body, err := caldav.ParseXML(d.r.Body)
	if err != nil {
		http.Error(d.w, err.Error(), http.StatusBadRequest)
		return
	}
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	id := d.path.calendar
	if id == inboxCalendar || v.calendarVisible(id) {
		http.Error(d.w, "a calendar already exists here", http.StatusMethodNotAllowed)
		return
	}
	if !usableID.MatchString(id) {
		http.Error(d.w, "choose a calendar name of letters, digits, dots and dashes", http.StatusForbidden)
		return
	}
	if p, err := d.s.sync.Get(d.ctx(), d.user.ID, "project", id); err != nil {
		d.fail(err)
		return
	} else if p != nil {
		http.Error(d.w, "a deleted or archived project uses this name", http.StatusMethodNotAllowed)
		return
	}
	name, color := "New list", "#64748b"
	if set := body.Child(caldav.NSDAV, "set"); body != nil && set != nil {
		if props := set.Child(caldav.NSDAV, "prop"); props != nil {
			for _, p := range props.Children {
				switch {
				case p.Is(caldav.NSDAV, "displayname"):
					if n := strings.TrimSpace(p.Text); n != "" {
						name = n
					}
				case p.Is(caldav.NSApple, "calendar-color"):
					if c := normalizeColor(p.Text); c != "" {
						color = c
					}
				case p.Is(caldav.NSCalDAV, "supported-calendar-component-set"):
					todo := false
					for _, c := range p.Children {
						if c.Is(caldav.NSCalDAV, "comp") && strings.EqualFold(c.Attr("name"), "VTODO") {
							todo = true
						}
					}
					if !todo {
						d.precondition(http.StatusForbidden, "c", "supported-calendar-component")
						return
					}
				}
			}
		}
	}
	ts := d.s.opTS()
	now := time.Now().UnixMilli()
	var ops []opsync.Op
	for field, val := range map[string]json.RawMessage{
		"name": mustJSON(name), "color": mustJSON(color), "position": mustJSON(now), "archived": json.RawMessage("false"),
		"parent_id": json.RawMessage("null"), "created_at": mustJSON(now), "deleted_at": json.RawMessage("null"),
	} {
		ops = append(ops, d.op("project", id, field, val, ts))
	}
	res, err := d.apply(ops)
	if err != nil {
		d.applyError(err)
		return
	}
	if res.Applied == 0 {
		http.Error(d.w, "this name was used by a purged project", http.StatusMethodNotAllowed)
		return
	}
	d.w.Header().Set("Cache-Control", "no-store")
	d.w.WriteHeader(http.StatusCreated)
}

func (d *davRequest) proppatch() {
	body, err := caldav.ParseXML(d.r.Body)
	if err != nil || body == nil || !body.Is(caldav.NSDAV, "propertyupdate") {
		http.Error(d.w, "expected a DAV:propertyupdate body", http.StatusBadRequest)
		return
	}
	v, err := d.load()
	if err != nil {
		d.fail(err)
		return
	}
	if d.path.kind != kindCalendar || !v.calendarVisible(d.path.calendar) {
		if d.path.kind == kindCalendar {
			http.NotFound(d.w, d.r)
			return
		}
		d.proppatchRefuse(body, d.r.URL.Path)
		return
	}
	cal := d.path.calendar
	changes := map[string]json.RawMessage{}
	groups := map[int][]caldav.PropName{}
	var accepted []caldav.PropName
	refused := false
	for _, instr := range body.Children {
		set := instr.Is(caldav.NSDAV, "set")
		if !set && !instr.Is(caldav.NSDAV, "remove") {
			continue
		}
		props := instr.Child(caldav.NSDAV, "prop")
		if props == nil {
			continue
		}
		for _, p := range props.Children {
			name := caldav.PropName{Space: p.Space, Local: p.Local}
			field, ok := calendarSettable[name]
			if !ok || (field != "" && (cal == inboxCalendar || !set)) {
				groups[http.StatusForbidden] = append(groups[http.StatusForbidden], name)
				refused = true
				continue
			}
			switch field {
			case "name":
				n := strings.TrimSpace(p.Text)
				if n == "" {
					groups[http.StatusForbidden] = append(groups[http.StatusForbidden], name)
					refused = true
					continue
				}
				changes["name"] = mustJSON(n)
			case "color":
				c := normalizeColor(p.Text)
				if c == "" {
					groups[http.StatusForbidden] = append(groups[http.StatusForbidden], name)
					refused = true
					continue
				}
				changes["color"] = mustJSON(c)
			}
			accepted = append(accepted, name)
		}
	}
	href := calendarHref(d.user.ID, cal)
	m := caldav.NewMultistatus()
	if refused {
		groups[http.StatusFailedDependency] = accepted
		m.PropStatus(href, groups)
		d.multistatus(m)
		return
	}
	if len(changes) > 0 {
		ts := d.s.opTS()
		var ops []opsync.Op
		for field, val := range changes {
			if !opsync.SameJSON(val, v.projects[cal][field]) {
				ops = append(ops, d.op("project", cal, field, val, ts))
			}
		}
		if len(ops) > 0 {
			if _, err := d.apply(ops); err != nil {
				var rej *opsync.RejectedError
				if errors.As(err, &rej) {
					m.PropStatus(href, map[int][]caldav.PropName{http.StatusForbidden: accepted})
					d.multistatus(m)
					return
				}
				d.fail(err)
				return
			}
		}
	}
	m.PropStatus(href, map[int][]caldav.PropName{http.StatusOK: accepted})
	d.multistatus(m)
}

// proppatchRefuse answers a PROPPATCH on a resource that has no writable
// properties: every property is 403.
func (d *davRequest) proppatchRefuse(body *caldav.Node, href string) {
	var names []caldav.PropName
	for _, instr := range body.Children {
		if props := instr.Child(caldav.NSDAV, "prop"); props != nil {
			for _, p := range props.Children {
				names = append(names, caldav.PropName{Space: p.Space, Local: p.Local})
			}
		}
	}
	m := caldav.NewMultistatus()
	m.PropStatus(href, map[int][]caldav.PropName{http.StatusForbidden: names})
	d.multistatus(m)
}
