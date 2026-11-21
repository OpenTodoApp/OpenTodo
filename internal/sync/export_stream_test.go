package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

// TestEachExportPageBounded: the export's paging reads at most MaxListIDs
// entities at a time, in the same order and with the same records as List, so a
// large account's export never holds the whole collection (the memory that made
// the export peak at hundreds of MB). A change that reverts to one big read, or
// that reorders or drops entities, fails here.
func TestEachExportPageBounded(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := storetest.OpenDir(dir)
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

	// More than one page of tasks, positioned in reverse of their id so the order
	// is the sorted one, not the insertion one; every seventh is a tombstone.
	const n = MaxListIDs + 500
	var ops []Op
	flush := func() {
		if len(ops) == 0 {
			return
		}
		if _, err := s.ApplyStrict(ctx, "u1", ops); err != nil {
			t.Fatal(err)
		}
		ops = ops[:0]
	}
	for i := 0; i < n; i++ {
		id := fmt.Sprintf("t%05d", i)
		ops = append(ops,
			op(id+"-ti", "task", id, "title", fmt.Sprintf("%q", fmt.Sprintf("Task %d", i)), int64(1000+i), "A"),
			op(id+"-po", "task", id, "position", fmt.Sprint(n-i), int64(1000+i), "A"),
			op(id+"-cr", "task", id, "created_at", "1", int64(1000+i), "A"),
		)
		if i%7 == 0 {
			ops = append(ops, op(id+"-de", "task", id, "deleted_at", "5", int64(1000+i), "A"))
		}
		if len(ops) >= 300 {
			flush()
		}
	}
	flush()

	want, err := s.List(ctx, "u1", "task", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(want) != n {
		t.Fatalf("seeded %d tasks, List returned %d (deleted included)", n, len(want))
	}

	var got []Entity
	pages := 0
	if err := s.EachExportPage(ctx, "u1", "task", func(page []Entity) error {
		pages++
		if len(page) > MaxListIDs {
			t.Fatalf("page %d has %d entities, over the %d cap", pages, len(page), MaxListIDs)
		}
		got = append(got, page...)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if pages < 2 {
		t.Fatalf("%d tasks came back in %d page(s): paging is not bounded", n, pages)
	}
	if len(got) != len(want) {
		t.Fatalf("paged %d entities, List has %d", len(got), len(want))
	}
	for i := range want {
		wi, _ := json.Marshal(want[i])
		gi, _ := json.Marshal(got[i])
		if !bytes.Equal(wi, gi) {
			t.Fatalf("entity %d differs:\n List: %s\npaged: %s", i, wi, gi)
		}
	}
}
