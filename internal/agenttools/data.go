package agenttools

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/inbox"
	"github.com/pixari/opentodo/internal/origin"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/timetrack"
	"github.com/pixari/opentodo/internal/zoned"
)

// snapshot is everything one tool call needs, read once through the
// materialised reads (design D3: personal data volumes, filtered in memory).
// Tombstoned entities are never loaded.
type snapshot struct {
	projects map[string]opsync.Entity
	projList []opsync.Entity
	labels   map[string]string // id → name
	sections map[string]string // id → name
	tasks    []opsync.Entity
	people   map[string]string // account id → display name
	shared   map[string]opsync.ProjectAccess
	// sectionProject maps a section id onto its project id (write validation).
	sectionProject map[string]string
	labelList      []opsync.Entity
	// fieldDefs maps a project id onto its live custom field definitions in
	// position order (custom-fields).
	fieldDefs map[string][]opsync.Entity
	// tracked is every member's live tracked minutes per task, a running entry
	// to the server time (time-tracking D11).
	tracked map[string]int
}

func (r *Registry) load(ctx context.Context, userID string) (*snapshot, error) {
	snap := &snapshot{projects: map[string]opsync.Entity{}, labels: map[string]string{}, sections: map[string]string{}, people: map[string]string{}, sectionProject: map[string]string{}, fieldDefs: map[string][]opsync.Entity{}}
	var err error
	if snap.projList, err = r.list(ctx, userID, "project", false); err != nil {
		return nil, err
	}
	for _, p := range snap.projList {
		snap.projects[str(p, "id")] = p
	}
	labels, err := r.list(ctx, userID, "label", false)
	if err != nil {
		return nil, err
	}
	snap.labelList = labels
	for _, l := range labels {
		snap.labels[str(l, "id")] = str(l, "name")
	}
	sections, err := r.list(ctx, userID, "section", false)
	if err != nil {
		return nil, err
	}
	for _, sec := range sections {
		snap.sections[str(sec, "id")] = str(sec, "name")
		snap.sectionProject[str(sec, "id")] = rawStr(sec, "project_id")
	}
	defs, err := r.list(ctx, userID, "field", false)
	if err != nil {
		return nil, err
	}
	for _, d := range defs {
		pid := rawStr(d, "project_id")
		snap.fieldDefs[pid] = append(snap.fieldDefs[pid], d)
	}
	if snap.tasks, err = r.list(ctx, userID, "task", false); err != nil {
		return nil, err
	}
	entries, err := r.list(ctx, userID, "time_entry", false)
	if err != nil {
		return nil, err
	}
	list := make([]timetrack.Entry, 0, len(entries))
	for _, e := range entries {
		list = append(list, timetrack.FromRow(e))
	}
	snap.tracked = timetrack.TotalsByTask(list, r.now().UnixMilli())
	if snap.shared, err = r.sync.SharedProjects(ctx, userID); err != nil {
		return nil, err
	}
	if len(snap.shared) > 0 {
		ms, err := r.sync.Memberships(ctx, userID)
		if err != nil {
			return nil, err
		}
		for _, m := range ms {
			for _, mem := range m.Members {
				name := mem.Name
				if name == "" {
					name = mem.Email
				}
				snap.people[mem.UserID] = name
			}
		}
	}
	return snap, nil
}

// visible reports whether a task belongs in cross-project results: its project
// (if any) is loaded, i.e. not deleted, and not archived unless asked for.
func (snap *snapshot) visible(t opsync.Entity, includeArchived bool) bool {
	pid := str(t, "project_id")
	if pid == "" {
		return true
	}
	p, ok := snap.projects[pid]
	if !ok {
		return false
	}
	return includeArchived || !boolean(p, "archived")
}

func (snap *snapshot) projectName(pid string) string {
	if pid == "" {
		return "Inbox"
	}
	if p, ok := snap.projects[pid]; ok {
		return str(p, "name")
	}
	return ""
}

// ---- entity field helpers ----

// str reads a string field. An end-to-end encrypted value (OpenSpec `e2ee`)
// reads as e2ee.Placeholder: the server holds no key, and an assistant must
// never be handed "enc:v1:…" as if it were a title.
func str(e opsync.Entity, field string) string {
	return e2ee.Display(rawStr(e, field))
}

