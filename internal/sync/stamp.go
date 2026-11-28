package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// The stamp rule of the v2 ciphertext envelope (OpenSpec change e2ee-rollback,
// design D2 and D3): an op whose value is a v2 envelope of a content field has
// the envelope's stamp as its timestamp. Devices refuse a v2 value whose stamp
// differs from its op's timestamp (an older value served again), so the server
// never stores one: a device's op with another timestamp is refused as invalid,
// a server-side write (ApplyStrict, imports) takes the stamp as its timestamp
// and is refused when that would not win (ReasonStaleCiphertext), and a v2 op
// is never moved to another timestamp (no clamping of a clock far ahead). The
// server reads the clear stamp only; it never has the key.

// ReasonStaleCiphertext refuses a server-side write of a v2 envelope whose
// stamp would not win over the field's current op: the writer seals the value
// again with a later stamp (409 stale_ciphertext with currentTs).
const ReasonStaleCiphertext = "stale_ciphertext"

// v2Stamp returns the stamp of op's value when it is a v2 envelope of a content
// field. v2 is true for an envelope-shaped value (e2ee.IsEnvelope) labelled v2,
// whether its stamp is valid or not; text that only starts with "enc:v2:", such
// as a title someone typed, is plain text and not v2.
func v2Stamp(op Op) (stamp int64, v2, ok bool) {
	if !bytes.HasPrefix(op.Value, []byte(`"`+e2ee.PrefixV2)) || !e2ee.IsContentField(op.Entity, op.Field) {
		return 0, false, false
	}
	var s string
	if json.Unmarshal(op.Value, &s) != nil || !e2ee.IsEnvelope(s) {
		return 0, false, false
	}
	stamp, ok = e2ee.Stamp(s)
	return stamp, true, ok
}

// IsV2Op reports whether op carries a v2 envelope of a content field.
func IsV2Op(op Op) bool {
	_, v2, _ := v2Stamp(op)
	return v2
}

// checkStamp refuses a v2 value that is malformed or whose stamp is not the
// op's timestamp.
func checkStamp(op Op) error {
	stamp, v2, ok := v2Stamp(op)
	switch {
	case !v2:
		return nil
	case !ok:
		return fmt.Errorf("%w: %s.%s is not a well-formed enc:v2: envelope", ErrInvalidOp, op.Entity, op.Field)
	case stamp != op.TS:
		return fmt.Errorf("%w: stamp_mismatch: %s.%s was sealed for timestamp %d, not %d", ErrInvalidOp, op.Entity, op.Field, stamp, op.TS)
	}
	return nil
}

type stampKey struct{}

// WithStampTimestamps makes Apply give every v2 op the stamp of its envelope as
// its timestamp, as ApplyStrict always does: for server-side writers that pass
// on values clients sealed (imports).
func WithStampTimestamps(ctx context.Context) context.Context {
	return context.WithValue(ctx, stampKey{}, true)
}

// stampTimestamps returns ops with each well-formed v2 op's timestamp set to
// its stamp (a copy when anything changes).
func stampTimestamps(ops []Op) []Op {
	var out []Op
	for i, op := range ops {
		stamp, _, ok := v2Stamp(op)
		if !ok || stamp == op.TS {
			continue
		}
		if out == nil {
			out = append([]Op(nil), ops...)
		}
		out[i].TS = stamp
	}
	if out == nil {
		return ops
	}
	return out
}
