// Package sync implements the field-level, last-writer-wins operation log that every
// client and the REST API write through. Each Op sets one field of one entity.
// Two replicas that have seen the same set of ops hold identical state,
// regardless of delivery order, which is what makes offline editing safe.
package sync

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/zoned"
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
	MaxBlockedBy    = 50
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

type kind int

const (
	kString kind = iota
	kNullableString
	kNumber
	kNullableNumber
	kBool
	kPriority
	kDue
	kStringList
	// kPositiveInt is null or a positive integer no larger than MaxPositiveInt.
	kPositiveInt
	// kRecurrence is null or a rule accepted by internal/recurrence (at most
	// recurrence.MaxLen characters). Clients store the canonical form; any
	// parseable spelling is accepted so the op log is never rewritten.
	kRecurrence
	// kID is a non-empty id string of at most MaxIDLen characters (reminder.task_id).
	kID
	// kReminderKind is "relative", "absolute" (OpenSpec change reminders) or
	// "deadline" (OpenSpec change deadlines).
	kReminderKind
	// kOffsetMinutes is null or an integer within ±MaxReminderOffset minutes.
	kOffsetMinutes
	// kInstant is null or a positive Unix millisecond timestamp (reminder.fire_at).
	kInstant
	// kNullableText is null or any string, bounded by MaxValueBytes like every
	// value (task.ical_extra, OpenSpec change caldav).
	kNullableText
	// kDoc is an opaque, mergeable document (OpenSpec change
	// collaborative-rich-text, docs/sync.md "Mergeable documents"): "" (no
	// document) or an envelope "<format>:v<n>:<base64>" of at most MaxDocBytes
	// characters. The server checks only the envelope shape and that the payload
	// is base64 (standard or URL alphabet, padding optional); it never decodes
	// the document, so a client format (or an end-to-end encrypted value) can
	// change without a server change.
	kDoc
	// kDate is null or a bare calendar date "YYYY-MM-DD" with no time or zone
	// (task.deadline, OpenSpec change deadlines).
	kDate
	// kStart is null, the word "someday" or a calendar date "YYYY-MM-DD"
	// (task.start, OpenSpec change someday-and-evening).
	kStart
	// kIDList is an array of at most MaxBlockedBy distinct, non-empty ids of at
	// most MaxIDLen characters (task.blocked_by, OpenSpec change task-dependencies).
	kIDList
)

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

