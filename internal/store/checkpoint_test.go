package store

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// walSize is the size of dir's write-ahead log file (0 when there is none).
func walSize(t *testing.T, dir string) int64 {
	t.Helper()
	st, err := os.Stat(DBPath(dir) + "-wal")
	if os.IsNotExist(err) {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return st.Size()
}

// fill writes rows rows of about 4 KiB each in one transaction.
func fill(t *testing.T, db *sql.DB, rows int) {
	t.Helper()
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS filler (id INTEGER PRIMARY KEY, v TEXT)`); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	v := strings.Repeat("x", 4000)
	for range rows {
		if _, err := tx.ExecContext(ctx, `INSERT INTO filler (v) VALUES (?)`, v); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

func openPair(t *testing.T, dir string) (*sql.DB, *sql.DB) {
	t.Helper()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	reader, err := OpenReader(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { reader.Close() })
	return db, reader
}

// TestWriterAutoCheckpointIsTheBackstop: the writer's commits checkpoint only
// past AutoCheckpointPages, so a write of a few MB leaves its frames in the log.
func TestWriterAutoCheckpointIsTheBackstop(t *testing.T) {
	dir := t.TempDir()
	db, reader := openPair(t, dir)
	var pages int
	if err := db.QueryRow(`PRAGMA wal_autocheckpoint`).Scan(&pages); err != nil || pages != AutoCheckpointPages {
		t.Fatalf("wal_autocheckpoint %d %v, want %d", pages, err, AutoCheckpointPages)
	}
	fill(t, db, 1500) // about 6 MB, past SQLite's default of 1000 pages
	st, err := os.Stat(DBPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if st.Size() > 1<<20 {
		t.Fatalf("database file %d bytes: the writer checkpointed in its commit", st.Size())
	}
	res, err := CheckpointWAL(context.Background(), reader, dir, WALTruncateBytes)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Complete() || res.Frames < 1500 {
		t.Fatalf("checkpoint %+v", res)
	}
	if st, err = os.Stat(DBPath(dir)); err != nil {
		t.Fatal(err)
	}
	if st.Size() < 6<<20 {
		t.Fatalf("database file %d bytes after the checkpoint", st.Size())
	}
}

// TestCheckpointWALFromTheReaderPool: a passive checkpoint from the query-only
// pool copies every frame and keeps the file; over the limit the log is
// truncated.
func TestCheckpointWALFromTheReaderPool(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, reader := openPair(t, dir)
	fill(t, db, 300)
	size := walSize(t, dir)
	res, err := CheckpointWAL(ctx, reader, dir, WALTruncateBytes)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Complete() || res.Frames == 0 || res.Truncated {
		t.Fatalf("passive checkpoint %+v", res)
	}
	if got := walSize(t, dir); got != size {
		t.Fatalf("log %d bytes after a passive checkpoint, was %d", got, size)
	}
	res, err = CheckpointWAL(ctx, reader, dir, size-1)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Truncated || !res.Complete() {
		t.Fatalf("over the limit %+v", res)
	}
	if got := walSize(t, dir); got != 0 {
		t.Fatalf("log %d bytes after truncating", got)
	}
	// The writer goes on writing into the emptied log.
	fill(t, db, 10)
	var n int
	if err := reader.QueryRow(`SELECT COUNT(*) FROM filler`).Scan(&n); err != nil || n != 310 {
		t.Fatalf("rows %d %v", n, err)
	}
}

// TestCheckpointWALErrors: a closed pool or a cancelled context is an error,
// never a panic, and a missing log is nothing to do.
func TestCheckpointWALErrors(t *testing.T) {
	dir := t.TempDir()
	_, reader := openPair(t, dir)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CheckpointWAL(ctx, reader, dir, 0); err == nil {
		t.Fatal("cancelled context: no error")
	}
	reader.Close()
	if _, err := CheckpointWAL(context.Background(), reader, dir, 0); err == nil {
		t.Fatal("closed pool: no error")
	}
}

// TestCrashWithFramesInTheLogRecovers: committed writes still only in the log
// (no checkpoint ran) are in the database when it is opened again after the
// process died, here a copy of the files taken while the writer was open.
func TestCrashWithFramesInTheLogRecovers(t *testing.T) {
	dir := t.TempDir()
	db, _ := openPair(t, dir)
	fill(t, db, 200)
	crashed := t.TempDir()
	for _, name := range []string{DBFile, DBFile + "-wal"} {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(crashed, name), b, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if walSize(t, crashed) == 0 {
		t.Fatal("nothing in the log to recover")
	}
	again, err := Open(crashed)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	var n int
	if err := again.QueryRow(`SELECT COUNT(*) FROM filler`).Scan(&n); err != nil || n != 200 {
		t.Fatalf("recovered %d rows, %v", n, err)
	}
	var check string
	if err := again.QueryRow(`PRAGMA quick_check`).Scan(&check); err != nil || check != "ok" {
		t.Fatalf("quick_check %q %v", check, err)
	}
}
