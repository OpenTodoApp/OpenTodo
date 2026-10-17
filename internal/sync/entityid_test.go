package sync

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// TestValidateEntityIDCharset: ids the clients make are accepted; quotes,
// backslashes, control characters and spaces are refused, so a member cannot
// store an id that breaks every other member's lists (harden-links-and-sharing).
func TestValidateEntityIDCharset(t *testing.T) {
	for _, id := range []string{
		"0b7e6a52-3c1f-4f5e-9a1d-2b3c4d5e6f70", // uuid() / ids.New
		"8F0E2B1A-6C3D-4E5F-A7B8-C9D0E1F2A3B4", // an Apple CalDAV UID
		"20261017T101500Z-1234@example.com",    // another CalDAV UID
		"a.b_c:d+e=f~g-h", "me", "2026-W42",
		strings.Repeat("a", MaxIDLen),
	} {
		if err := Validate(op("o1", "task", id, "title", `"x"`, 100, "d")); err != nil {
			t.Errorf("%q refused: %v", id, err)
		}
	}
	for _, id := range []string{"x\u0007", `a"b`, `a\b`, "a b", "a/b", "<b>", "é", "x\n", strings.Repeat("a", MaxIDLen+1)} {
		if err := Validate(op("o1", "task", id, "title", `"x"`, 100, "d")); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%q accepted: %v", id, err)
		}
	}
}

// TestControlCharacterIDCannotBreakLists reproduces the finding: a task whose id
// holds a control character made List return invalid JSON for every reader.
func TestControlCharacterIDCannotBreakLists(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{op("o1", "task", "x\u0007", "title", `"bell"`, 100, "d")}); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("apply = %v, want ErrInvalidOp", err)
	}
	if _, err := s.Apply(ctx, "u1", []Op{op("o2", "task", "t1", "title", `"fine"`, 100, "d")}); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx, "u1", "task", false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := json.Marshal(list); err != nil || len(list) != 1 {
		t.Fatalf("list = %d entries, marshal %v", len(list), err)
	}
}

// TestQuoteJSONIsJSON: the quoting helper produces JSON, unlike %q.
func TestQuoteJSONIsJSON(t *testing.T) {
	for _, s := range []string{"plain", "x\u0007", "\x00", "a\"b\\c", "<&>", "é\U0001F600"} {
		v := json.RawMessage(QuoteJSON(s))
		var back string
		if err := json.Unmarshal(v, &back); err != nil || back != s {
			t.Errorf("%q -> %s -> %q, %v", s, v, back, err)
		}
	}
}