// Schema lists every entity and field a client may write. Adding a field is an
// additive, backwards-compatible change; renaming or removing one is breaking.
var Schema = map[string]map[string]kind{
	"project": {
		"name":       kString,
		"color":      kString,
		"position":   kNumber,
		"archived":   kBool,
		"parent_id":  kNullableString,
		"created_at": kNumber,
		"deleted_at": kNullableNumber,
		// An icon name from the app's set, or null for the colour dot (OpenSpec
		// change ux-overhaul, project-organization "Project icon"). Not user text,
		// so it is not an encrypted content field.
		"icon": kNullableString,
		// The project's note (OpenSpec change project-notes): Markdown in
		// description, the mergeable document in notes_doc, as on tasks.
		"description": kString,
		"notes_doc":   kDoc,
	},
	"task": {
		"title":        kString,
		"description":  kString,
		"project_id":   kNullableString,
		"parent_id":    kNullableString,
		"priority":     kPriority,
		"due":          kDue,
		"labels":       kStringList,
		"position":     kNumber,
		"created_at":   kNumber,
		"completed_at": kNullableNumber,
		"deleted_at":   kNullableNumber,
		// Duration estimate in minutes (OpenSpec change nlp-quick-add); additive.
		"estimate_minutes": kPositiveInt,
		// The day the task must be finished by, separate from the planned due
		// date (OpenSpec change deadlines); additive.
		"deadline": kDate,
		// When the task becomes relevant: a start date that defers it, or
		// "someday" (parked); and the This Evening flag (OpenSpec change
		// someday-and-evening); additive.
		"start":   kStart,
		"evening": kBool,
		// The tasks this one waits for, in its own sharing scope (OpenSpec change
		// task-dependencies): one whole-list register; the resolver refuses ids of
		// other scopes and lists that close a cycle.
		"blocked_by": kIDList,
		// Recurrence rule and the series an occurrence record belongs to
		// (OpenSpec change recurring-tasks); additive. See docs/recurrence.md.
		"recurrence": kRecurrence,
		"series_id":  kNullableString,
		// Account id of the assignee or null (OpenSpec change task-assignment);
		// additive. Apply checks it against the task scope's membership at receipt.
		"assignee_id": kNullableString,
		// Section of the task's project or null (OpenSpec change board-view);
		// additive. A reference to a deleted, foreign or unknown section is a
		// display rule on clients ("No section"), never rejected on the sync path.
		"section_id": kNullableString,
		// Unmapped iCalendar content lines of the task's VTODO (OpenSpec change
		// caldav, design D3): opaque text, stored and synced, never shown.
		"ical_extra": kNullableText,
		// The note as a mergeable rich-text document (OpenSpec change
		// collaborative-rich-text); additive. description stays its Markdown
		// projection, written by clients in the same batch. Opaque here.
		"notes_doc": kDoc,
		// Account id of whoever completed the task, or null (OpenSpec change
		// completed-date-filters, design D5); additive. Written beside
		// completed_at; ApplyStrict fills it in for server-side completions.
		"completed_by": kNullableString,
	},
	// section: a named, ordered container inside one project (OpenSpec change
	// board-view). It lives in the sharing scope of its project like a task does;
	// project_id never changes after creation (Apply refuses a scope change, the
	// REST API refuses any change).
	"section": {
		"name":       kString,
		"project_id": kID,
		"position":   kNumber,
		"created_at": kNumber,
		"deleted_at": kNullableNumber,
	},
	// task.labels holds label ids (a convention on the string array, not a format change).
	"label": {
		"name":       kString,
		"color":      kString,
		"position":   kNumber,
		"created_at": kNumber,
		"deleted_at": kNullableNumber,
	},
	// view: a saved filter query with presentation options (OpenSpec `custom-views`).
	// kind, group_by, sort_by and sort_dir are enumerations carried as plain strings so
	// a future option value stays additive: clients map unknown values to defaults at
	// read time and only the REST API rejects them. panels holds view ids (dashboards).
	"view": {
		"name":       kString,
		"query":      kString,
		"kind":       kString,
		"group_by":   kString,
		"sort_by":    kString,
		"sort_dir":   kString,
		"pinned":     kBool,
		"position":   kNumber,
		"color":      kString,
		"panels":     kStringList,
		"created_at": kNumber,
		"deleted_at": kNullableNumber,
	},
	// reminder: fires relative to its task's due time or at an absolute instant
	// (OpenSpec change reminders, docs/sync.md). fire_at is always the resolved
	// instant, recomputed by the device that changes the task's due; the server
	// scheduler only compares it with the clock. delivered_at is written by the
	// server (device "server") when a push went out.
	"reminder": {
		"task_id":        kID,
		"kind":           kReminderKind,
		"offset_minutes": kOffsetMinutes,
		"fire_at":        kInstant,
		"delivered_at":   kNullableNumber,
		"dismissed_at":   kNullableNumber,
		"created_at":     kNumber,
		"deleted_at":     kNullableNumber,
	},
	// comment: a threaded markdown comment on a task (OpenSpec change
	// `comments-and-activity`, design D1). It lives in its task's scope; Apply
	// checks authorship per op (author_id equals the submitter, only the author
	// edits, the author, admins and the owner delete; viewers may comment) and
	// keeps only mentions of current members. See docs/sync.md.
	"comment": {
		"task_id":    kID,
		"parent_id":  kNullableString,
		"body":       kString,
		"author_id":  kID,
		"mentions":   kStringList,
		"created_at": kNumber,
		"edited_at":  kNullableNumber,
		"deleted_at": kNullableNumber,
	},
	// attachment: a file or link on a task or one of its comments (OpenSpec change
	// attachments, design D1). Metadata only: the bytes live under
	// <data>/attachments/ (internal/blobs). It lives in its task's scope and follows
	// the comment authorship rules; uploaded_at is written by the server alone (D3).
	"attachment": {
		"task_id":     kID,
		"comment_id":  kNullableString,
		"name":        kString,
		"mime":        kString,
		"size":        kNumber,
		"sha256":      kString,
		"url":         kNullableText,
		"encrypted":   kBool,
		"author_id":   kID,
		"created_at":  kNumber,
		"uploaded_at": kNullableNumber,
		"deleted_at":  kNullableNumber,
	},
	// project_prefs: one user's personal preferences for a project, keyed by the
	// project id (OpenSpec change `activity-feed`, design D1). It always resolves
	// to the author's personal scope, even for a shared project, so it syncs to
	// the author's own devices and never to other members. feed_seen_at is the
	// time (an event's ts, Unix ms) up to which the user has seen the project's
	// activity; clients never write a smaller value than the one they hold. Later
	// per-project preferences are additive fields here.
	"project_prefs": {
		"feed_seen_at": kNumber,
	},
	// user_prefs: one user's date and time preferences (OpenSpec change
	// `date-time-preferences`, design D1). Clients write a single row with the
	// entityId "me"; like every entity without a project it resolves to the
	// author's personal scope, so each user's "me" row stays separate. Values are
	// enumerations carried as strings (date_format: system|day-month|month-day|iso,
	// time_format: system|12h|24h, week_start: system|mon|sun|sat); clients read
	// an unknown value as "system", so new values stay additive.
	"user_prefs": {
		"date_format": kString,
		"time_format": kString,
		"week_start":  kString,
		// Appearance (OpenSpec change theming, design D1): theme_mode is
		// system|light|dark and theme_accent one of emerald, blue, indigo,
		// violet, rose, orange, teal, graphite. Like the date fields the values
		// are not restricted here; clients read unknown values as the default.
		"theme_mode":   kString,
		"theme_accent": kString,
		// Promoted sidebar destinations (OpenSpec change ux-overhaul, design D8): a
		// comma-separated list of view ids shown among the primary items; unknown
		// entries are ignored by clients.
		"sidebar_destinations": kString,
		// Row density (ux-overhaul, design D8): "comfortable" or "compact"; an
		// unknown or empty value reads as comfortable.
		"density": kString,
		// The first-run card (ux-overhaul, first-run): "done" once the account has
		// finished or skipped it, so a second device does not show it again after sync.
		"first_run": kString,
	},
}