// rawStr reads a string field as stored (ciphertext included).
func rawStr(e opsync.Entity, field string) string {
	var v string
	if raw, ok := e[field]; ok {
		_ = json.Unmarshal(raw, &v)
	}
	return v
}

func strPtr(e opsync.Entity, field string) *string {
	v := str(e, field)
	if v == "" {
		return nil
	}
	return &v
}

func num(e opsync.Entity, field string) float64 {
	var v float64
	if raw, ok := e[field]; ok {
		_ = json.Unmarshal(raw, &v)
	}
	return v
}

func boolean(e opsync.Entity, field string) bool {
	var v bool
	if raw, ok := e[field]; ok {
		_ = json.Unmarshal(raw, &v)
	}
	return v
}

// plainOrEmpty is a string field for matching: "" when it is ciphertext.
func plainOrEmpty(e opsync.Entity, field string) string {
	if v := rawStr(e, field); !e2ee.IsCiphertext(v) {
		return v
	}
	return ""
}

func isOpen(t opsync.Entity) bool { return num(t, "completed_at") == 0 }

// inboxTask is the part of a task the Inbox rule reads (internal/inbox).
func inboxTask(t opsync.Entity) inbox.Task {
	return inbox.Task{
		ProjectID: rawStr(t, "project_id"),
		HasDue:    taskDue(t) != nil,
		Start:     rawStr(t, "start"),
		Completed: !isOpen(t),
		Deleted:   num(t, "deleted_at") != 0,
		ParentID:  rawStr(t, "parent_id"),
	}
}

// inboxRule returns the Inbox rule (internal/inbox, OpenSpec change inbox-means-unplaced)
// over this snapshot: open, live, not placed, and no placed parent. Build it once per
// pass; it indexes the snapshot's tasks.
func (snap *snapshot) inboxRule() func(opsync.Entity) bool {
	byID := make(map[string]opsync.Entity, len(snap.tasks))
	for _, t := range snap.tasks {
		byID[str(t, "id")] = t
	}
	parentOf := func(id string) (inbox.Task, bool) {
		p, ok := byID[id]
		if !ok {
			return inbox.Task{}, false
		}
		return inboxTask(p), true
	}
	return func(t opsync.Entity) bool { return inbox.IsTask(inboxTask(t), parentOf) }
}

func priority(t opsync.Entity) int {
	p := int(num(t, "priority"))
	if p < 1 || p > 4 {
		return 4
	}
	return p
}

func stringList(e opsync.Entity, field string) []string {
	var v []string
	if raw, ok := e[field]; ok {
		_ = json.Unmarshal(raw, &v)
	}
	return v
}

// isoTime renders a Unix millisecond timestamp for assistants (nil for 0).
func isoTime(ms float64) *string {
	if ms <= 0 {
		return nil
	}
	s := time.UnixMilli(int64(ms)).UTC().Format(time.RFC3339)
	return &s
}

// ---- due dates ----

type due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// dueOut is a task's due as stored plus, for a zoned due, its wall date and
// time in the requested time zone.
type dueOut struct {
	due
	LocalDate string `json:"local_date,omitempty"`
	LocalTime string `json:"local_time,omitempty"`
}

