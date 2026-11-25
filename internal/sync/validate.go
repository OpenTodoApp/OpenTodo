package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// ErrInvalidOp wraps every validation failure.
var ErrInvalidOp = errors.New("invalid op")

// ReasonInvalid refuses one op whose value or device this server will never accept
// (a value a rule refuses, a device only the server may use), for a client that
// sends the feature invalid_ops (sync-invalid-op-alone D1). It is a verdict, like
// forbidden: the server's value comes back and the device drops the change
// (invalid-op-ends D1).
const ReasonInvalid = "invalid"

// ReasonUnknownField refuses one op for an entity or field this server does not
// know: a newer client's field, which a later server may accept, so the device
// keeps the change and offers it again (invalid-op-ends D1).
const ReasonUnknownField = "unknown_field"

// SplitInvalid returns the ops that pass Validate and carry a device a client may
// use, a refusal for each of the others (ReasonUnknownField for an entity or field
// the schema lacks, ReasonInvalid for the rest), and the ops refused as invalid, so
// their fields' server values can be sent back. One bad op never refuses the rest
// of the batch (sync-invalid-op-alone D1).
func SplitInvalid(ops []Op) (valid []Op, refused []Rejection, invalid []Op) {
	valid = make([]Op, 0, len(ops))
	for _, op := range ops {
		if !ReservedDevice(op.Device) && Validate(op) == nil && checkStamp(op) == nil {
			valid = append(valid, op)
			continue
		}
		if _, known := fieldKind(op.Entity, op.Field); !known && !ReservedDevice(op.Device) {
			refused = append(refused, Rejection{ID: op.ID, Reason: ReasonUnknownField})
			continue
		}
		refused = append(refused, Rejection{ID: op.ID, Reason: ReasonInvalid})
		invalid = append(invalid, op)
	}
	return valid, refused, invalid
}

type invalidKey struct{}

// WithInvalidRefused hands Apply the ops SplitInvalid refused as invalid, so the
// answer carries their fields' server values like any refused op's (invalid-op-ends D1).
func WithInvalidRefused(ctx context.Context, ops []Op) context.Context {
	if len(ops) == 0 {
		return ctx
	}
	return context.WithValue(ctx, invalidKey{}, ops)
}

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
