package sync

import (
	"encoding/json"
	"errors"
	"fmt"
)

// ErrInvalidOp wraps every validation failure.
var ErrInvalidOp = errors.New("invalid op")

// Validate checks structure, schema membership and value type of an op.
func Validate(op Op) error {
	if op.ID == "" || len(op.ID) > MaxIDLen || op.EntityID == "" || len(op.EntityID) > MaxIDLen {
		return fmt.Errorf("%w: id and entityId are required (max %d chars)", ErrInvalidOp, MaxIDLen)
	}
	if !ValidEntityID(op.EntityID) {
		return fmt.Errorf("%w: entityId may only contain letters, digits and . _ : @ + = ~ -", ErrInvalidOp)
	}
	if op.Device == "" || len(op.Device) > MaxIDLen {
		return fmt.Errorf("%w: device is required", ErrInvalidOp)
	}
	if op.TS <= 0 {
		return fmt.Errorf("%w: ts must be a positive unix millisecond timestamp", ErrInvalidOp)
	}
	if _, ok := Schema[op.Entity]; !ok {
		return fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, op.Entity)
	}
	k, ok := fieldKind(op.Entity, op.Field)
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
	if err := checkIDListOp(op, k); err != nil {
		return err
	}
	if op.Entity == "attachment" {
		if err := checkAttachment(op.Field, op.Value); err != nil {
			return fmt.Errorf("%w: attachment.%s %v", ErrInvalidOp, op.Field, err)
		}
	}
	if op.Entity == "slot" {
		if err := checkSlot(op.Field, op.Value); err != nil {
			return fmt.Errorf("%w: slot.%s %v", ErrInvalidOp, op.Field, err)
		}
	}
	return nil
}

// Wins reports whether (ts, device) beats the existing (ets, edevice).
// Ties on timestamp are broken by device id so every replica picks the same winner.
func Wins(ts int64, device string, ets int64, edevice string) bool {
	return ts > ets || (ts == ets && device > edevice)
}