func taskDue(t opsync.Entity) *due {
	raw, ok := t["due"]
	if !ok || string(raw) == "null" {
		return nil
	}
	var d due
	if json.Unmarshal(raw, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

// localDue is the calendar date and clock ("" without time) of a due seen from
// loc: a floating due is the same everywhere, a zoned one is converted.
func localDue(d *due, loc *time.Location) (date, clock string) {
	if d.Time != nil {
		clock = *d.Time
	}
	if d.TZ == nil || d.Time == nil {
		return d.Date, clock
	}
	zl, err := zoned.Load(*d.TZ)
	if err != nil {
		return d.Date, clock
	}
	at, err := zoned.Instant(d.Date, *d.Time, zl)
	if err != nil {
		return d.Date, clock
	}
	return zoned.Local(at, loc)
}

// ---- output shapes ----

// Every user-written string (titles, descriptions, names, comment bodies)
// travels inside an `untrusted_text` object, and every result carries Notice
// (design D9.5): a cooperative model treats that text as data. The server's
// defences never depend on it.

// taskText is the user-written text of a task.
type taskText struct {
	Title       string   `json:"title"`
	Description *string  `json:"description,omitempty"`
	Project     string   `json:"project"`
	Section     string   `json:"section,omitempty"`
	Labels      []string `json:"labels"`
	Assignee    string   `json:"assignee,omitempty"`
	// Fields holds the string custom field values (text, link, date, choice)
	// keyed by definition id: people wrote them (custom-fields).
	Fields map[string]string `json:"fields,omitempty"`
	// Origin holds the free text of the task's origin, its page title and URL
	// (OpenSpec change task-origin, design D11); kind, provider and id are in
	// taskOut.Origin.
	Origin *originText `json:"origin,omitempty"`
}

// originText is the user-written part of a task's origin.
type originText struct {
	Title string `json:"title,omitempty"`
	URL   string `json:"url,omitempty"`
}

// originOut is the structural part of a task's origin.
type originOut struct {
	Kind     string `json:"kind"`
	Provider string `json:"provider,omitempty"`
	ID       string `json:"id,omitempty"`
}

type taskOut struct {
	ID              string   `json:"id"`
	Untrusted       taskText `json:"untrusted_text"`
	ProjectID       *string  `json:"project_id"`
	SectionID       *string  `json:"section_id,omitempty"`
	ParentID        *string  `json:"parent_id,omitempty"`
	Priority        int      `json:"priority"`
	Due             *dueOut  `json:"due"`
	Overdue         bool     `json:"overdue,omitempty"`
	LabelIDs        []string `json:"label_ids"`
	AssigneeID      *string  `json:"assignee_id,omitempty"`
	Recurrence      *string  `json:"recurrence,omitempty"`
	EstimateMinutes *int     `json:"estimate_minutes,omitempty"`
	Completed       bool     `json:"completed"`
	CompletedAt     *string  `json:"completed_at,omitempty"`
	// CompletedBy is the account id of whoever completed the task, when known
	// (OpenSpec change completed-date-filters).
	CompletedBy *string `json:"completed_by,omitempty"`
	CreatedAt   *string `json:"created_at,omitempty"`
	// Shared is true for tasks of a shared project: other members may have
	// written its text (design D9.6).
	Shared bool `json:"shared,omitempty"`
	// Encrypted is true when the title or description is end-to-end encrypted
	// (OpenSpec `e2ee`) and therefore shown as a placeholder.
	Encrypted bool `json:"encrypted,omitempty"`
	// Habit is true for a recurring task tracked as a habit (OpenSpec change
	// habits, design D7). Read-only: no write tool accepts it.
	Habit bool `json:"habit,omitempty"`
	// Fields holds the number, checkbox and empty (null) custom field values of
	// the task's project's definitions keyed by definition id; string values are
	// in untrusted_text.fields (custom-fields).
	Fields map[string]any `json:"fields"`
	// Origin is where the task came from, null when unset or encrypted
	// (OpenSpec change task-origin); its title and URL are in untrusted_text.
	Origin *originOut `json:"origin"`
	// TrackedMinutes is the task's live tracked time, every member's entries
	// and a running one to the server time (OpenSpec change time-tracking).
	TrackedMinutes int `json:"tracked_minutes"`
}

// render builds the assistant-facing view of a task, evaluating dates in loc
// against today (a YYYY-MM-DD in loc).
func (snap *snapshot) render(t opsync.Entity, loc *time.Location, today string, withDescription bool) taskOut {
	out := taskOut{
		ID: str(t, "id"), Untrusted: taskText{Title: str(t, "title"), Labels: []string{}},
		ProjectID: strPtr(t, "project_id"), ParentID: strPtr(t, "parent_id"),
		Priority: priority(t), LabelIDs: []string{},
		Recurrence: strPtr(t, "recurrence"), Habit: string(t["habit"]) == "true", Completed: !isOpen(t), TrackedMinutes: snap.tracked[str(t, "id")],
		CompletedAt: isoTime(num(t, "completed_at")), CreatedAt: isoTime(num(t, "created_at")),
	}
	if out.Completed {
		out.CompletedBy = strPtr(t, "completed_by")
	}
	out.Encrypted = e2ee.IsCiphertext(rawStr(t, "title")) || e2ee.IsCiphertext(rawStr(t, "description"))
	pid := str(t, "project_id")
	out.Untrusted.Project = snap.projectName(pid)
	_, out.Shared = snap.shared[pid]
	if withDescription {
		d := str(t, "description")
		out.Untrusted.Description = &d
	}
	if sid := str(t, "section_id"); sid != "" {
		if name, ok := snap.sections[sid]; ok {
			out.SectionID, out.Untrusted.Section = &sid, name
		}
	}
	for _, lid := range stringList(t, "labels") {
		if name, ok := snap.labels[lid]; ok {
			out.Untrusted.Labels = append(out.Untrusted.Labels, name)
			out.LabelIDs = append(out.LabelIDs, lid)
		}
	}
	if aid := str(t, "assignee_id"); aid != "" {
		out.AssigneeID = &aid
		out.Untrusted.Assignee = snap.people[aid]
	}
	if m := int(num(t, "estimate_minutes")); m > 0 {
		out.EstimateMinutes = &m
	}
	out.Fields, out.Untrusted.Fields = snap.fieldValues(t)
	if e2ee.IsCiphertextJSON(t["origin"]) {
		out.Encrypted = true
	} else if o, err := origin.Decode(t["origin"]); err == nil {
		out.Origin = &originOut{Kind: o.Kind, Provider: o.Provider, ID: o.ID}
		if o.Title != "" || o.URL != "" {
			out.Untrusted.Origin = &originText{Title: o.Title, URL: o.URL}
		}
	}
	if d := taskDue(t); d != nil {
		o := &dueOut{due: *d}
		date, clock := localDue(d, loc)
		if d.TZ != nil {
			o.LocalDate, o.LocalTime = date, clock
		}
		out.Due = o
		out.Overdue = isOpen(t) && date < today
	}
	return out
}

// ---- custom fields (OpenSpec custom-fields, design D6) ----

// fieldOut is a custom field definition as assistants see it: its name is
// user text, its options too.
type fieldOut struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Untrusted fieldText `json:"untrusted_text"`
}

type fieldText struct {
	Name    string   `json:"name"`
	Options []string `json:"options,omitempty"`
}

func (snap *snapshot) renderFields(pid string) []fieldOut {
	out := []fieldOut{}
	for _, d := range snap.fieldDefs[pid] {
		f := fieldOut{ID: str(d, "id"), Type: str(d, "type"), Untrusted: fieldText{Name: str(d, "name")}}
		if f.Type == "choice" {
			if opts := rawStr(d, "options"); e2ee.IsCiphertext(opts) {
				f.Untrusted.Options = []string{e2ee.Placeholder}
			} else {
				f.Untrusted.Options = opsync.FieldOptions(opts)
			}
		}
		out = append(out, f)
	}
	return out
}

// fieldValues splits the values a task holds for its project's live
// definitions: numbers, booleans and nulls, and strings (user text; an
// encrypted one reads as the placeholder). Values of other definitions stay in
// the data and are not shown, like in the app.
func (snap *snapshot) fieldValues(t opsync.Entity) (map[string]any, map[string]string) {
	plain := map[string]any{}
	var text map[string]string
	for _, d := range snap.fieldDefs[rawStr(t, "project_id")] {
		id := str(d, "id")
		raw, ok := t[opsync.FieldValuePrefix+id]
		if !ok {
			continue
		}
		var v any
		if json.Unmarshal(raw, &v) != nil {
			continue
		}
		if s, isStr := v.(string); isStr {
			if text == nil {
				text = map[string]string{}
			}
			text[id] = e2ee.Display(s)
			continue
		}
		plain[id] = v
	}
	return plain, text
}

// fieldPatch validates a `fields` argument against the live definitions of the
// project a task is in (after the write) and returns one patch entry per value.
//
// Two spellings are accepted: an object keyed by field id with typed values
// (`{"<id>": 120}`, the REST shape), and the list the tool schema advertises,
// `[{"id": "<id>", "value": "120"}]`, whose values are strings (or null)
// read by the field's type, because strict tool modes take neither an
// id-keyed map nor a value of several types.
func (snap *snapshot) fieldPatch(prefix, pid string, raw json.RawMessage, encrypted bool) (map[string]json.RawMessage, error) {
	defs := map[string]opsync.Entity{}
	for _, d := range snap.fieldDefs[pid] {
		defs[str(d, "id")] = d
	}
	var values map[string]json.RawMessage
	if strings.HasPrefix(strings.TrimSpace(string(raw)), "[") {
		var list []struct {
			ID    string  `json:"id"`
			Value *string `json:"value"`
		}
		if json.Unmarshal(raw, &list) != nil || len(list) > opsync.MaxFieldsPerProject {
			return nil, argErr(fmt.Sprintf("%sfields: must be a list of at most %d {id, value} items (see list_projects)", prefix, opsync.MaxFieldsPerProject))
		}
		values = map[string]json.RawMessage{}
		for _, it := range list {
			v, err := fieldFromText(defs[it.ID], it.Value)
			if err != nil {
				return nil, argErr(fmt.Sprintf("%sfields.%s: %v", prefix, it.ID, err))
			}
			values[it.ID] = v
		}
	} else if json.Unmarshal(raw, &values) != nil || values == nil {
		return nil, argErr(prefix + "fields: must be a list of {id, value} items or an object keyed by field id (see list_projects)")
	}
	ids := make([]string, 0, len(values))
	for id := range values {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := map[string]json.RawMessage{}
	for _, id := range ids {
		d, ok := defs[id]
		if _, valid := opsync.FieldValueID(opsync.FieldValuePrefix + id); !ok || !valid {
			return nil, argErr(fmt.Sprintf("%sfields.%s: no such field in the task's project (see list_projects)", prefix, id))
		}
		if msg := opsync.CheckFieldValue(d, values[id]); msg != "" {
			return nil, argErr(fmt.Sprintf("%sfields.%s: the %s field %s", prefix, id, str(d, "type"), msg))
		}
		// An encrypted account's string values are content the server cannot
		// encrypt (e2ee D7): numbers and checkboxes still work.
		if encrypted && strings.HasPrefix(strings.TrimSpace(string(values[id])), `"`) {
			return nil, encryptionErr()
		}
		out[opsync.FieldValuePrefix+id] = values[id]
	}
	return out, nil
}

// fieldFromText reads a list item's string value by its field's type: a number
// for number fields, true or false for checkboxes, the text otherwise; nil
// clears. An unknown definition passes the text on to be refused by id.
func fieldFromText(def opsync.Entity, v *string) (json.RawMessage, error) {
	if v == nil {
		return nullRaw, nil
	}
	s := strings.TrimSpace(*v)
	switch str(def, "type") {
	case "number":
		n, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
			return nil, fmt.Errorf("the number field must be a number, got %q", *v)
		}
		return raw(n), nil
	case "checkbox":
		switch strings.ToLower(s) {
		case "true":
			return json.RawMessage("true"), nil
		case "false":
			return json.RawMessage("false"), nil
		}
		return nil, fmt.Errorf("the checkbox field must be true or false, got %q", *v)
	}
	return raw(*v), nil
}

// ---- ordering and cursors ----

// taskKey orders tasks by local due date and time (undated last), then
// priority and creation time; ids break ties.
func taskKey(t opsync.Entity, loc *time.Location) string {
	date, clock := "~", "~"
	if d := taskDue(t); d != nil {
		date, clock = localDue(d, loc)
		if clock == "" {
			clock = "~"
		}
	}
	return fmt.Sprintf("%s|%s|%d|%s", date, clock, priority(t), sortableFloat(num(t, "created_at")))
}

// sortableFloat encodes f so that string order matches numeric order.
func sortableFloat(f float64) string {
	b := math.Float64bits(f)
	if b&(1<<63) != 0 {
		b = ^b
	} else {
		b |= 1 << 63
	}
	return fmt.Sprintf("%016x", b)
}

type keyed[T any] struct {
	key, id string
	v       T
}

type cursorData struct {
	K string `json:"k"`
	I string `json:"i"`
}

func encodeCursor(key, id string) string {
	b, _ := json.Marshal(cursorData{K: key, I: id})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(c string) (cursorData, error) {
	var d cursorData
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil || json.Unmarshal(b, &d) != nil || d.I == "" {
		return d, argErr("cursor: invalid cursor")
	}
	return d, nil
}

// page sorts items by (key, id) and returns at most limit of them after the
// cursor, with the cursor of the next page ("" when this is the last).
func page[T any](items []keyed[T], cursor string, limit int) ([]T, string, error) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].key != items[j].key {
			return items[i].key < items[j].key
		}
		return items[i].id < items[j].id
	})
	start := 0
	if cursor != "" {
		c, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		start = sort.Search(len(items), func(i int) bool {
			if items[i].key != c.K {
				return items[i].key > c.K
			}
			return items[i].id > c.I
		})
	}
	end := min(start+limit, len(items))
	out := make([]T, 0, end-start)
	for _, it := range items[start:end] {
		out = append(out, it.v)
	}
	next := ""
	if end < len(items) && end > start {
		last := items[end-1]
		next = encodeCursor(last.key, last.id)
	}
	return out, next, nil
}

