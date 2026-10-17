package sync

import (
	"context"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

// List, Get and Pull read from the reader pool, so they answer while a slow
// write holds the writer (OpenSpec change database-concurrency).
func TestReadsDoNotWaitForWrites(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	rdb, err := store.OpenReader(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { rdb.Close() })
	s := NewService(db)
	s.SetReader(rdb)
	if _, err := s.Apply(ctx, "u1", []Op{op("a1", "task", "t1", "title", `"milk"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	// A long write transaction holds the only writer connection.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key, value) VALUES('slow', '1')`); err != nil {
		t.Fatal(err)
	}
	rctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if list, err := s.List(rctx, "u1", "task", false); err != nil || len(list) != 1 {
		t.Fatalf("List during a write = %v, %v", list, err)
	}
	if e, err := s.Get(rctx, "u1", "task", "t1"); err != nil || e == nil {
		t.Fatalf("Get during a write = %v, %v", e, err)
	}
	if res, err := s.PullWith(rctx, "u1", 0, "B", 0, PullOptions{}); err != nil || len(res.Ops) != 1 {
		t.Fatalf("Pull during a write = %+v, %v", res, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	// A read after the caller's own write sees it.
	if _, err := s.Apply(ctx, "u1", []Op{op("a2", "task", "t2", "title", `"eggs"`, 200, "A")}); err != nil {
		t.Fatal(err)
	}
	if list, err := s.List(ctx, "u1", "task", false); err != nil || len(list) != 2 {
		t.Fatalf("List after own write = %v, %v", list, err)
	}
}
