package store

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

// TestNewDatabaseIsIncremental: a database created by this version is in
// incremental vacuum mode from its first table on (op-log-compaction, task 1.1).
func TestNewDatabaseIsIncremental(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if mode, err := AutoVacuumMode(ctx, db); err != nil || mode != AutoVacuumIncremental {
		t.Fatalf("mode = %d, %v; want incremental", mode, err)
	}
	st, err := Stats(ctx, db, dir)
	if err != nil {
		t.Fatal(err)
	}
	if st.AutoVacuum != AutoVacuumIncremental || st.PageCount == 0 || st.PageSize == 0 || st.Bytes() != st.PageCount*st.PageSize {
		t.Fatalf("stats = %+v", st)
	}
}

// TestConvertIncrementalKeepsData: a database created in the old mode reports
// none, converts once, reports incremental with its rows intact, and then
// returns freed pages to the file system in steps.
func TestConvertIncrementalKeepsData(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := OpenFile(DBPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// The old mode: tables exist before anyone set auto_vacuum.
	if _, err := db.ExecContext(ctx, `CREATE TABLE early(x)`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if mode, _ := AutoVacuumMode(ctx, db); mode != AutoVacuumNone {
		t.Fatalf("old database mode = %d, want none", mode)
	}
	big := strings.Repeat("x", 4000)
	for i := 0; i < 300; i++ {
		if _, err := db.ExecContext(ctx, `INSERT INTO early(x) VALUES(?)`, fmt.Sprintf("%d %s", i, big)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM early WHERE rowid > 100`); err != nil {
		t.Fatal(err)
	}
	// Without the conversion the freed pages stay inside the file.
	before, _ := Stats(ctx, db, dir)
	if free, err := IncrementalVacuum(ctx, db, 2000); err != nil || free == 0 || free != before.FreePages {
		t.Fatalf("vacuum in mode none: free %d (was %d), %v", free, before.FreePages, err)
	}
	if err := ConvertIncremental(ctx, db); err != nil {
		t.Fatal(err)
	}
	if mode, _ := AutoVacuumMode(ctx, db); mode != AutoVacuumIncremental {
		t.Fatalf("converted mode = %d", mode)
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM early`).Scan(&n); err != nil || n != 100 {
		t.Fatalf("rows after conversion = %d, %v", n, err)
	}
	// Now deletions can be reclaimed in small steps.
	if _, err := db.ExecContext(ctx, `DELETE FROM early`); err != nil {
		t.Fatal(err)
	}
	mid, _ := Stats(ctx, db, dir)
	if mid.FreePages < 10 {
		t.Fatalf("free pages after delete = %d", mid.FreePages)
	}
	free, err := IncrementalVacuum(ctx, db, 5)
	if err != nil || free != mid.FreePages-5 {
		t.Fatalf("one step: free %d, want %d (%v)", free, mid.FreePages-5, err)
	}
	if free, err = IncrementalVacuum(ctx, db, 100000); err != nil || free != 0 {
		t.Fatalf("all: free %d, %v", free, err)
	}
	after, _ := Stats(ctx, db, dir)
	if after.PageCount >= mid.PageCount {
		t.Fatalf("file did not shrink: %d -> %d pages", mid.PageCount, after.PageCount)
	}
	if err := Checkpoint(ctx, db); err != nil {
		t.Fatal(err)
	}
}

func TestFreeSpace(t *testing.T) {
	free, ok, err := FreeSpace(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if ok && free == 0 {
		t.Fatal("no free space reported on a writable temp dir")
	}
	if _, ok, err := FreeSpace(filepath.Join(t.TempDir(), "missing")); ok && err == nil {
		t.Fatal("missing directory reported no error")
	}
}