// ---- argument parsing ----

type args map[string]json.RawMessage

func (a args) present(name string) bool {
	raw, ok := a[name]
	return ok && string(raw) != "null"
}

func (a args) str(name string) (string, error) {
	if !a.present(name) {
		return "", nil
	}
	var v string
	if json.Unmarshal(a[name], &v) != nil {
		return "", argErr(name + ": must be a string")
	}
	return strings.TrimSpace(v), nil
}

func (a args) boolean(name string) (bool, error) {
	if !a.present(name) {
		return false, nil
	}
	var v bool
	if json.Unmarshal(a[name], &v) != nil {
		return false, argErr(name + ": must be true or false")
	}
	return v, nil
}

// integer reads an integral JSON number (2 and 2.0 are accepted, 2.5 is not).
func (a args) integer(name string) (int, bool, error) {
	if !a.present(name) {
		return 0, false, nil
	}
	var f float64
	if json.Unmarshal(a[name], &f) != nil || f != math.Trunc(f) || math.Abs(f) > 1e9 {
		return 0, false, argErr(name + ": must be an integer")
	}
	return int(f), true, nil
}

func (a args) limit() (int, error) {
	n, ok, err := a.integer("limit")
	if err != nil {
		return 0, err
	}
	if !ok {
		return MaxItems, nil
	}
	if n < 1 {
		return 0, argErr("limit: must be at least 1")
	}
	return min(n, MaxItems), nil
}

