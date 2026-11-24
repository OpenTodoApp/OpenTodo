package sync

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// OpenSpec change server-series-move (#1991): a strict write refuses to move a
// series onto a date that has a record of its lineage; the sync path does not.

// seriesWithRecord stores a weekly Sunday series "s" due 6 December and its
// record of 29 November in the given state (done, skipped or open: moved).
func seriesWithRecord(t *testing.T, s *Service, state string) {
	t.Helper()
	rec := OccurrenceID("s", "2026-11-29")
	completed, skipped := `5`, `false`
	switch state {
	case RecordOpen:
		completed = `null`
	case RecordSkipped:
		skipped = `true`
	}
	if res, err := s.Apply(context.Background(), "u1", []Op{
		op("s1", "task", "s", "title", `"Run"`, 100, "A"),
		op("s2", "task", "s", "recurrence", `"every sunday"`, 100, "A"),
		op("s3", "task", "s", "due", `{"date":"2026-12-06","time":"08:00"}`, 100, "A"),
		op("s4", "task", "s", "completed_at", `null`, 100, "A"),
		op("s5", "task", "s", "created_at", `1`, 100, "A"),
		op("r1", "task", rec, "series_id", `"s"`, 100, "A"),
		op("r2", "task", rec, "occurrence_date", `"2026-11-29"`, 100, "A"),
		op("r3", "task", rec, "due", `{"date":"2026-11-30"}`, 100, "A"),
		op("r4", "task", rec, "completed_at", completed, 100, "A"),
		op("r5", "task", rec, "skipped", skipped, 100, "A"),
	}); err != nil || len(res.Rejected) != 0 {
		t.Fatalf("seed = %+v, %v", res, err)
	}
}

func dueDateOf(t *testing.T, s *Service, id string) string {
	t.Helper()
	e, err := s.Get(context.Background(), "u1", "task", id)
	if err != nil {
		t.Fatal(err)
	}
	if d := decodeRecurringDue(e["due"]); d != nil {
		return d.Date
	}
	return ""
}

func TestStrictSeriesMoveOntoRecordRefused(t *testing.T) {
	for state, detail := range map[string]string{RecordDone: "2026-11-29 done", RecordSkipped: "2026-11-29 skipped", RecordOpen: "2026-11-29 moved"} {
		t.Run(state, func(t *testing.T) {
			s := newTestService(t)
			seriesWithRecord(t, s, state)
			_, err := s.ApplyStrict(context.Background(), "u1", []Op{
				op("m1", "task", "s", "due", `{"date":"2026-11-29","time":"08:00"}`, 200, "server"),
				op("m2", "task", "s", "title", `"Long run"`, 200, "server"),
			})
			var rej *RejectedError
			if !errors.As(err, &rej) || rej.Reason != ReasonSeriesDateTaken || rej.Detail != detail || rej.Op.Field != "due" {
				t.Fatalf("err = %v (%+v), want %s refused", err, rej, detail)
			}
			// Nothing of the batch was stored.
			e, _ := s.Get(context.Background(), "u1", "task", "s")
			if got := dueDateOf(t, s, "s"); got != "2026-12-06" || string(e["title"]) != `"Run"` {
				t.Fatalf("series = due %s title %s, want it unchanged", got, e["title"])
			}
		})
	}
}

func TestStrictSeriesMoveAccepted(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seriesWithRecord(t, s, RecordDone)
	// A free earlier date.
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("f1", "task", "s", "due", `{"date":"2026-11-22"}`, 200, "server")}); err != nil {
		t.Fatalf("free date: %v", err)
	}
	// Undo shape: the record is trashed in the same batch, so its date is free.
	rec := OccurrenceID("s", "2026-11-29")
	if _, err := s.ApplyStrict(ctx, "u1", []Op{
		op("u1", "task", "s", "due", `{"date":"2026-11-29"}`, 300, "server"),
		op("u2", "task", rec, "deleted_at", `300`, 300, "server"),
	}); err != nil {
		t.Fatalf("undo: %v", err)
	}
	if got := dueDateOf(t, s, "s"); got != "2026-11-29" {
		t.Fatalf("due = %s, want 29 November", got)
	}
}

