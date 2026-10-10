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
)

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
	},
	// task.labels holds label ids (a convention on the string array, not a format change).
	"label": {
		"name":       kString,
		"color":      kString,
		"position":   kNumber,
		"created_at": kNumber,
		"deleted_at": kNullableNumber,
	},
}

// Plural maps REST collection names to entity names.
var Plural = map[string]string{"projects": "project", "tasks": "task", "labels": "label"}

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