func (a args) location() (*time.Location, error) {
	tz, err := a.str("timezone")
	if err != nil {
		return nil, err
	}
	return parseZone(tz, "timezone")
}

func parseZone(tz, name string) (*time.Location, error) {
	if tz == "" || tz == "UTC" {
		return time.UTC, nil
	}
	loc, err := zoned.Load(tz)
	if err != nil {
		return nil, argErr(name + ": unknown IANA time zone " + fmt.Sprintf("%q", tz))
	}
	return loc, nil
}

// ParseCompletionBound reads one end of a completion range (OpenSpec change
// completed-date-filters, design D6): a YYYY-MM-DD date (local midnight in loc),
// an RFC 3339 time or Unix milliseconds, as Unix ms. An empty value is 0 (no
// bound). The REST task list shares it.
func ParseCompletionBound(name, v string, loc *time.Location) (int64, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, nil
	}
	if loc == nil {
		loc = time.UTC
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
	return 0, argErr(name + ": must be a date (YYYY-MM-DD), an RFC 3339 time or Unix milliseconds")
}

// InCompletionRange reports whether a completion time (Unix ms, 0 = open task)
// falls in [after, before); a zero bound is open. Without bounds every task is in.
func InCompletionRange(completedAt, after, before int64) bool {
	if after == 0 && before == 0 {
		return true
	}
	return completedAt != 0 && (after == 0 || completedAt >= after) && (before == 0 || completedAt < before)
}

func (a args) date(name string) (string, error) {
	v, err := a.str(name)
	if err != nil || v == "" {
		return "", err
	}
	if t, perr := time.Parse("2006-01-02", v); perr != nil || t.Format("2006-01-02") != v {
		return "", argErr(name + ": must be a date in YYYY-MM-DD form")
	}
	return v, nil
}