func TestSyncApplyNeverRefusesSeriesMove(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seriesWithRecord(t, s, RecordDone)
	// A device replaying history: stored, the repair moves it on.
	res, err := s.Apply(ctx, "u1", []Op{op("d1", "task", "s", "due", `{"date":"2026-11-29"}`, 200, "B")})
	if err != nil || len(res.Rejected) != 0 || res.Applied != 1 {
		t.Fatalf("sync apply = %+v, %v", res, err)
	}
	// Strict writes that leave the date as it is (another field) are not refused,
	// although the series stands on its record until a device repairs it.
	if _, err := s.ApplyStrict(ctx, "u1", []Op{
		op("t1", "task", "s", "title", `"Run"`, 300, "server"),
		op("t2", "task", "s", "due", `{"date":"2026-11-29","time":"07:00"}`, 300, "server"),
	}); err != nil {
		t.Fatalf("same date: %v", err)
	}
}

func TestStrictSeriesMoveOntoEarlierPieceRecord(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	rec := OccurrenceID("s", "2026-10-12")
	if res, err := s.Apply(ctx, "u1", []Op{
		op("s1", "task", "s", "recurrence", `"every day until 2026-10-13"`, 100, "A"),
		op("s2", "task", "s", "due", `{"date":"2026-10-13"}`, 100, "A"),
		op("s3", "task", "s", "completed_at", `null`, 100, "A"),
		op("p1", "task", "a", "recurrence", `"every day"`, 100, "A"),
		op("p2", "task", "a", "due", `{"date":"2026-10-16"}`, 100, "A"),
		op("p3", "task", "a", "completed_at", `null`, 100, "A"),
		op("p4", "task", "a", "split_from", `{"series":"s","date":"2026-10-14"}`, 100, "A"),
		op("r1", "task", rec, "series_id", `"s"`, 100, "A"),
		op("r2", "task", rec, "occurrence_date", `"2026-10-12"`, 100, "A"),
		op("r3", "task", rec, "completed_at", `5`, 100, "A"),
		op("r4", "task", rec, "skipped", `true`, 100, "A"),
	}); err != nil || len(res.Rejected) != 0 {
		t.Fatalf("seed = %+v, %v", res, err)
	}
	_, err := s.ApplyStrict(ctx, "u1", []Op{op("m1", "task", "a", "due", `{"date":"2026-10-12"}`, 200, "server")})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonSeriesDateTaken || rej.Detail != "2026-10-12 skipped" {
		t.Fatalf("err = %v, want the root's skipped record", err)
	}
	if msg := SeriesDateMessage(rej); msg != "task.due: the occurrence of 2026-10-12 was skipped, so this recurring task cannot move there; choose another date" {
		t.Fatalf("message = %q", msg)
	}
}

func TestLineageIDsWalksOnlyTheSeriesChain(t *testing.T) {
	// s <- a <- b and s <- a2 are one lineage; x <- y is another.
	splits := map[string]string{"a": "s", "b": "a", "a2": "s", "y": "x"}
	for id, want := range map[string]string{"s": "a a2 b s", "b": "a a2 b s", "y": "x y", "lone": "lone"} {
		if got := strings.Join(lineageIDs(id, splits), " "); got != want {
			t.Errorf("lineageIDs(%s) = %q, want %q", id, got, want)
		}
	}
}

