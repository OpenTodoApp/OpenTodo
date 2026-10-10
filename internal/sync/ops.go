// Package sync implements the field-level, last-writer-wins operation log that every
// client and the REST API write through. Each Op sets one field of one entity.
// Two replicas that have seen the same set of ops hold identical state,
// regardless of delivery order, which is what makes offline editing safe.
package sync

import (
	"encoding/json"
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/recurrence"
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
	MaxFutureSkewMs  = 5 * 60 * 1000
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
	// kReminderKind is "relative" or "absolute" (OpenSpec change reminders).
	kReminderKind
	// kOffsetMinutes is null or an integer within ±MaxReminderOffset minutes.
	kOffsetMinutes
	// kInstant is null or a positive Unix millisecond timestamp (reminder.fire_at).
	kInstant
)

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
		// Recurrence rule and the series an occurrence record belongs to
		// (OpenSpec change recurring-tasks); additive. See docs/recurrence.md.
		"recurrence": kRecurrence,
		"series_id":  kNullableString,
		// Account id of the assignee or null (OpenSpec change task-assignment);
		// additive. Apply checks it against the task scope's membership at receipt.
		"assignee_id": kNullableString,
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
}

// Plural maps REST collection names to entity names.
var Plural = map[string]string{"projects": "project", "tasks": "task", "labels": "label", "views": "view", "reminders": "reminder"}

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
	if len(op.Value) == 0 || len(op.Value) > MaxValueBytes {
		return fmt.Errorf("%w: value for %s.%s missing or too large", ErrInvalidOp, op.Entity, op.Field)
	}
	if !json.Valid(op.Value) {
		return fmt.Errorf("%w: value for %s.%s is not valid JSON", ErrInvalidOp, op.Entity, op.Field)
	}
	if err := checkKind(k, op.Value); err != nil {
		return fmt.Errorf("%w: %s.%s %v", ErrInvalidOp, op.Entity, op.Field, err)
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
	case kDue:
		if isNull {
			return nil
		}
		var d struct {
			Date string  `json:"date"`
			Time *string `json:"time"`
		}
		if err := json.Unmarshal(raw, &d); err != nil || !isDate(d.Date) || (d.Time != nil && !isClock(*d.Time)) {
			return errors.New(`must be null or {"date":"YYYY-MM-DD","time":"HH:MM"?}`)
		}
	case kStringList:
		var l []string
		if err := json.Unmarshal(raw, &l); err != nil || l == nil {
			return errors.New("must be an array of strings")
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
		if err := json.Unmarshal(raw, &s); err != nil || (s != "relative" && s != "absolute") {
			return errors.New(`must be "relative" or "absolute"`)
		}
	case kOffsetMinutes:
		if isNull {
			return nil
		}
		var n int64
		if err := json.Unmarshal(raw, &n); err != nil || n < -MaxReminderOffset || n > MaxReminderOffset {
			return fmt.Errorf("must be null or an integer from -%d to %d", MaxReminderOffset, MaxReminderOffset)
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
