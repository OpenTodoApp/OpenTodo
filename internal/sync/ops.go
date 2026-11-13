// Package sync implements the field-level, last-writer-wins operation log that every
// client and the REST API write through. Each Op sets one field of one entity.
// Two replicas that have seen the same set of ops hold identical state,
// regardless of delivery order, which is what makes offline editing safe.
package sync

import (
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"
)

// Op is one field assignment.
type Op struct {
	ID       string          `json:"id"`
	Entity   string          `json:"entity"`
	EntityID string          `json:"entityId"`
	Field    string          `json:"field"`
	Value    json.RawMessage `json:"value"`
	TS       int64           `json:"ts"`
	Device   string          `json:"device"`
	Seq      int64           `json:"seq,omitempty"`
	// Actor is the account id of the op's author, stamped by the server from the
	// authenticated submitter on every served op (OpenSpec change
	// `comments-and-activity`, design D3). A value sent by a client is ignored:
	// Apply always records the session's account.
	Actor string `json:"actor,omitempty"`
}

// Limits protect the server from abusive or buggy clients.
const (
	MaxOpsPerRequest = 1000
	MaxValueBytes    = 64 * 1024
	MaxIDLen         = 64
	// MaxBlockedBy caps a task's blockers (OpenSpec change task-dependencies).
	MaxBlockedBy = 50
	// MaxManualOrder caps the task ids of a label's or view's own manual order
	// (OpenSpec change view-manual-order, design D2): about 19 KB of UUIDs.
	MaxManualOrder  = 500
	MaxFutureSkewMs = 5 * 60 * 1000
	// MaxDocBytes caps a kDoc value (OpenSpec change collaborative-rich-text): the
	// length of the envelope string, i.e. 256 KB of base64 text. Every other kind
	// keeps MaxValueBytes.
	MaxDocBytes = 256 * 1024
	// MaxPullBytes is the byte budget of one pull page (OpenSpec change
	// `harden-server-edges`): the summed length of the op values it serves. A page
	// stops before the op that would exceed it, but always carries at least one
	// op so a device makes progress; hasMore tells it to ask again.
	MaxPullBytes = 4 * 1024 * 1024
)

// ValidEntityID reports whether id is a usable entity id: 1 to MaxIDLen
// characters from ASCII letters, digits and . _ : @ + = ~ -. That covers every
// id the clients make (UUIDs, name-derived UUIDs, "me", CalDAV UIDs) and keeps
// out quotes, backslashes, control characters and spaces, which would break the
// JSON and the URLs ids are written into (OpenSpec change
// harden-links-and-sharing).
func ValidEntityID(id string) bool {
	if id == "" || len(id) > MaxIDLen {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case strings.IndexByte("._:@+=~-", c) >= 0:
		default:
			return false
		}
	}
	return true
}

// QuoteJSON is s as a JSON string, for building values and for matching stored
// ones. It is the only quoting helper: fmt's %q and strconv.Quote produce
// escapes (\a, \x00, \U...) that are not JSON.
func QuoteJSON(s string) string {
	b, err := json.Marshal(s)
	if err != nil { // a Go string always marshals
		panic(err)
	}
	return string(b)
}

// MaxFocusSession is the largest time_entry.focus_session (focus-session-readable D2).
const MaxFocusSession = 99

// docEnvelope matches the prefix of a kDoc value: a lower-case format name and a
// version, e.g. "ydoc:v1:" (a Yjs update) or "enc:v1:" (e2ee ciphertext).
var docEnvelope = regexp.MustCompile(`^[a-z][a-z0-9]{0,15}:v[0-9]{1,3}:`)

// DocFields lists the kDoc fields as "entity.field". Readers that present
// values to people (history, webhooks; internal/activity keeps its own copy)
// leave these out: the field's plain-text projection (task.description for
// task.notes_doc) carries the readable content.
var DocFields = map[string]bool{
	"task.notes_doc": true,
	// A project's note (OpenSpec change project-notes): project.description is its projection.
	"project.notes_doc": true,
	// A standalone note (notes-overview): note.description is its projection.
	"note.notes_doc": true,
}

// IsDocField reports whether entity.field holds an opaque document.
func IsDocField(entity, field string) bool { return DocFields[entity+"."+field] }

// ValidDoc reports whether s is an acceptable kDoc value (see kDoc).
func ValidDoc(s string) bool {
	if s == "" {
		return true
	}
	if len(s) > MaxDocBytes {
		return false
	}
	m := docEnvelope.FindStringIndex(s)
	if m == nil {
		return false
	}
	payload := strings.TrimRight(s[m[1]:], "=")
	if payload == "" {
		return false
	}
	enc := base64.RawStdEncoding
	if strings.ContainsAny(payload, "-_") {
		enc = base64.RawURLEncoding
	}
	_, err := enc.DecodeString(payload)
	return err == nil
}

// MaxReminderOffset bounds reminder.offset_minutes: one year before or after the due time.
const MaxReminderOffset = 525600

// MaxPositiveInt bounds kPositiveInt fields; for estimate_minutes it is one week.
const MaxPositiveInt = 10080

// Field is one op field of Schema: its kind (what Validate accepts), the JSON
// value a client's row holds before an op sets it, and whether it is
// user-written text that an account with end-to-end encryption encrypts.
type Field struct {
	Kind    kind
	Default string
	Content bool
}