// Plural maps REST collection names to entity names.
var Plural = map[string]string{"projects": "project", "tasks": "task", "labels": "label", "views": "view", "reminders": "reminder", "sections": "section"}

// ErrInvalidOp wraps every validation failure.
var ErrInvalidOp = errors.New("invalid op")

// Validate checks structure, schema membership and value type of an op.
func Validate(op Op) error {
	if op.ID == "" || len(op.ID) > MaxIDLen || op.EntityID == "" || len(op.EntityID) > MaxIDLen {
		return fmt.Errorf("%w: id and entityId are required (max %d chars)", ErrInvalidOp, MaxIDLen)
	}
	if op.Device == "" || len(op.Device) > MaxIDLen {
		return fmt.Errorf("%w: device is required", ErrInvalidOp)
	}
	if op.TS <= 0 {
		return fmt.Errorf("%w: ts must be a positive unix millisecond timestamp", ErrInvalidOp)
	}
	fields, ok := Schema[op.Entity]
	if !ok {
		return fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, op.Entity)
	}
	k, ok := fields[op.Field]
	if !ok {
		return fmt.Errorf("%w: unknown field %q for %s", ErrInvalidOp, op.Field, op.Entity)
	}
	limit := MaxValueBytes
	if k == kDoc {
		// The JSON string adds its quotes; the envelope length is checked by checkKind.
		limit = MaxDocBytes + 2
	}
	if len(op.Value) == 0 || len(op.Value) > limit {
		return fmt.Errorf("%w: value for %s.%s missing or too large", ErrInvalidOp, op.Entity, op.Field)
	}
	if !json.Valid(op.Value) {
		return fmt.Errorf("%w: value for %s.%s is not valid JSON", ErrInvalidOp, op.Entity, op.Field)
	}
	if err := checkKind(k, op.Value); err != nil {
		return fmt.Errorf("%w: %s.%s %v", ErrInvalidOp, op.Entity, op.Field, err)
	}
	if k == kIDList && slices.Contains(idList(op.Value), op.EntityID) {
		return fmt.Errorf("%w: %s.%s cannot name the task itself", ErrInvalidOp, op.Entity, op.Field)
	}
	if op.Entity == "attachment" {
		if err := checkAttachment(op.Field, op.Value); err != nil {
			return fmt.Errorf("%w: attachment.%s %v", ErrInvalidOp, op.Field, err)
		}
	}
	return nil
}

