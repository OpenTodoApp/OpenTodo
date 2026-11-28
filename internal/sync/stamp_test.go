package sync

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
	"testing"
	"time"
)

// Tests of OpenSpec change e2ee-rollback (design D2, D3): the server's side of
// the v2 stamp rule. The server never decrypts, so the envelopes here carry a
// stamp and filler bytes only.

func envV2(stamp int64) string {
	body := binary.BigEndian.AppendUint64(nil, uint64(stamp))
	body = append(body, []byte(strings.Repeat("n", 12+16+4))...)
	return `"enc:v2:` + base64.RawURLEncoding.EncodeToString(body) + `"`
}

func storedTS(t *testing.T, s *Service, entity, id, field string) int64 {
	t.Helper()
	var ts int64
	if err := s.db.QueryRow(`SELECT ts FROM scope_fields WHERE entity = ? AND entity_id = ? AND field = ?`, entity, id, field).Scan(&ts); err != nil {
		t.Fatal(err)
	}
	return ts
}

// A device's v2 op must carry its stamp as timestamp: one sealed for another
// time is the replay devices refuse, so the server does not store it.
func TestV2StampMustEqualTS(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	_, err := s.Apply(ctx, "u", []Op{op("a", "task", "t1", "title", envV2(1000), 2000, "A")})
	if !errors.Is(err, ErrInvalidOp) || !strings.Contains(err.Error(), "stamp_mismatch") {
		t.Fatalf("mismatch: %v", err)
	}
	if res, err := s.Apply(ctx, "u", []Op{op("b", "task", "t1", "title", envV2(2000), 2000, "A")}); err != nil || res.Applied != 1 {
		t.Fatalf("matching: %+v %v", res, err)
	}
	// A client that handles refusals per op gets the bad op refused alone.
	valid, refused, _ := SplitInvalid([]Op{
		op("c", "task", "t1", "title", envV2(1000), 3000, "A"),
		op("d", "task", "t1", "priority", `2`, 3000, "A"),
	})
	if len(valid) != 1 || len(refused) != 1 || refused[0].ID != "c" || refused[0].Reason != ReasonInvalid {
		t.Fatalf("split = %v %v", valid, refused)
	}
	// A malformed v2 envelope (stamp 0) is refused too.
	if _, err := s.Apply(ctx, "u", []Op{op("e", "task", "t1", "title", envV2(0), 1, "A")}); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("stamp 0: %v", err)
	}
	// Text that only starts like a v2 envelope is a title, applied at its own
	// timestamp on every path.
	typed := `"enc:v2: release notes"`
	if res, err := s.Apply(ctx, "u", []Op{op("t", "task", "t3", "title", typed, 7, "A")}); err != nil || res.Applied != 1 {
		t.Fatalf("typed title: %+v %v", res, err)
	}
	if _, err := s.ApplyStrict(ctx, "u", []Op{op("t2", "task", "t3", "description", typed, 9, "server")}); err != nil {
		t.Fatalf("typed description: %v", err)
	}
	if ts := storedTS(t, s, "task", "t3", "description"); ts != 9 {
		t.Fatalf("typed description ts = %d", ts)
	}
	// Only content fields follow the rule; a v1 value or plaintext is as before.
	if _, err := s.Apply(ctx, "u", []Op{op("f", "task", "t2", "title", `"enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`, 5, "A")}); err != nil {
		t.Fatalf("v1: %v", err)
	}
}

// A v2 op stamped far ahead is refused, never clamped, even for a client that
// did not announce clock_skew: a moved timestamp no longer matches its stamp.
func TestV2NeverClamped(t *testing.T) {
	s := newTestService(t)
	fixed := time.UnixMilli(10_000_000)
	s.now = func() time.Time { return fixed }
	far := fixed.UnixMilli() + MaxFutureSkewMs + 1
	res, err := s.Apply(context.Background(), "u", []Op{
		op("v2", "task", "t1", "title", envV2(far), far, "A"),
		op("plain", "task", "t1", "description", `"clamped as before"`, far, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 1 || len(res.Rejected) != 1 || res.Rejected[0].ID != "v2" || res.Rejected[0].Reason != ReasonClockSkew {
		t.Fatalf("res = %+v", res)
	}
	if ts := storedTS(t, s, "task", "t1", "description"); ts != fixed.UnixMilli()+MaxFutureSkewMs {
		t.Fatalf("plaintext ts = %d", ts)
	}
}

// Server-side writes (REST, MCP, relay answers) take the stamp as timestamp,
// and refuse one that would not win: the server cannot write an older
// ciphertext again as a new op, the rollback this change prevents.
func TestCiphertextStampIsTimestamp(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.ApplyStrict(ctx, "u", []Op{
		op("w1", "task", "t1", "title", envV2(300), 900, "server"),
		op("w2", "task", "t1", "priority", `2`, 900, "server"),
	}); err != nil {
		t.Fatal(err)
	}
	if ts := storedTS(t, s, "task", "t1", "title"); ts != 300 {
		t.Fatalf("title ts = %d, want the stamp", ts)
	}
	if ts := storedTS(t, s, "task", "t1", "priority"); ts != 900 {
		t.Fatalf("priority ts = %d, want the server's", ts)
	}
	// The old value written again under a new timestamp: refused as stale.
	_, err := s.ApplyStrict(ctx, "u", []Op{op("w3", "task", "t1", "title", envV2(300), 5000, "server")})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonStaleCiphertext || rej.Detail != "300" {
		t.Fatalf("replay: %v", err)
	}
	// So is an older stamp; nothing of the batch is stored.
	_, err = s.ApplyStrict(ctx, "u", []Op{
		op("w4", "task", "t1", "priority", `3`, 6000, "server"),
		op("w5", "task", "t1", "title", envV2(200), 6000, "server"),
	})
	if !errors.As(err, &rej) || rej.Reason != ReasonStaleCiphertext {
		t.Fatalf("older: %v", err)
	}
	if e, _ := s.Get(ctx, "u", "task", "t1"); string(e["priority"]) != "2" {
		t.Fatalf("strict batch partly applied: %s", e["priority"])
	}
	// A later stamp wins and is stored at it.
	if _, err := s.ApplyStrict(ctx, "u", []Op{op("w6", "task", "t1", "title", envV2(400), 7000, "server")}); err != nil {
		t.Fatal(err)
	}
	if ts := storedTS(t, s, "task", "t1", "title"); ts != 400 {
		t.Fatalf("title ts = %d", ts)
	}
}

// Imports pass on values clients sealed: with WithStampTimestamps a v2 value
// keeps its stamp as timestamp, and one that would not win is refused alone.
func TestImportV2Stamp(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u", []Op{op("a", "task", "t1", "title", envV2(500), 500, "A")}); err != nil {
		t.Fatal(err)
	}
	ictx := WithStampTimestamps(ctx)
	res, err := s.Apply(ictx, "u", []Op{
		op("i1", "task", "t1", "title", envV2(400), 9000, "import"),
		op("i2", "task", "t2", "title", envV2(450), 9000, "import"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Applied != 1 || len(res.Rejected) != 1 || res.Rejected[0].ID != "i1" || res.Rejected[0].Reason != ReasonStaleCiphertext {
		t.Fatalf("res = %+v", res)
	}
	if ts := storedTS(t, s, "task", "t2", "title"); ts != 450 {
		t.Fatalf("t2 ts = %d", ts)
	}
	if e, _ := s.Get(ctx, "u", "task", "t1"); string(e["title"]) != envV2(500) {
		t.Fatalf("t1 title = %s", e["title"])
	}
}