func TestStrictSeriesMoveFindsRecordTwoPiecesBack(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	rec, other := OccurrenceID("s", "2026-10-12"), OccurrenceID("x", "2026-10-11")
	if res, err := s.Apply(ctx, "u1", []Op{
		op("s1", "task", "s", "recurrence", `"every day until 2026-10-13"`, 100, "A"),
		op("s2", "task", "s", "due", `{"date":"2026-10-13"}`, 100, "A"),
		op("s3", "task", "s", "completed_at", `null`, 100, "A"),
		op("a1", "task", "a", "recurrence", `"every day until 2026-10-15"`, 100, "A"),
		op("a2", "task", "a", "due", `{"date":"2026-10-14"}`, 100, "A"),
		op("a3", "task", "a", "completed_at", `null`, 100, "A"),
		op("a4", "task", "a", "split_from", `{"series":"s","date":"2026-10-14"}`, 100, "A"),
		op("b1", "task", "b", "recurrence", `"every day"`, 100, "A"),
		op("b2", "task", "b", "due", `{"date":"2026-10-17"}`, 100, "A"),
		op("b3", "task", "b", "completed_at", `null`, 100, "A"),
		op("b4", "task", "b", "split_from", `{"series":"a","date":"2026-10-16"}`, 100, "A"),
		op("r1", "task", rec, "series_id", `"s"`, 100, "A"),
		op("r2", "task", rec, "occurrence_date", `"2026-10-12"`, 100, "A"),
		op("r3", "task", rec, "completed_at", `5`, 100, "A"),
		// An unrelated lineage in the same scope, with a record of the 11th.
		op("x1", "task", "x", "recurrence", `"every day"`, 100, "A"),
		op("x2", "task", "x", "due", `{"date":"2026-10-20"}`, 100, "A"),
		op("x3", "task", "x", "completed_at", `null`, 100, "A"),
		op("y1", "task", "y", "recurrence", `"every day"`, 100, "A"),
		op("y2", "task", "y", "due", `{"date":"2026-10-21"}`, 100, "A"),
		op("y3", "task", "y", "completed_at", `null`, 100, "A"),
		op("y4", "task", "y", "split_from", `{"series":"x","date":"2026-10-21"}`, 100, "A"),
		op("q1", "task", other, "series_id", `"x"`, 100, "A"),
		op("q2", "task", other, "occurrence_date", `"2026-10-11"`, 100, "A"),
		op("q3", "task", other, "completed_at", `5`, 100, "A"),
	}); err != nil || len(res.Rejected) != 0 {
		t.Fatalf("seed = %+v, %v", res, err)
	}
	var rej *RejectedError
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("m1", "task", "b", "due", `{"date":"2026-10-12"}`, 200, "server")}); !errors.As(err, &rej) || rej.Detail != "2026-10-12 done" {
		t.Fatalf("err = %v, want the root's done record found from the second piece", err)
	}
	// The other lineage's record does not take the date.
	if _, err := s.ApplyStrict(ctx, "u1", []Op{op("m2", "task", "b", "due", `{"date":"2026-10-11"}`, 200, "server")}); err != nil {
		t.Fatalf("another lineage's date refused: %v", err)
	}
}

func TestStrictSeriesMoveRefusesTheWholeBatch(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seriesWithRecord(t, s, RecordDone)
	if _, err := s.Apply(ctx, "u1", []Op{op("c1", "task", "call", "title", `"Call Ana"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	_, err := s.ApplyStrict(ctx, "u1", []Op{
		op("m1", "task", "call", "due", `{"date":"2026-11-29"}`, 200, "server"),
		op("m2", "task", "s", "due", `{"date":"2026-11-29"}`, 200, "server"),
		op("m3", "task", "new", "title", `"New"`, 200, "server"),
		op("m4", "task", "new", "created_at", `200`, 200, "server"),
	})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonSeriesDateTaken || rej.Op.EntityID != "s" {
		t.Fatalf("err = %v, want the series refused", err)
	}
	if got := dueDateOf(t, s, "call"); got != "" {
		t.Fatalf("Call Ana due = %q, want nothing written", got)
	}
	if e, _ := s.Get(ctx, "u1", "task", "new"); e != nil {
		t.Fatalf("new task = %v, want nothing written", e)
	}
}

func TestStrictSeriesMoveThatLosesIsNotRefused(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seriesWithRecord(t, s, RecordDone)
	// Older than the stored due: kept in the log, but the series keeps its date.
	res, err := s.ApplyStrict(ctx, "u1", []Op{op("old", "task", "s", "due", `{"date":"2026-11-29"}`, 50, "server")})
	if err != nil || res.Applied != 1 {
		t.Fatalf("losing op = %+v, %v", res, err)
	}
	if got := dueDateOf(t, s, "s"); got != "2026-12-06" {
		t.Fatalf("due = %s, want 6 December", got)
	}
}
