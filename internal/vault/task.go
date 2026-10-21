package vault

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/zoned"
)

// taskFields are the projections the merge compares, each a string so that
// "changed" is plain inequality (design D6).
var taskFields = []string{"title", "done", "donedate", "due", "start", "deadline", "estimate", "evening", "priority", "recur", "labels", "blocked", "note", "parent", "section", "project"}

var clockRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

func validDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func boolStr(b bool) string { return strconv.FormatBool(b) }

func dueKey(d *Due) string {
	if d == nil {
		return ""
	}
	k := d.Date + "|"
	if d.Time != nil {
		k += *d.Time
	}
	k += "|"
	if d.TZ != nil {
		k += *d.TZ
	}
	return k
}

func prio(p int) string {
	if p < 1 || p > 4 {
		p = 4
	}
	return strconv.Itoa(p)
}

// proj projects a task row of a view onto the compared fields.
func (e *engine) proj(v *view, id string) map[string]string {
	r := v.s.Get("task", id)
	p := map[string]string{
		"title": v.text("task", id, "title"), "done": boolStr(r.Set("completed_at")), "donedate": "",
		"due": dueKey(r.DueOf()), "start": r.Str("start"), "deadline": r.Str("deadline"), "estimate": "",
		"evening": boolStr(r.Bool("evening")), "priority": prio(int(r.Num("priority"))), "recur": r.Str("recurrence"),
		"note":   strings.TrimRight(v.text("task", id, "description"), "\n"),
		"parent": r.Str("parent_id"), "section": r.Str("section_id"), "project": r.Str("project_id"),
	}
	if r.Set("completed_at") {
		p["donedate"] = v.localDate(r.Num("completed_at"))
	}
	if m := int(r.Num("estimate_minutes")); m > 0 {
		p["estimate"] = strconv.Itoa(m)
	}
	var labels []string
	for _, l := range r.Strs("labels") {
		if v.s.Get("label", l).Live() {
			labels = append(labels, l)
		}
	}
	sort.Strings(labels)
	p["labels"] = strings.Join(labels, ",")
	blocked := append([]string(nil), r.Strs("blocked_by")...)
	sort.Strings(blocked)
	p["blocked"] = strings.Join(blocked, ",")
	return p
}

// scopeOf is a task's sharing scope: its project when shared, else private.
func (e *engine) scopeOf(project string) string {
	for _, s := range e.st.Shared {
		if s == project {
			return project
		}
	}
	return ""
}

// fileProj projects a task line onto the compared fields. A value that does
// not parse is reported and left out, so the task keeps its value. baseP is
// the base projection (nil for a new line).
func (e *engine) fileProj(m *mergeRun, pl place, baseP map[string]string) map[string]string {
	l := pl.node.Line
	id := l.ID
	bad := func(format string, args ...any) {
		e.rep.warn("%s: %q: %s", pl.path, l.Title, fmt.Sprintf(format, args...))
	}
	p := map[string]string{
		"title": l.Title, "done": boolStr(l.Done), "evening": boolStr(l.Evening), "priority": prio(l.Priority),
		"note": strings.TrimRight(pl.node.NoteText(), "\n"), "parent": pl.parent, "section": pl.section, "project": pl.project,
	}
	if l.Done && l.DoneDate != "" {
		if validDate(l.DoneDate) {
			p["donedate"] = l.DoneDate
		} else {
			bad("✅ %s is not a date", l.DoneDate)
		}
	}
	switch {
	case l.Due == "" && (l.Time != "" || l.TZ != ""):
		bad("a time needs a 📅 date")
	case l.Due != "" && !validDate(l.Due):
		bad("📅 %s is not a date", l.Due)
	case l.Time != "" && !clockRe.MatchString(l.Time):
		bad("time %s is not between 00:00 and 23:59", l.Time)
	case l.TZ != "" && (l.Time == "" || !zoned.Valid(l.TZ)):
		bad("tz %s is not a time zone with a time", l.TZ)
	default:
		p["due"] = ""
		if l.Due != "" {
			p["due"] = l.Due + "|" + l.Time + "|" + l.TZ
		}
	}
	for _, f := range []struct{ key, val, mark string }{{"start", l.Start, "🛫"}, {"deadline", l.Deadline, "deadline"}} {
		if f.val == "" || validDate(f.val) || f.key == "start" && f.val == "someday" {
			p[f.key] = f.val
		} else {
			bad("%s %s is not a date", f.mark, f.val)
		}
	}
	if l.Estimate == "" {
		p["estimate"] = ""
	} else if mins, ok := parseMinutes(l.Estimate); ok {
		p["estimate"] = strconv.Itoa(mins)
	} else {
		bad("estimate %s is not a duration from 1 minute to 7 days", l.Estimate)
	}
	if l.Recur == "" {
		p["recur"] = ""
	} else if rule, err := ruleFromFile(l.Recur); err == nil {
		p["recur"] = rule
	} else {
		bad("🔁 %s: %v", l.Recur, err)
	}
	p["labels"] = e.fileLabels(m, l.Tags)
	if b, ok := e.fileBlocked(m, pl, bad); ok {
		p["blocked"] = b
	}
	if m.av.undecryptable["task:"+id+":title"] {
		delete(p, "title")
	}
	if m.av.undecryptable["task:"+id+":description"] {
		delete(p, "note")
	}
	if baseP != nil {
		// A line at the top whose parent is not in this file stays a subtask;
		// a line nested in another task's line under a heading keeps its section.
		if bp := baseP["parent"]; pl.parent == "" && bp != "" && m.placed[bp].path != pl.path {
			p["parent"] = bp
		}
		if pl.parent != "" {
			delete(p, "section")
		} else if bs := baseP["section"]; bs != "" && !m.av.s.Get("section", bs).Live() && pl.section == "" {
			p["section"] = bs
		}
	}
	return p
}