// Schema lists every entity and field a client may write. Adding a field is an
// additive, backwards-compatible change; renaming or removing one is breaking.
//
// Schema is the one place a field is declared: the web client's field types,
// row defaults and content-field list (web/src/generated/opSchema.ts), the
// server's e2ee.ContentFields and the contract fixture are generated from it
// (TestGeneratedOpSchema; UPDATE_OP_SCHEMA=1 rewrites them). A comment above
// a field becomes its documentation in the web client.
var Schema = map[string]map[string]Field{
	"project": {
		"name":       {Kind: kString, Default: `""`, Content: true},
		"color":      {Kind: kString, Default: `"#64748b"`},
		"position":   {Kind: kNumber, Default: `0`},
		"archived":   {Kind: kBool, Default: `false`},
		"parent_id":  {Kind: kNullableString, Default: `null`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// An icon name from the app's set, or null for the colour dot (OpenSpec
		// change ux-overhaul, project-organization "Project icon"). Not user text,
		// so it is not an encrypted content field.
		"icon": {Kind: kNullableString, Default: `null`},
		// The project's note (OpenSpec change project-notes): Markdown in
		// description, the mergeable document in notes_doc, as on tasks.
		"description": {Kind: kString, Default: `""`, Content: true},
		"notes_doc":   {Kind: kDoc, Default: `""`, Content: true},
		// The workspace the project belongs to, or null for the owner's default
		// workspace (OpenSpec change workspaces, design D2). A partition key, not
		// user text, so it is not an encrypted content field; on a shared project
		// only the owner may write it (CanWrite).
		"workspace_id": {Kind: kNullableString, Default: `null`},
		// How the project's tasks flow (OpenSpec change project-flow-modes):
		// "parallel", "sequential" or "area"; empty, missing or unknown reads as
		// parallel. Sync checks the kind only, so a later value stays additive;
		// REST and the agent tools check the set. Not user text.
		"flow_mode": {Kind: kString, Default: `""`},
		// The project's status (OpenSpec change project-review-cadence, design
		// D1): "active" or "maintenance"; empty, missing or unknown reads as
		// active. Shared with the project's members and written by those who may
		// change its other fields. Maintenance mutes the health words, the stalled
		// marker and "without a next action"; a passed deadline still shows. Sync
		// checks the kind only; REST and the agent tools check the set. Not user text.
		"status": {Kind: kString, Default: `""`},
		// The reusable-list mode (OpenSpec change reusable-lists, design D1):
		// adding an item already in the project reopens it instead of
		// duplicating it, and ticked items always show. aisles sorts new items
		// into aisle sections and reads as false while reusable is false. Flags,
		// not user text, so not content; additive.
		"reusable": {Kind: kBool, Default: `false`},
		"aisles":   {Kind: kBool, Default: `false`},
	},
	"task": {
		"title":        {Kind: kString, Default: `""`, Content: true},
		"description":  {Kind: kString, Default: `""`, Content: true},
		"project_id":   {Kind: kNullableString, Default: `null`},
		"parent_id":    {Kind: kNullableString, Default: `null`},
		"priority":     {Kind: kPriority, Default: `4`},
		"due":          {Kind: kDue, Default: `null`},
		"labels":       {Kind: kStringList, Default: `[]`},
		"position":     {Kind: kNumber, Default: `0`},
		"created_at":   {Kind: kNumber, Default: `0`},
		"completed_at": {Kind: kNullableNumber, Default: `null`},
		"deleted_at":   {Kind: kNullableNumber, Default: `null`},
		// Duration estimate in minutes (OpenSpec change nlp-quick-add); additive.
		"estimate_minutes": {Kind: kPositiveInt, Default: `null`},
		// The day the task must be finished by, separate from the planned due
		// date (OpenSpec change deadlines); additive.
		"deadline": {Kind: kDate, Default: `null`},
		// When the task becomes relevant: a start date that defers it, or
		// "someday" (parked); and the This Evening flag (OpenSpec change
		// someday-and-evening); additive.
		"start":   {Kind: kStart, Default: `null`},
		"evening": {Kind: kBool, Default: `false`},
		// Draw the task as a span from its start date to its do-on date
		// (OpenSpec change multi-day-tasks, design D1). Only drawing changes:
		// start keeps deferring and due stays the do-on date, and a flag
		// without a valid range (a date start before due.date) draws as a
		// plain task. Not content; additive.
		"span": {Kind: kBool, Default: `false`},
		// The part of the day besides Evening (OpenSpec change day-parts,
		// design D1): null, "morning" or "afternoon". Evening stays the evening
		// flag; clients write both fields in one batch (D2), and a task with the
		// flag set reads as Evening whatever this holds. Not content; additive.
		"day_part": {Kind: kDayPart, Default: `null`},
		// The energy the task asks for (OpenSpec change task-energy, design
		// D1): "" (none), "deep", "medium" or "low". Chosen from a menu, never
		// written text, so not content (D2); additive.
		"energy": {Kind: kEnergy, Default: `""`},
		// The period the task is planned for without a date (OpenSpec change
		// time-sectors, design D1): "" (none), an ISO week "2026-W44", a month
		// "2026-11" or a quarter "2026-Q4". A sector with no do-on date schedules
		// the task (it leaves the Inbox and Anytime) and is never overdue; clients
		// name it relative to the viewer's date and derive carry-over, never
		// writing it. A scheduling field like start: plaintext, not content;
		// additive.
		"sector": {Kind: kSector, Default: `""`},
		// How the task's own subtasks flow (OpenSpec change subtask-flow, GitHub
		// issue 1046): "sequential" offers its open subtasks one at a time in list
		// order; empty, "parallel", missing or unknown read as parallel, as on a
		// project. Sync checks the kind only, so a later value stays additive; a
		// client that does not know it shows every subtask as available. Not user
		// text, so not content.
		"flow_mode": {Kind: kString, Default: `""`},
		// The tasks this one waits for, in its own sharing scope (OpenSpec change
		// task-dependencies): one whole-list register; the resolver refuses ids of
		// other scopes and lists that close a cycle.
		"blocked_by": {Kind: kIDList, Default: `[]`},
		// The members an @mention in the notes names (OpenSpec change
		// editor-everywhere, design D7): written with notes_doc, filtered to
		// current members of the task's shared project at receipt, plaintext.
		"note_mentions": {Kind: kIDList, Default: `[]`},
		// Who takes turns on a recurring task, in order (OpenSpec change chore-rotation; see rotation.go):
		// plaintext member ids like assignee_id, not content; inert without a rule or a second member.
		"rotation": {Kind: kIDList, Default: `[]`},
		// Recurrence rule and the series an occurrence record belongs to
		// (OpenSpec change recurring-tasks); additive. See docs/recurrence.md.
		"recurrence": {Kind: kRecurrence, Default: `null`},
		"series_id":  {Kind: kNullableString, Default: `null`},
		// The occurrence date an occurrence record stands for (OpenSpec change
		// series-exceptions, design D1; iCalendar RECURRENCE-ID), kept when the
		// record is moved. Written once with series_id; the resolver refuses it on
		// a task without series_id and refuses a change once set. A date, not
		// content; additive (a record without it stands for its due date).
		"occurrence_date": {Kind: kDate, Default: `null`},
		// The series a piece of a split lineage continues and the date it starts
		// (OpenSpec change series-split, design D2): {series, date}, one whole value.
		// Set when the piece is created; the resolver refuses it on a task without a
		// rule, with a series in another sharing scope, and as a change once set.
		// Not content; additive (an older client sees an ordinary series).
		"split_from": {Kind: kSplit, Default: `null`},
		// Account id of the assignee or null (OpenSpec change task-assignment);
		// additive. Apply checks it against the task scope's membership at receipt.
		"assignee_id": {Kind: kNullableString, Default: `null`},
		// Section of the task's project or null (OpenSpec change board-view);
		// additive. A reference to a deleted, foreign or unknown section is a
		// display rule on clients ("No section"), never rejected on the sync path.
		"section_id": {Kind: kNullableString, Default: `null`},
		// Unmapped iCalendar content lines of the task's VTODO (OpenSpec change
		// caldav, design D3): opaque text, stored and synced, never shown.
		"ical_extra": {Kind: kNullableText, Default: `null`, Content: true},
		// The note as a mergeable rich-text document (OpenSpec change
		// collaborative-rich-text); additive. description stays its Markdown
		// projection, written by clients in the same batch. Opaque here.
		"notes_doc": {Kind: kDoc, Default: `""`, Content: true},
		// Habit tracking (OpenSpec change habits, design D1): habit flags a
		// series as a habit; skipped marks an occurrence record written by a
		// skip rather than a completion. Additive booleans, not content.
		"habit":   {Kind: kBool, Default: `false`},
		"skipped": {Kind: kBool, Default: `false`},
		// The habit's tiny version and anchor (OpenSpec change habits-home,
		// design D5): the two-minute version that still counts ("One page") and
		// the moment it follows ("After dinner"). User-written text, so content;
		// additive. Records copy them with the series' other fields, harmlessly.
		"habit_tiny":   {Kind: kString, Default: `""`, Content: true},
		"habit_anchor": {Kind: kString, Default: `""`, Content: true},
		// When the habit was graduated (habits-home D7), Unix ms, or null: a
		// graduated habit is in no list, projection, reminder or Today limit and
		// keeps its records; Resume continues it as a new piece of its lineage.
		// Not content; additive.
		"habit_graduated_at": {Kind: kNullableNumber, Default: `null`},
		// An occurrence record logged as the habit's tiny version (habits-home
		// D5): set in the completion batch, never copied from the series; a
		// full completion writes false. Not content; additive.
		"tiny": {Kind: kBool, Default: `false`},
		// Account id of whoever completed the task, or null (OpenSpec change
		// completed-date-filters, design D5); additive. Written beside
		// completed_at; ApplyStrict fills it in for server-side completions.
		"completed_by": {Kind: kNullableString, Default: `null`},
		// Where the task came from (OpenSpec change task-origin): one whole-value
		// register like due, so concurrent origins never mix; additive.
		"origin": {Kind: kOrigin, Default: `null`, Content: true},
		// Where the task happens (OpenSpec change task-locations): one whole-value
		// register like origin, so concurrent locations never mix; additive.
		"location": {Kind: kLocation, Default: `null`, Content: true},
		// A start guide sample task (OpenSpec change moments-and-onboarding,
		// design D3): excluded from Statistics, the Loop pulse and the digest,
		// kept on completion. A whole boolean, not content; additive.
		"sample": {Kind: kBool, Default: `false`},
		// The workspace of a task without a project, or null for the default
		// (OpenSpec change workspaces, design D2); a task with a project follows
		// its project and this value is ignored there.
		"workspace_id": {Kind: kNullableString, Default: `null`},
	},
	// section: a named, ordered container inside one project (OpenSpec change
	// board-view). It lives in the sharing scope of its project like a task does;
	// project_id never changes after creation (Apply refuses a scope change, the
	// REST API refuses any change).
	"section": {
		"name":       {Kind: kString, Default: `""`, Content: true},
		"project_id": {Kind: kID, Default: `""`},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// A palette colour (#rrggbb) and a name from the icon catalogue, or null
		// (OpenSpec change icons-and-section-style, design D4–D5). Not user text,
		// so neither is an encrypted content field. Sync checks the kind only: a
		// newer client may write an icon this server does not know yet.
		"color": {Kind: kNullableString, Default: `null`},
		"icon":  {Kind: kNullableString, Default: `null`},
		// How the section's tasks flow (OpenSpec change project-flow-modes):
		// "parallel" or "sequential"; empty, missing or unknown follows the
		// project. Sync checks the kind only. Not user text.
		"flow_mode": {Kind: kString, Default: `""`},
		// The aisle an aisle section stands for in a reusable list (OpenSpec
		// change reusable-lists, design D1): produce, bakery, dairy, meat,
		// frozen, pantry, drinks, household or personal, or null. A fixed key,
		// not user text, so it survives a rename and reads the same in every
		// language; clients read an unknown key as null, and the REST API
		// refuses it (invalid_aisle). Sync checks the kind only. Additive.
		"aisle": {Kind: kNullableString, Default: `null`},
	},
	// field: a custom field definition of one project (OpenSpec change
	// custom-fields, design D1). Like a section it lives in its project's sharing
	// scope and project_id never changes after creation; type is fixed too (the
	// REST API refuses a change). type is text|number|date|choice|link|checkbox,
	// carried as a string so a later type is additive; options holds a choice
	// field's options, one per line. Values live on the task as `fields.<id>`.
	"field": {
		"name":       {Kind: kString, Default: `""`, Content: true},
		"project_id": {Kind: kID, Default: `""`},
		"type":       {Kind: kString, Default: `"text"`},
		"options":    {Kind: kString, Default: `""`, Content: true},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// note: a standalone note (OpenSpec change notes-overview, design D1), not a
	// task: it never shows in task lists, counts, calendars, filters or
	// reminders. It lives in its project's sharing scope like a task, in the
	// author's personal scope without a project (design D2). Its pending
	// appends are the `appends.<id>` family.
	"note": {
		// The note's title; an empty one reads "Untitled note".
		"title": {Kind: kString, Default: `""`, Content: true},
		// The note itself: Markdown in description, the mergeable document in
		// notes_doc, written as a pair, as on tasks and projects.
		"notes_doc":   {Kind: kDoc, Default: `""`, Content: true},
		"description": {Kind: kString, Default: `""`, Content: true},
		// The note's project, or null for a personal note; decides its scope.
		"project_id": {Kind: kNullableString, Default: `null`},
		// Label ids, one whole-list register like task.labels.
		"labels": {Kind: kStringList, Default: `[]`},
		// Written at creation (the creation time) and kept for a later manual
		// order; the Notes page sorts by when the note last changed.
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// The workspace of a note without a project, or null for the default;
		// a note with a project follows its project, as task.workspace_id.
		"workspace_id": {Kind: kNullableString, Default: `null`},
		// A template (note-templates D1): the note is offered under From
		// template… and New note copies it; otherwise a note like any other.
		"template": {Kind: kBool, Default: `false`},
	},
	// task.labels holds label ids (a convention on the string array, not a format change).
	"label": {
		"name":       {Kind: kString, Default: `""`, Content: true},
		"color":      {Kind: kString, Default: `"#64748b"`},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// Workspace of the label, null for the default (OpenSpec change workspaces).
		"workspace_id": {Kind: kNullableString, Default: `null`},
		// Display options of the label's page (OpenSpec change list-display-options,
		// design D1): grouping, order and direction, enumerations carried as strings
		// like a view's; "" or an unknown value reads as the default. Labels are
		// personal, so the choice follows the user to their own devices only.
		"group_by": {Kind: kString, Default: `""`},
		"sort_by":  {Kind: kString, Default: `""`},
		"sort_dir": {Kind: kString, Default: `""`},
		// The label page's row layout (row-layouts D1); "" follows the account's.
		"row_layout": {Kind: kString, Default: `""`},
		// The label page's own manual order (OpenSpec change view-manual-order,
		// design D1, D2): the ids of the tasks placed by hand, in order; tasks
		// not listed follow by position. One whole-list register like
		// view.panels, never a task's position. Not content.
		"manual_order": {Kind: kOrderList, Default: `[]`},
	},
	// view: a saved filter query with presentation options (OpenSpec `custom-views`).
	// kind, group_by, sort_by and sort_dir are enumerations carried as plain strings so
	// a future option value stays additive: clients map unknown values to defaults at
	// read time and only the REST API rejects them. panels holds view ids (dashboards).
	"view": {
		"name":     {Kind: kString, Default: `""`, Content: true},
		"query":    {Kind: kString, Default: `""`, Content: true},
		"kind":     {Kind: kString, Default: `"list"`},
		"group_by": {Kind: kString, Default: `"project"`},
		"sort_by":  {Kind: kString, Default: `"due"`},
		"sort_dir": {Kind: kString, Default: `"asc"`},
		"pinned":   {Kind: kBool, Default: `false`},
		"position": {Kind: kNumber, Default: `0`},
		"color":    {Kind: kString, Default: `"#64748b"`},
		"panels":   {Kind: kStringList, Default: `[]`},
		"on_drop":  {Kind: kRule, Default: `null`},
		// Display options of a list view (OpenSpec change views-and-display): the layout
		// (an enumeration carried as a string), whether completed matches are listed, and
		// the row properties the view hides.
		"layout":         {Kind: kString, Default: `"list"`},
		"show_completed": {Kind: kBool, Default: `false`},
		"hidden_props":   {Kind: kStringList, Default: `[]`},
		// The view's row layout (row-layouts D1): "line" or "detailed"; "" follows
		// the account's choice (user_prefs.row_layout).
		"row_layout": {Kind: kString, Default: `""`},
		// The Board layout's notes preview (OpenSpec change board-polish, design
		// D4): each card shows two lines of its notes as plain text. A setting,
		// not user text, so not content; missing reads as off.
		"card_notes": {Kind: kBool, Default: `false`},
		// Nest subtasks in the List layout (GitHub issue 1108): "nested" shows a
		// match under its parent when both match, as Today's option does; "" or
		// any other value is the flat list.
		"subtasks":   {Kind: kString, Default: `""`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// Workspace of the view, null for the default (OpenSpec change workspaces).
		"workspace_id": {Kind: kNullableString, Default: `null`},
		// A name from the icon catalogue, or null for the default icon of the
		// view's kind (OpenSpec change sidebar-polish, design D4). Not user text,
		// so not content. Any string is accepted here so a newer catalogue stays
		// additive; REST checks it with iconset.Valid and clients render an
		// unknown name as the default icon.
		"icon": {Kind: kNullableString, Default: `null`},
		// A list view's own manual order (OpenSpec change view-manual-order,
		// design D1, D2): the ids of the tasks placed by hand, in order; tasks
		// not listed follow by position. One whole-list register. Not content.
		"manual_order": {Kind: kOrderList, Default: `[]`},
	},
	// reminder: fires relative to its task's due time or at an absolute instant
	// (OpenSpec change reminders, docs/sync.md). fire_at is always the resolved
	// instant, recomputed by the device that changes the task's due; the server
	// scheduler only compares it with the clock. delivered_at is written by the
	// server (device "server") when a push went out.
	"reminder": {
		"task_id":        {Kind: kID, Default: `""`},
		"kind":           {Kind: kReminderKind, Default: `"relative"`},
		"offset_minutes": {Kind: kOffsetMinutes, Default: `null`},
		"fire_at":        {Kind: kInstant, Default: `null`},
		"delivered_at":   {Kind: kNullableNumber, Default: `null`},
		"dismissed_at":   {Kind: kNullableNumber, Default: `null`},
		"created_at":     {Kind: kNumber, Default: `0`},
		"deleted_at":     {Kind: kNullableNumber, Default: `null`},
		// A location reminder's radius in metres, 100 to 5,000 (OpenSpec change
		// location-reminders, design D1): set only on the kinds "arrive" and
		// "leave", which fire on a phone that enters or leaves the circle
		// around the task's location and never have a fire_at or an offset
		// (reminder_check.go refuses the mixes). Not content: the place is in
		// the task's encrypted location.
		"radius_m": {Kind: kRadius, Default: `null`},
	},
	// comment: a threaded markdown comment on a task (OpenSpec change
	// `comments-and-activity`, design D1). It lives in its task's scope; Apply
	// checks authorship per op (author_id equals the submitter, only the author
	// edits, the author, admins and the owner delete; viewers may comment) and
	// keeps only mentions of current members. See docs/sync.md.
	"comment": {
		"task_id":    {Kind: kID, Default: `""`},
		"parent_id":  {Kind: kNullableString, Default: `null`},
		"body":       {Kind: kString, Default: `""`, Content: true},
		"author_id":  {Kind: kID, Default: `""`},
		"mentions":   {Kind: kStringList, Default: `[]`},
		"created_at": {Kind: kNumber, Default: `0`},
		"edited_at":  {Kind: kNullableNumber, Default: `null`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// A reply a guest sent through a task page (OpenSpec task-pages, design D6):
		// the name they typed (content, encrypted for encrypted accounts) and the page.
		"guest_name": {Kind: kNullableText, Default: `null`, Content: true},
		"page_id":    {Kind: kNullableString, Default: `null`},
	},
	// attachment: a file or link on a task or one of its comments (OpenSpec change
	// attachments, design D1). Metadata only: the bytes live under
	// <data>/attachments/ (internal/blobs). It lives in its task's scope and follows
	// the comment authorship rules; uploaded_at is written by the server alone (D3).
	"attachment": {
		"task_id":     {Kind: kID, Default: `""`},
		"comment_id":  {Kind: kNullableString, Default: `null`},
		"name":        {Kind: kString, Default: `""`, Content: true},
		"mime":        {Kind: kString, Default: `"application/octet-stream"`, Content: true},
		"size":        {Kind: kNumber, Default: `0`},
		"sha256":      {Kind: kString, Default: `""`},
		"url":         {Kind: kNullableText, Default: `null`, Content: true},
		"encrypted":   {Kind: kBool, Default: `false`},
		"author_id":   {Kind: kID, Default: `""`},
		"created_at":  {Kind: kNumber, Default: `0`},
		"uploaded_at": {Kind: kNullableNumber, Default: `null`},
		"deleted_at":  {Kind: kNullableNumber, Default: `null`},
	},
	// time_entry: one stretch of work on a task (OpenSpec change time-tracking,
	// design D1). It lives in its task's scope; Apply checks authorship per op
	// (user_id equals the submitter at creation and never changes, only the
	// author edits, the author, admins and the owner delete, viewers cannot
	// create). ended_at is null while the entry runs; a user has at most one
	// running entry, a rule every device applies (internal/timetrack). note is
	// user-written text, so it is an encrypted content field. focus_mode,
	// focus_session and planned_end_at are what a Focus work session tells
	// readers outside the device (OpenSpec change focus-session-readable,
	// design D2): plaintext, the author's alone, and planned_end_at is never
	// before started_at (refused as invalid). See docs/sync.md.
	"time_entry": {
		"task_id":    {Kind: kID, Default: `""`},
		"user_id":    {Kind: kID, Default: `""`},
		"started_at": {Kind: kInstant, Default: `0`},
		"ended_at":   {Kind: kInstant, Default: `null`},
		"device_id":  {Kind: kString, Default: `""`},
		"note":       {Kind: kString, Default: `""`, Content: true},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
		// focus_mode is the Focus mode of the work session that wrote the entry:
		// "pomodoro", "flowtime" or "countdown", "" for any other entry. A reader
		// keeps and shows an unknown value as a Focus session of unknown mode.
		"focus_mode": {Kind: kString, Default: `""`},
		// focus_session is the work session's number in the Pomodoro cycle (1 up
		// to the long-break count), 0 for the other modes and other entries.
		"focus_session": {Kind: kFocusSession, Default: `0`},
		// planned_end_at is when the work stretch ends if nothing changes (Unix
		// ms), null for Flowtime and other entries. Never before started_at.
		"planned_end_at": {Kind: kInstant, Default: `null`},
	},
	// place: a location the user keeps for reuse (OpenSpec change task-locations,
	// design D1). Like a label it is personal: it resolves to the author's
	// personal scope and never reaches other members. geo is the coordinate
	// pair as one value, so an encrypted account encrypts it whole; name,
	// address and geo are content fields.
	// rule: an automation rule (OpenSpec change automation-rules, design D1). Like
	// a label it is personal: it resolves to the author's personal scope. trigger,
	// condition and actions are each one whole value; name is a content field.
	// The server engine (internal/rules) runs enabled rules for their author.
	// The interface calls a rule a routine (routines-engine D1).
	"rule": {
		"name":      {Kind: kString, Default: `""`, Content: true},
		"enabled":   {Kind: kBool, Default: `false`},
		"trigger":   {Kind: kRuleTrigger, Default: `null`},
		"condition": {Kind: kRuleCondition, Default: `null`},
		"actions":   {Kind: kRuleActions, Default: `null`},
		// A routine's steps (routines-engine D2, D3): null reads the rule as one
		// Change tasks step over the trigger's output with its actions; a list is
		// the routine, and actions is then null or ignored. Not a content field:
		// an encrypted account's text literals inside are ciphertext envelopes.
		"steps": {Kind: kRoutineSteps, Default: `null`},
		// "Apply without asking" for a routine with AI steps (routines-ai-step
		// D4): "auto" turns it on, anything else reads as off (proposals). Set
		// only by the person in the app: agent paths refuse it, and the server
		// ignores a value an agent or assistant device wrote (D6). The server
		// compares its winning op's time with its own fallback state (D5).
		"ai_apply": {Kind: kString, Default: `""`},
		// The routine's AI tokens per UTC day (routines-ai-step D11): 0 reads as
		// 20,000; the routes accept 1,000 to 200,000.
		"ai_budget": {Kind: kNumber, Default: `0`},
		// The project a routine belongs to (routines-shared D1): null for a
		// personal routine. A routine of a shared project lives in the
		// project's scope like a task, its editors write it, and it runs as
		// whoever last turned it on, only inside that project.
		"project_id": {Kind: kNullableString, Default: `null`},
		// The workspace a personal routine works in (routine-conditions D1):
		// its trigger fires only for that workspace's tasks, its steps see and
		// change only that workspace's tasks and projects. Null is every
		// workspace, what each routine made before this field reads as. Unlike a
		// label's workspace_id, the default workspace is written as its id.
		// Ignored on a shared project's routine, which its project bounds.
		"workspace_id": {Kind: kNullableString, Default: `null`},
		"position":     {Kind: kNumber, Default: `0`},
		"created_at":   {Kind: kNumber, Default: `0`},
		"deleted_at":   {Kind: kNullableNumber, Default: `null`},
	},
	// frame: a recurring background window on the Day and Week grid (OpenSpec
	// change calendar-frames, design D1), such as "Deep work" on weekdays from
	// 09:00 to 11:00. Personal like a rule, with ids unique on the server
	// (entity-id-ownership). Occurrences are derived on the device (web
	// src/lib/frames.ts, internal/frames) and never stored. title is a content field.
	"frame": {
		"title": {Kind: kString, Default: `""`, Content: true},
		// ISO weekdays it repeats on, a comma list such as "1,2,3,4,5"; "" never occurs.
		"weekdays": {Kind: kWeekdays, Default: `""`},
		// Floating wall times "HH:MM"; a frame whose end is not after its start is kept and not drawn.
		"start": {Kind: kClock, Default: `"09:00"`},
		"end":   {Kind: kClock, Default: `"10:00"`},
		"color": {Kind: kString, Default: `"#64748b"`},
		// Planning source: "project:<id>", "label:<id>", "view:<id>" or "" (none). Ids only, never content.
		"source": {Kind: kString, Default: `""`},
		// First and last day it applies (inclusive); null is open-ended.
		"from_date":  {Kind: kDate, Default: `null`},
		"until_date": {Kind: kDate, Default: `null`},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// slot: several small tasks in one calendar block (OpenSpec change
	// calendar-slots, design D1), such as "Admin" on Wednesday from 16:00 for 45
	// minutes. Personal like a frame, with ids unique on the server; membership
	// lives here, never on the task, so shared tasks are unchanged for other
	// members. title is a content field.
	"slot": {
		"title": {Kind: kString, Default: `""`, Content: true},
		// The day it is on (floating); a slot without a date is never drawn.
		"date": {Kind: kDate, Default: `null`},
		// Floating wall time "HH:MM".
		"start": {Kind: kClock, Default: `"09:00"`},
		// Length in minutes, never null and at most MaxSlotMinutes (clients offer 15 to 480 in 15-minute steps).
		"minutes": {Kind: kPositiveInt, Default: `30`},
		// Ordered task ids, at most MaxSlotTasks, one whole-list value like task.blocked_by; ids of tasks not shown are kept.
		"task_ids":   {Kind: kIDList, Default: `[]`},
		"color":      {Kind: kString, Default: `"#64748b"`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// theme: a custom theme (OpenSpec change theme-editor, design D1). Personal
	// like a rule, with ids unique on the server; chosen for a side as
	// user_prefs.theme_light or theme_dark "user:<id>". doc is one whole theme
	// document (theme-engine D1, validated by internal/themes, at most 16 KB), so
	// two devices saving the same theme converge on the later save. Themes are
	// appearance, not user content: no field is a content field, and an
	// encrypted account stores them in plain text (docs/themes.md says so).
	// Devices keep at most 20 live themes per user; the server does not count.
	"theme": {
		"doc":        {Kind: kThemeDoc, Default: `null`},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	"place": {
		"name":       {Kind: kString, Default: `""`, Content: true},
		"address":    {Kind: kString, Default: `""`, Content: true},
		"geo":        {Kind: kGeo, Default: `null`, Content: true},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// project_prefs: one user's personal preferences for a project, keyed by the
	// project id (OpenSpec change `activity-feed`, design D1). It always resolves
	// to the author's personal scope, even for a shared project, so it syncs to
	// the author's own devices and never to other members. feed_seen_at is the
	// time (an event's ts, Unix ms) up to which the user has seen the project's
	// activity; clients never write a smaller value than the one they hold. Later
	// per-project preferences are additive fields here.
	"project_prefs": {
		"feed_seen_at": {Kind: kNumber, Default: `0`},
		// When this user last marked the project reviewed in the weekly review's
		// project walk (open-loops-method D4), Unix ms. Personal like the row.
		"reviewed_at": {Kind: kNumber, Default: `0`},
		// Display options of the project's list (OpenSpec change
		// list-display-options, design D1): grouping, order and direction as
		// strings; "" or an unknown value reads as the default (by section, manual
		// order). Personal like the row, also on a shared project.
		"group_by": {Kind: kString, Default: `""`},
		"sort_by":  {Kind: kString, Default: `""`},
		"sort_dir": {Kind: kString, Default: `""`},
		// The project list's row layout (row-layouts D1); "" follows the account's.
		"row_layout": {Kind: kString, Default: `""`},
		// How often this user reviews the project in the weekly review's walk
		// (OpenSpec change project-review-cadence, design D2): "week", "2weeks",
		// "month", "quarter" or "paused"; empty, missing or unknown reads as week.
		// Personal like reviewed_at, also on a shared project; derives no activity.
		"review_every": {Kind: kString, Default: `""`},
		// The project board's notes preview (OpenSpec change board-polish, design
		// D4): "Show notes on cards" in the board's page menu. Personal like the
		// row, also on a shared project (a viewer chooses too); missing reads as off.
		"card_notes": {Kind: kBool, Default: `false`},
	},
	// user_prefs: one user's date and time preferences (OpenSpec change
	// `date-time-preferences`, design D1). Clients write a single row with the
	// entityId "me"; like every entity without a project it resolves to the
	// author's personal scope, so each user's "me" row stays separate. Values are
	// enumerations carried as strings (date_format: system|day-month|month-day|iso,
	// time_format: system|12h|24h, week_start: system|mon|sun|sat); clients read
	// an unknown value as "system", so new values stay additive.
	"user_prefs": {
		"date_format": {Kind: kString, Default: `"system"`},
		"time_format": {Kind: kString, Default: `"system"`},
		"week_start":  {Kind: kString, Default: `"system"`},
		// Day start (OpenSpec change day-boundary, design D1): "HH:MM" from
		// "00:00" to "06:00", the local time a new day begins for this person.
		// Not restricted here; clients read an empty, malformed or out-of-range
		// value as "00:00" (midnight) and keep the stored value unchanged.
		"day_start": {Kind: kString, Default: `""`},
		// Appearance (OpenSpec change theming, design D1): theme_mode is
		// system|light|dark and theme_accent one of emerald, blue, indigo,
		// violet, rose, orange, teal, graphite or custom (OpenSpec change
		// accent-colour). Like the date fields the values are not restricted
		// here; clients read unknown values as the default.
		"theme_mode":   {Kind: kString, Default: `"system"`},
		"theme_accent": {Kind: kString, Default: `"emerald"`},
		// Custom accent (OpenSpec change accent-colour, design D1): the colour
		// the user picked, as lowercase "#rrggbb", used when theme_accent is
		// "custom". Clients derive the accent from it on the device and read the
		// theme "custom" with an empty or malformed colour as the default theme.
		"theme_accent_custom": {Kind: kString, Default: `""`},
		// Theme while light, while dark (theme-engine D6): "" (OpenTodo's), "builtin:<id>", "user:<id>" or "instance:<id>"; clients read what they cannot apply as "" and keep it.
		"theme_light": {Kind: kString, Default: `""`}, "theme_dark": {Kind: kString, Default: `""`},
		// Promoted sidebar destinations (OpenSpec change ux-overhaul, design D8): a
		// comma-separated list of view ids shown among the primary items; unknown
		// entries are ignored by clients.
		"sidebar_destinations": {Kind: kString, Default: `""`},
		// Row density (ux-overhaul, design D8): "comfortable" or "compact"; an
		// unknown or empty value reads as comfortable.
		"density": {Kind: kString, Default: `""`},
		// Row detail (OpenSpec change calm-rows, design D1): "calm" or
		// "detailed"; an unknown or empty value reads as calm.
		"row_detail": {Kind: kString, Default: `""`},
		// Favourites (OpenSpec change sidebar-favourites, design D1): an ordered,
		// comma-separated list of kind:id entries (project:<id>, label:<id>,
		// view:<id>) shown in the sidebar's Favourites group. Ids only, never
		// content; one string so the order is one last-writer-wins value.
		// Clients ignore entries of an unknown kind or whose item is missing.
		"favourites": {Kind: kString, Default: `""`},
		// The first-run card (ux-overhaul, first-run): "done" once the account has
		// finished or skipped it, so a second device does not show it again after sync.
		"first_run": {Kind: kString, Default: `""`},
		// The owner's welcome note (OpenSpec change welcome-note): "seen" once it was
		// closed on any device, so it is shown once per account.
		"welcome": {Kind: kString, Default: `""`},
		// How you work (OpenSpec change open-loops-method, design D2): "lists",
		// "companion" or "first"; clients read an unknown or empty value as
		// "lists", so new modes stay additive.
		"method_mode": {Kind: kString, Default: `""`},
		// Time sectors (OpenSpec change time-sectors, design D7): "on" shows the
		// Sector segment, the planning list's Time sectors source, the quick-add
		// sector phrases and the review's sector section; empty or any other value
		// reads as off and is kept. Sectors on tasks keep working either way.
		"time_sectors": {Kind: kString, Default: `""`},
		// The first-day checklist (OpenSpec change moments-and-onboarding, design
		// D5): "hidden" once its sidebar entry was hidden on any device; clients
		// read an empty or unknown value as shown.
		"start_checklist": {Kind: kString, Default: `""`},
		// Interface language (OpenSpec change app-localization, design D1):
		// "system" or a code from SHIPPED. Not restricted here; clients read an
		// unknown code as "system" and keep the stored value, so a catalog added
		// later stays additive.
		"language": {Kind: kString, Default: `"system"`},
		// Focus timer preferences (OpenSpec change focus-mode, design D5): the
		// timer mode (pomodoro|flowtime|countdown), which phases start on their
		// own (none|breaks|work|both) and the sound (off|on), plus the work,
		// short break and long break lengths in minutes (1-180), the number of
		// work sessions before a long break (1-12) and the break reminder after
		// that many minutes of continuous work (0 = off, else 15-240). Settings,
		// never content: not encrypted, no activity event. Clients check the
		// bounds before writing and read an unknown or out-of-range value as the
		// default without rewriting it; the server keeps the kind check only.
		"focus_mode":                {Kind: kString, Default: `""`},
		"focus_auto_start":          {Kind: kString, Default: `""`},
		"focus_sound":               {Kind: kString, Default: `""`},
		"focus_work_minutes":        {Kind: kNumber, Default: `0`},
		"focus_short_break_minutes": {Kind: kNumber, Default: `0`},
		"focus_long_break_minutes":  {Kind: kNumber, Default: `0`},
		"focus_long_break_every":    {Kind: kNumber, Default: `0`},
		"focus_break_after_minutes": {Kind: kNumber, Default: `0`},
		// Maps on this user's devices (OpenSpec change task-locations, design
		// D6): "on" or "off"; clients read an empty or unknown value as "on".
		"maps": {Kind: kString, Default: `""`},
		// Haptic feedback on this user's devices (OpenSpec change motion-v2,
		// design D6): "on" or "off"; clients read an empty or unknown value as
		// "on" and keep the stored value, so the field stays additive.
		"haptics": {Kind: kString, Default: `""`},
		// The day pages' briefing (OpenSpec change briefing-links, design D4):
		// "hidden" hides it on Today and Upcoming; clients read an empty or
		// unknown value as shown.
		"briefing": {Kind: kString, Default: `""`},
		// How a task opens from a list (OpenSpec change task-side-panel,
		// design D1): "page" or "panel"; clients read an empty or unknown
		// value as "page" and keep the stored value.
		"task_open": {Kind: kString, Default: `""`},
		// The account's task row layout (OpenSpec change row-layouts, design
		// D1): "line" or "detailed", the layout of every list without its own
		// choice; clients read an empty or unknown value as "line".
		"row_layout": {Kind: kString, Default: `""`},
		// Today's agenda of calendar events (OpenSpec change today-agenda,
		// design D1): "shown" or "hidden"; clients read an empty or unknown
		// value as hidden and keep the stored value.
		"today_events": {Kind: kString, Default: `""`},
		// Today hides tasks assigned to others (OpenSpec change
		// today-assigned-filter): "mine" omits them; clients read an empty or
		// unknown value as off and keep the stored value. Settings, never content.
		"today_assignees": {Kind: kString, Default: `""`},
		// Upcoming's calendar events, one agenda per day (OpenSpec
		// today-agenda): "shown" or "hidden"; clients read an empty or
		// unknown value as hidden and keep the stored value. Settings,
		// never content.
		"upcoming_events": {Kind: kString, Default: `""`},
		// Where new tasks are added from a list's quick add (OpenSpec change
		// add-position, design D1): "bottom" or "top"; clients read an empty
		// or unknown value as "bottom" and keep the stored value.
		"add_position": {Kind: kString, Default: `""`},
		// Default reminders (OpenSpec change default-reminders, design D1): the
		// offset in minutes from the due time, as a decimal string ("-30", "0",
		// "-1440"), of the reminder added when a task with a time
		// (reminder_default_timed) or with a date only (reminder_default_dated)
		// gets a due date; empty is none. Clients and the server read an empty,
		// malformed or out-of-range (beyond MaxReminderOffset) value as none and
		// keep it. Settings, never content: not encrypted.
		"reminder_default_timed": {Kind: kString, Default: `""`},
		"reminder_default_dated": {Kind: kString, Default: `""`},
		// Sidebar counts (OpenSpec change sidebar-polish, design D1): "" shows
		// counts at rest on Inbox and Today only, "all" on every project, label
		// and saved-view row; clients read an unknown value as "" and keep it.
		"sidebar_counts": {Kind: kString, Default: `""`},
		// The order of the primary sidebar destinations (sidebar-polish D3): a
		// comma-separated list of destination ids (inbox, today, upcoming,
		// calendar and promotable ids). Ids missing from it follow in the default
		// order; clients ignore and keep ids they do not know. Separate from
		// sidebar_destinations, which keeps meaning "promoted".
		"sidebar_order": {Kind: kString, Default: `""`},
		// Countdown presets (OpenSpec change focus-everywhere, design D5): a
		// comma-separated list of up to four whole minutes (5-180) shown as
		// chips in the Countdown dialog; clients read an empty or unreadable
		// value as "10,20,40" and ignore entries out of range, keeping the
		// stored value. Settings, never content: not encrypted.
		"focus_presets": {Kind: kString, Default: `""`},
		// Background noise during work sessions (focus-everywhere D6): "off",
		// "white", "pink" or "brown", synthesized on the device; clients read
		// an empty or unknown value as off and keep it. The volume is device
		// storage and never synced.
		"focus_noise": {Kind: kString, Default: `""`},
		// The length of the end-of-session sound (OpenSpec change
		// focus-end-alert, design D1): "short" or "long", read only while
		// focus_sound is "on"; clients read an empty or unknown value as
		// short and keep it. A client without this field plays the short
		// tone.
		"focus_alert": {Kind: kString, Default: `""`},
		// Today grouped by part of the day (OpenSpec change day-parts, design
		// D3): "on" groups Today into Morning, Afternoon and This Evening and
		// turns on the part phrases of quick add; clients read an empty or
		// unknown value as off and keep the stored value.
		"day_parts": {Kind: kString, Default: `""`},
		// The Today limit (OpenSpec change today-closed-list, design D5): 0 =
		// off, else the number of slots Today fills; clients read a non-integer
		// or a value outside 1-20 as off and keep the stored value.
		"today_limit": {Kind: kNumber, Default: `0`},
		// The Done today group (today-closed-list D5, D6): "shown" or
		// "hidden"; empty or unknown reads as shown in the method modes
		// companion and first and as hidden in lists.
		"today_done": {Kind: kString, Default: `""`},
		// Today's focus style (OpenSpec change bento-daily-check, design D4):
		// "bento" makes the focus a Large, a Medium and a Small slot; empty or
		// unknown reads as Three tasks and is kept.
		"focus_style": {Kind: kString, Default: `""`},
		// Energy levels (OpenSpec change task-energy, design D3): "on" offers
		// a task's energy in the task page, the row menu and quick add; clients
		// read an empty or unknown value as off and keep the stored value.
		"energy": {Kind: kString, Default: `""`},
		// The Bento order (bento-daily-check D4, D6): "summit" lists Medium,
		// Large, Small; empty or unknown reads as Frog (Large, Medium, Small)
		// and is kept.
		"bento_order": {Kind: kString, Default: `""`},
		// The Formatting button (OpenSpec change notes-toolbar-desktop, design
		// D4): "off" hides the Formatting toggle beside notes and in the
		// comment composer on a fine pointer; empty, "on" or any other value
		// shows it, and clients keep the stored value. Whether the row is open
		// is device storage and never synced. Settings, never content.
		"formatting_toggle": {Kind: kString, Default: `""`},
		// Routines seen marker (OpenSpec change routines-editor, design D10):
		// the server time (a run's at, Unix ms) up to which the user has seen
		// routine runs in the Inbox card. Clients never write a smaller value
		// than the one they hold, so last-writer-wins keeps the later mark; the
		// server's run-log retention reads it. Never content.
		"routines_seen_at": {Kind: kNumber, Default: `0`},
		// Hide successful runs (routines-editor D10): "on" leaves successes out
		// of the Inbox card (failures and proposals stay); clients and the
		// server read an empty or unknown value as off and keep it.
		"routines_hide_successes": {Kind: kString, Default: `""`},
		// Upcoming starts with Today (OpenSpec change upcoming-start-with-today,
		// design D1): "on" opens Upcoming with Today's own groups (Earlier,
		// Today, the parts of the day, This Evening, Blocked and Waiting for a
		// slot) before Tomorrow; clients read an empty or unknown value as off
		// and keep the stored value. Settings, never content.
		"upcoming_today": {Kind: kString, Default: `""`},
		// Objectives (OpenSpec change plan-objectives, design D8): "on" shows the
		// Plan's objectives strip and the weekly review's Objectives section;
		// clients read an empty or unknown value as off and keep the stored
		// value. Objectives stay in the export, REST, the CLI and MCP either way.
		"objectives": {Kind: kString, Default: `""`},
		// Habits (OpenSpec change habits-home, design D1): "" not decided, "on"
		// or "off". Not decided keeps the quiet ways in and reads as on while the
		// device holds an open habit; off hides every habit control and writes
		// nothing on a task. Clients read an unknown value as not decided and
		// keep it. Habits stay in the export, REST, the CLI and MCP either way.
		"habits": {Kind: kString, Default: `""`},
		// Full task titles (OpenSpec change full-task-titles, design D1): "on"
		// shows every task title in list rows, on board cards and in Today in
		// full, wrapped onto as many lines as it takes, instead of cutting it
		// with an ellipsis; clients read an empty or unknown value as off and
		// keep the stored value. Settings, never content.
		"full_titles": {Kind: kString, Default: `""`},
		// Today's display options (OpenSpec change builtin-view-options, design
		// D1, D2): the grouping of the day's own tasks, "day" (Time of day),
		// "project", "priority", "label" or "none"; Earlier, Blocked, Waiting for
		// a slot and Done today keep their place. Clients read an empty, unknown
		// or not-offered value as "day" and keep the stored value. Settings,
		// never content.
		"today_group_by": {Kind: kString, Default: `""`},
		// Today's order (builtin-view-options D2): "due", "priority", "created",
		// "deadline", "title" or "field:<id>"; empty or unknown reads as "due".
		"today_sort_by": {Kind: kString, Default: `""`},
		// Today's order direction: "asc" or "desc"; empty or unknown reads as "asc".
		"today_sort_dir": {Kind: kString, Default: `""`},
		// Today's row layout (row-layouts): "line" or "detailed"; empty or
		// unknown follows the account's row_layout.
		"today_row_layout": {Kind: kString, Default: `""`},
		// Today's Nest subtasks (builtin-view-options D5): "nested" lists a
		// subtask under its parent when both are in the same group; anything
		// else reads as flat.
		"today_subtasks": {Kind: kString, Default: `""`},
		// Upcoming's order within each day (builtin-view-options D2, D4): the
		// same values as today_sort_by; empty or unknown reads as "due".
		"upcoming_sort_by": {Kind: kString, Default: `""`},
		// Upcoming's order direction: "asc" or "desc"; empty or unknown reads as "asc".
		"upcoming_sort_dir": {Kind: kString, Default: `""`},
		// Upcoming's row layout: "line" or "detailed"; empty or unknown follows
		// the account's row_layout.
		"upcoming_row_layout": {Kind: kString, Default: `""`},
		// Upcoming's Nest subtasks: "nested" or flat, as today_subtasks.
		"upcoming_subtasks": {Kind: kString, Default: `""`},
		// Upcoming's later days (OpenSpec change sidebar-brand-and-row-grid,
		// design D8): "full" lists every day in full; "" or "summary" (the
		// default) lists the first three days with tasks in full and each later
		// day as one closed bar with its count and first titles. Clients read an
		// empty or unknown value as summarised and keep the stored value.
		// Settings, never content.
		"upcoming_later": {Kind: kString, Default: `""`},
		// The Inbox's grouping of its top-level tasks (builtin-view-options D6):
		// "none", "due", "priority" or "label"; empty, unknown or not-offered
		// reads as "none".
		"inbox_group_by": {Kind: kString, Default: `""`},
		// The Inbox's order: "position" (manual), "priority", "due", "created",
		// "deadline" or "title"; empty or unknown reads as "position".
		"inbox_sort_by": {Kind: kString, Default: `""`},
		// The Inbox's order direction: "asc" or "desc"; empty or unknown reads as "asc".
		"inbox_sort_dir": {Kind: kString, Default: `""`},
		// The Inbox's row layout: "line" or "detailed"; empty or unknown follows
		// the account's row_layout.
		"inbox_row_layout": {Kind: kString, Default: `""`},
		// The person's names for the four priority levels (OpenSpec change
		// priority-names, design D1): one field per level so two devices
		// renaming different levels offline both keep their edit. "" means the
		// default ("Priority 1" … in the interface language); clients trim a
		// name to one line of at most 24 characters and show a longer stored
		// value truncated. Only the label changes: a task's priority stays the
		// number. User-written text (e2ee.ContentFields).
		"priority_name_1": {Kind: kString, Default: `""`, Content: true},
		"priority_name_2": {Kind: kString, Default: `""`, Content: true},
		"priority_name_3": {Kind: kString, Default: `""`, Content: true},
		"priority_name_4": {Kind: kString, Default: `""`, Content: true},
	},
	// objective: one quarterly or weekly objective (OpenSpec change
	// plan-objectives, design D1). Personal like place: it resolves to the
	// author's personal scope, syncs to that user's devices only and derives no
	// activity event. At most 5 open objectives per period: REST refuses a
	// sixth, sync cannot refuse convergently and devices show all of them.
	"objective": {
		// The objective, one line of 1 to 140 characters (ciphertext for an
		// encrypted account).
		"title": {Kind: kObjectiveTitle, Default: `""`, Content: true},
		// The quarter "YYYY-Qn" or ISO week "YYYY-Www" it is for; never a month.
		"period": {Kind: kObjectivePeriod, Default: `""`},
		// Order within its period.
		"position": {Kind: kNumber, Default: `0`},
		// When it was marked done, Unix ms; 0 = open.
		"done_at":    {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// memory: one fact the user told the in-app assistant to remember (OpenSpec
	// change assistant-memory, design D1), such as "Does not work on Fridays".
	// Personal like an objective, with ids unique on the server; sent with every
	// assistant turn, never to MCP clients, agent tokens or routines. Devices keep
	// at most 20 live items; the server does not count.
	"memory": {
		// The fact, one line of 1 to 200 characters (ciphertext for an encrypted account).
		"text":       {Kind: kMemoryText, Default: `""`, Content: true},
		"position":   {Kind: kNumber, Default: `0`},
		"created_at": {Kind: kNumber, Default: `0`},
		"deleted_at": {Kind: kNullableNumber, Default: `null`},
	},
	// review: when the user last finished a weekly review (OpenSpec change
	// `stats-and-review`, design D4). One row with the entityId "me"; like
	// user_prefs it resolves to the author's personal scope (the default branch of
	// the scope resolver), so it syncs to the user's own devices only and
	// converges by last-writer-wins. completed_at is Unix ms. Its times and focus
	// are not user-written content and are never encrypted; it derives no
	// activity event.
	"review": {
		"completed_at": {Kind: kNumber, Default: `0`},
		// The other rhythms (open-loops-method D5): the last Daily check and
		// Monthly look (Unix ms), and today's focus as the local date
		// (YYYY-MM-DD) and up to three comma-separated task ids.
		"daily_at":   {Kind: kNumber, Default: `0`},
		"monthly_at": {Kind: kNumber, Default: `0`},
		"focus_date": {Kind: kString, Default: `""`},
		"focus":      {Kind: kString, Default: `""`},
		// Close the day (OpenSpec change close-the-day, design D5): the latest
		// close (Unix ms; 0 = never) and the one-line note for tomorrow written
		// with it. The note is user-written content (e2ee.ContentFields).
		"closed_at":     {Kind: kNumber, Default: `0`},
		"tomorrow_note": {Kind: kString, Default: `""`, Content: true},
		// The logical date the latest close closed (close-the-day-v2 D1),
		// YYYY-MM-DD; "" = the logical day of closed_at (closes written before
		// the field existed). A date, never user-written text.
		"closed_day": {Kind: kString, Default: `""`},
		// The latest carry-over (ux-feedback-2 D1): JSON {date, items:[{id, field,
		// before, after}]} so Reopen the day can put it back on any device; "" =
		// none. Task ids, field names and dates only, never user-written text.
		"carry_over": {Kind: kString, Default: `""`},
		// Take a slot (OpenSpec change today-closed-list, design D3): the
		// logical date (YYYY-MM-DD) the list was chosen on and up to twenty
		// comma-separated task ids let into Today's slots, in the order taken.
		// A list of another day reads as empty. Task ids only, never content.
		"slots_date": {Kind: kString, Default: `""`},
		"slots":      {Kind: kString, Default: `""`},
		// The Bento slots of today's focus (OpenSpec change bento-daily-check,
		// design D3): "L:<id>,M:<id>,S:<id>", any subset, written in the same
		// batch as focus and focus_date; an entry counts only for an id in
		// focus. Task ids and fixed letters only, never content.
		"focus_slots": {Kind: kString, Default: `""`},
	},
}

// Plural maps REST collection names to entity names.
var Plural = map[string]string{"projects": "project", "tasks": "task", "labels": "label", "views": "view", "reminders": "reminder", "sections": "section", "fields": "field", "rules": "rule", "frames": "frame", "slots": "slot", "notes": "note", "objectives": "objective"}