// MaxAttachmentName is the longest attachment name (characters).
const MaxAttachmentName = 255

// checkAttachment adds the attachment rules (design D1): a name of 1–255
// characters without path separators, a link only over http or https, a size
// that is a non-negative whole number. Ciphertext (encrypted accounts) is
// opaque and only length-checked by the value limit.
func checkAttachment(field string, raw json.RawMessage) error {
	switch field {
	case "name":
		var s string
		_ = json.Unmarshal(raw, &s)
		if e2ee.IsCiphertext(s) {
			return nil
		}
		if n := utf8.RuneCountInString(s); n < 1 || n > MaxAttachmentName || strings.ContainsAny(s, "/\\\x00") {
			return errors.New("must be 1–255 characters without / or \\")
		}
	case "url":
		var s string
		if string(raw) == "null" || json.Unmarshal(raw, &s) != nil || e2ee.IsCiphertext(s) {
			return nil
		}
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("must be an http or https URL")
		}
	case "size":
		var n float64
		_ = json.Unmarshal(raw, &n)
		if n < 0 || n != float64(int64(n)) {
			return errors.New("must be a whole number of bytes")
		}
	}
	return nil
}

func checkKind(k kind, raw json.RawMessage) error {
	isNull := string(raw) == "null"
	switch k {
	case kString:
		var s string
		if err := json.Unmarshal(raw, &s); err != nil || !utf8.ValidString(s) {
			return errors.New("must be a string")
		}
	case kNullableString:
		if isNull {
			return nil
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil || len(s) > MaxIDLen {
			return errors.New("must be null or an id string")
		}
	case kNumber:
		var f float64
		if err := json.Unmarshal(raw, &f); err != nil {
			return errors.New("must be a number")
		}
	case kNullableNumber:
		if isNull {
			return nil
		}
		var f float64
		if err := json.Unmarshal(raw, &f); err != nil {
			return errors.New("must be null or a number")
		}
	case kBool:
		var b bool
		if err := json.Unmarshal(raw, &b); err != nil {
			return errors.New("must be a boolean")
		}
	case kPriority:
		var p int
		if err := json.Unmarshal(raw, &p); err != nil || p < 1 || p > 4 {
			return errors.New("must be an integer from 1 (highest) to 4 (lowest)")
		}
	case kStart:
		if isNull {
			return nil
		}
		var d string
		if err := json.Unmarshal(raw, &d); err != nil || (d != "someday" && !isDate(d)) {
			return errors.New(`must be null, "someday" or a date "YYYY-MM-DD"`)
		}
		if d != "someday" {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				return errors.New(`must be null, "someday" or a date "YYYY-MM-DD" that exists`)
			}
		}
	case kDate:
		if isNull {
			return nil
		}
		var d string
		if err := json.Unmarshal(raw, &d); err != nil || !isDate(d) {
			return errors.New(`must be null or a date "YYYY-MM-DD"`)
		}
		if _, err := time.Parse("2006-01-02", d); err != nil {
			return errors.New(`must be null or a date "YYYY-MM-DD" that exists`)
		}
	case kDue:
		if isNull {
			return nil
		}
		var d struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
			TZ   *string `json:"tz"`
		}
		if err := json.Unmarshal(raw, &d); err != nil || !isDate(d.Date) || (d.Time != nil && !isClock(*d.Time)) {
			return errors.New(`must be null or {"date":"YYYY-MM-DD","time":"HH:MM"?,"tz":"Area/City"?}`)
		}
		// A zoned due (OpenSpec change absolute-datetimes) names a known IANA
		// zone and always has a time.
		if d.TZ != nil {
			if d.Time == nil {
				return errors.New("tz requires time")
			}
			if !zoned.Valid(*d.TZ) {
				return fmt.Errorf("tz must be a known IANA time zone of at most %d characters", zoned.MaxZoneLen)
			}
		}
	case kStringList:
		var l []string
		if err := json.Unmarshal(raw, &l); err != nil || l == nil {
			return errors.New("must be an array of strings")
		}
	case kIDList:
		var l []string
		if err := json.Unmarshal(raw, &l); err != nil || l == nil {
			return errors.New("must be an array of task ids")
		}
		if len(l) > MaxBlockedBy {
			return fmt.Errorf("may hold at most %d ids", MaxBlockedBy)
		}
		seen := make(map[string]bool, len(l))
		for _, id := range l {
			if id == "" || len(id) > MaxIDLen {
				return fmt.Errorf("ids must be 1 to %d characters", MaxIDLen)
			}
			if seen[id] {
				return fmt.Errorf("lists %q twice", id)
			}
			seen[id] = true
		}
	case kPositiveInt:
		if isNull {
			return nil
		}
		// Unmarshalling into an integer rejects fractions, exponents and strings.
		var n int64
		if err := json.Unmarshal(raw, &n); err != nil || n < 1 || n > MaxPositiveInt {
			return fmt.Errorf("must be null or an integer from 1 to %d", MaxPositiveInt)
		}
	case kRecurrence:
		if isNull {
			return nil
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return errors.New("must be null or a recurrence rule string")
		}
		if _, err := recurrence.Parse(s); err != nil {
			return err
		}
	case kID:
		var s string
		if err := json.Unmarshal(raw, &s); err != nil || s == "" || len(s) > MaxIDLen {
			return errors.New("must be an id string")
		}
	case kReminderKind:
		var s string
		if err := json.Unmarshal(raw, &s); err != nil || (s != "relative" && s != "absolute" && s != "deadline") {
			return errors.New(`must be "relative", "absolute" or "deadline"`)
		}
	case kOffsetMinutes:
		if isNull {
			return nil
		}
		var n int64
		if err := json.Unmarshal(raw, &n); err != nil || n < -MaxReminderOffset || n > MaxReminderOffset {
			return fmt.Errorf("must be null or an integer from -%d to %d", MaxReminderOffset, MaxReminderOffset)
		}
	case kNullableText:
		if isNull {
			return nil
		}
		var s string
		if err := json.Unmarshal(raw, &s); err != nil || !utf8.ValidString(s) {
			return errors.New("must be null or a string")
		}
	case kDoc:
		var s string
		if err := json.Unmarshal(raw, &s); isNull || err != nil || !ValidDoc(s) {
			return fmt.Errorf(`must be "" or a document envelope "<format>:v<n>:<base64>" of at most %d characters`, MaxDocBytes)
		}
	case kInstant:
		if isNull {
			return nil
		}
		var f float64
		if err := json.Unmarshal(raw, &f); err != nil || f <= 0 {
			return errors.New("must be null or a positive unix millisecond timestamp")
		}
	}
	return nil
}

func isDate(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	for i, c := range s {
		if i == 4 || i == 7 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func isClock(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	for i, c := range s {
		if i == 2 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// Wins reports whether (ts, device) beats the existing (ets, edevice).
// Ties on timestamp are broken by device id so every replica picks the same winner.
func Wins(ts int64, device string, ets int64, edevice string) bool {
	return ts > ets || (ts == ets && device > edevice)
}

// idList reads a kIDList value (nil when it is not one).
func idList(raw json.RawMessage) []string {
	var l []string
	_ = json.Unmarshal(raw, &l)
	return l
}