// fileLabels resolves a line's tags to label ids: the base's names first (a
// label renamed in the app still matches the file's old tag), then the app's,
// else a label this sync creates ("new:<slug>").
func (e *engine) fileLabels(m *mergeRun, tags []string) string {
	baseSlugs := m.bv.labelSlugs()
	var out []string
	seen := map[string]bool{}
	for _, t := range tags {
		sl := strings.ToLower(t)
		id, ok := baseSlugs[sl]
		if ok && !e.app.Get("label", id).Live() {
			ok = false
		}
		if !ok {
			id, ok = m.labels[sl]
		}
		if !ok {
			id = "new:" + sl
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return strings.Join(out, ",")
}

// fileBlocked checks a line's ⛔ ids: known tasks in the task's own sharing
// scope (spec "Blocker in another sharing").
func (e *engine) fileBlocked(m *mergeRun, pl place, bad func(string, ...any)) (string, bool) {
	l := pl.node.Line
	scope := e.scopeOf(pl.project)
	out := append([]string(nil), l.Blocked...)
	for _, b := range out {
		proj, ok := "", false
		if bp, placed := m.placed[b]; placed {
			proj, ok = bp.project, true
		} else if r := e.app.Get("task", b); r != nil {
			proj, ok = r.Str("project_id"), true
		}
		switch {
		case !ok || b == l.ID:
			bad("⛔ %s is not a task of the account", b)
			return "", false
		case e.scopeOf(proj) != scope:
			bad("⛔ %s is a task of another sharing; blockers stay within one", short(b))
			return "", false
		}
	}
	sort.Strings(out)
	return strings.Join(out, ","), true
}

// mergeTask merges one task line (D7, second column onward).
func (e *engine) mergeTask(m *mergeRun, pl place) error {
	id := pl.node.Line.ID
	if pl.node.Line.Trailing != "" {
		e.st.Extra[id] = pl.node.Line.Trailing
	} else {
		delete(e.st.Extra, id)
	}
	if e.fresh["task:"+id] {
		e.createTask(m, pl)
		return nil
	}
	a, b := e.app.Get("task", id), e.base.Get("task", id)
	appP := e.proj(m.av, id)
	baseP := appP
	if b != nil {
		baseP = e.proj(m.bv, id)
	}
	fileP := e.fileProj(m, pl, baseP)
	if !a.Live() {
		for f, v := range fileP {
			if b.Live() && v != baseP[f] {
				e.conflict(pl.path, pl.node.Raw, "trashed in the app")
				break
			}
		}
		return nil
	}
	e.readOnlyEdits(m, pl)
	var changed, both []string
	for _, f := range taskFields {
		fv, ok := fileP[f]
		if !ok || fv == baseP[f] || fv == appP[f] {
			continue
		}
		if appP[f] != baseP[f] {
			both = append(both, f)
			continue
		}
		changed = append(changed, f)
	}
	if len(both) > 0 {
		e.conflict(pl.path, pl.node.Raw, strings.Join(both, ", "))
	}
	if len(changed) == 0 {
		return nil
	}
	body := e.body("task", id)
	for _, f := range changed {
		e.setField(m, body, f, pl, fileP)
	}
	title := m.av.text("task", id, "title")
	switch {
	case e.recurring(m, id, body):
		e.rep.event("completed", pl.path, id, "completed %q; the next one is on the line", title)
	case fileP["done"] == "true" && appP["done"] == "false":
		e.rep.event("completed", pl.path, id, "completed %q", title)
	case fileP["done"] == "false" && appP["done"] == "true":
		e.rep.event("reopened", pl.path, id, "reopened %q", title)
	default:
		e.rep.event("updated", pl.path, id, "updated %q (%s)", title, strings.Join(changed, ", "))
	}
	e.rep.Updated++
	return nil
}

// readOnlyEdits reports edits to the fields the file never pushes.
func (e *engine) readOnlyEdits(m *mergeRun, pl place) {
	app := m.av.readOnly(pl.node.Line.ID)
	keys := map[string]bool{}
	for k := range app {
		keys[k] = true
	}
	for k := range pl.node.Line.ReadOnly {
		keys[k] = true
	}
	for _, k := range sortedKeys(keys) {
		if app[k] != pl.node.Line.ReadOnly[k] {
			e.rep.warn("%s: %q: [%s:: ] is read-only in the vault; the app's value is written back", pl.path, pl.node.Line.Title, k)
		}
	}
}

// doneAt is the completion time of a ticked line: 12:00 local on its ✅ date,
// else now.
func (e *engine) doneAt(l Line) int64 {
	if t, err := time.ParseInLocation("2006-01-02", l.DoneDate, e.o.Loc); err == nil {
		return t.Add(12 * time.Hour).UnixMilli()
	}
	return e.nowMS()
}

// setField sets the op value of one changed projection.
func (e *engine) setField(m *mergeRun, b map[string]any, f string, pl place, fileP map[string]string) {
	l := pl.node.Line
	switch f {
	case "title":
		b["title"] = l.Title
	case "done":
		if l.Done {
			b["completed_at"], b["completed_by"] = e.doneAt(l), nullable(e.o.UserID)
		} else {
			b["completed_at"], b["completed_by"] = nil, nil
		}
	case "donedate":
		if l.Done {
			b["completed_at"] = e.doneAt(l)
		}
	case "due":
		if l.Due == "" {
			b["due"] = nil
			break
		}
		d := Due{Date: l.Due}
		if l.Time != "" {
			t := l.Time
			d.Time = &t
			if l.TZ != "" {
				tz := l.TZ
				d.TZ = &tz
			}
		}
		b["due"] = d
	case "start", "deadline":
		b[f] = nullable(fileP[f])
	case "estimate":
		if n, err := strconv.Atoi(fileP[f]); err == nil {
			b["estimate_minutes"] = n
		} else {
			b["estimate_minutes"] = nil
		}
	case "evening":
		b["evening"] = l.Evening
	case "priority":
		n, _ := strconv.Atoi(fileP[f])
		b["priority"] = n
	case "recur":
		b["recurrence"] = nullable(fileP[f])
	case "labels":
		out := []string{}
		for _, id := range strings.Split(fileP[f], ",") {
			if strings.HasPrefix(id, "new:") {
				id = e.labelFor(m, strings.TrimPrefix(id, "new:"))
			}
			if id != "" {
				out = append(out, id)
			}
		}
		b["labels"] = out
	case "blocked":
		out := []string{}
		if fileP[f] != "" {
			out = strings.Split(fileP[f], ",")
		}
		b["blocked_by"] = out
	case "note":
		b["description"] = fileP[f]
	case "parent":
		b["parent_id"] = nullable(fileP[f])
		m.moved[l.ID] = true
	case "section":
		b["section_id"] = nullable(fileP[f])
		m.moved[l.ID] = true
	case "project":
		b["project_id"] = nullable(fileP[f])
		m.moved[l.ID] = true
	}
}

// labelFor creates the label of a tag no label matches.
func (e *engine) labelFor(m *mergeRun, sl string) string {
	if id, ok := m.newLabels[sl]; ok {
		return id
	}
	id := e.newID("label", sl)
	pos := 0.0
	for _, l := range e.app.IDs("label") {
		if p := e.app.Get("label", l).Num("position"); p >= pos {
			pos = p + 1000
		}
	}
	pos += 1000 * float64(len(m.newLabels))
	b := e.body("label", id)
	b["name"], b["color"], b["position"], b["created_at"], b["deleted_at"] = sl, "#64748b", pos, e.nowMS(), nil
	e.fresh["label:"+id] = true
	m.newLabels[sl] = id
	e.rep.event("label", "", "", "created label %q", sl)
	return id
}

// createTask creates the task of a new line.
func (e *engine) createTask(m *mergeRun, pl place) {
	id := pl.node.Line.ID
	l := pl.node.Line
	fileP := e.fileProj(m, pl, nil)
	b := e.body("task", id)
	created := e.nowMS()
	if t, err := time.ParseInLocation("2006-01-02", l.Created, e.o.Loc); err == nil {
		created = t.Add(12 * time.Hour).UnixMilli()
	}
	b["title"], b["description"], b["project_id"], b["parent_id"], b["section_id"] = "", "", nil, nil, nil
	b["priority"], b["due"], b["labels"], b["created_at"], b["completed_at"], b["deleted_at"] = 4, nil, []string{}, created, nil, nil
	b["estimate_minutes"], b["deadline"], b["start"], b["evening"], b["blocked_by"], b["recurrence"] = nil, nil, nil, false, []string{}, nil
	for _, f := range taskFields {
		if _, ok := fileP[f]; ok && f != "donedate" {
			e.setField(m, b, f, pl, fileP)
		}
	}
	e.rep.Created++
	e.rep.event("created", pl.path, id, "created %q in %s", l.Title, pl.path)
}

// recurring completes a recurring series the way the app does (a port of
// internal/sync.RecurringCompletion): the occurrence becomes a completed record
// and the series moves to its next date. It reports whether it did.
func (e *engine) recurring(m *mergeRun, id string, b map[string]any) bool {
	at, completing := b["completed_at"]
	a := e.app.Get("task", id)
	if !completing || at == nil || a.Set("completed_at") {
		return false
	}
	ruleText := a.Str("recurrence")
	if r, ok := b["recurrence"]; ok {
		ruleText, _ = r.(string)
	}
	rule, err := recurrence.Parse(ruleText)
	if ruleText == "" || err != nil {
		return false
	}
	merged := map[string]json.RawMessage{}
	for k, f := range a {
		merged[k] = f.V
	}
	for k, v := range b {
		merged[k] = jsonOf(v)
	}
	var cur *Due
	if raw := merged["due"]; !nullish(raw) {
		var d Due
		if json.Unmarshal(raw, &d) == nil && d.Date != "" {
			cur = &d
		}
	}
	today := e.o.Now().In(e.o.Loc).Format("2006-01-02")
	date, dueDate := today, ""
	if cur != nil {
		date, dueDate = cur.Date, cur.Date
	}
	done := 0
	for _, t := range e.app.IDs("task") {
		r := e.app.Get("task", t)
		if r.Str("series_id") != id || !r.Set("completed_at") || r.Bool("skipped") {
			continue
		}
		if d := r.DueOf(); d != nil && d.Date != date && t == occurrenceID(id, d.Date) {
			done++
		}
	}
	next, more, err := rule.Following(dueDate, today, today, done)
	if err != nil || !more {
		return false
	}
	rid := occurrenceID(id, date)
	rec := e.body("task", rid)
	e.fresh["task:"+rid] = true
	rec["due"] = json.RawMessage(merged["due"])
	if cur == nil {
		rec["due"] = Due{Date: date}
	}
	rec["created_at"], rec["completed_at"], rec["deleted_at"], rec["recurrence"], rec["series_id"] = at, at, nil, nil, id
	// Content is copied as text and sealed for the record's own id.
	rec["title"] = m.av.text("task", id, "title")
	if s, ok := b["title"]; ok {
		rec["title"] = s
	}
	rec["description"] = m.av.text("task", id, "description")
	if s, ok := b["description"]; ok {
		rec["description"] = s
	}
	for _, f := range []string{"project_id", "parent_id", "priority", "labels", "position", "estimate_minutes"} {
		if v, ok := merged[f]; ok {
			rec[f] = v
		}
	}
	for f, v := range merged {
		if strings.HasPrefix(f, "fields.") {
			rec[f] = v
		}
	}
	str := func(f string) string {
		var s string
		_ = json.Unmarshal(merged[f], &s)
		return s
	}
	if s := str("section_id"); s != "" {
		rec["section_id"] = s
	}
	deadline, start := str("deadline"), str("start")
	if deadline != "" {
		rec["deadline"] = deadline
		b["deadline"] = recurrence.ShiftDate(deadline, date, next)
	}
	if start != "" {
		rec["start"] = start
		if start != "someday" {
			b["start"] = recurrence.ShiftDate(start, date, next)
		}
	}
	if string(merged["evening"]) == "true" {
		rec["evening"] = true
	}
	if by, ok := b["completed_by"]; ok {
		rec["completed_by"] = by
		delete(b, "completed_by")
	}
	delete(b, "completed_at")
	nd := Due{Date: next}
	if cur != nil {
		nd.Time, nd.TZ = cur.Time, cur.TZ
	}
	b["due"] = nd
	return true
}

// occurrenceID is internal/sync.OccurrenceID.
func occurrenceID(seriesID, date string) string {
	return ids.NameID("occurrence", seriesID+":"+date)
}
