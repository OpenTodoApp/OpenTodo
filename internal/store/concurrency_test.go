package store

import (
	"context"
	"testing"
	"time"
)

// The reader pool reads while the writer holds a write transaction, and
// refuses writes (OpenSpec change database-concurrency).
func TestReaderReadsDuringWriteAndRefusesWrites(t *testing.T) {
	dir := t.TempDir()
	w, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	r, err := OpenReader(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if _, err := w.Exec(`INSERT INTO settings(key, value) VALUES('a', '1')`); err != nil {
		t.Fatal(err)
	}
	tx, err := w.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO settings(key, value) VALUES('b', '2')`); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var n int
	if err := r.QueryRowContext(ctx, `SELECT COUNT(*) FROM settings WHERE key IN ('a','b')`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("read during write = %d, %v; want the committed row only", n, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	// A read after the commit sees it.
	if err := r.QueryRowContext(ctx, `SELECT COUNT(*) FROM settings WHERE key IN ('a','b')`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("read after commit = %d, %v; want 2", n, err)
	}
	if _, err := r.Exec(`INSERT INTO settings(key, value) VALUES('c', '3')`); err == nil {
		t.Fatal("reader pool accepted a write")
	}
}

// Two writers on one file (a second process, such as a newer server during a
// rolling update): each write transaction takes the write lock when it begins,
// so the second waits instead of failing on a stale read snapshot.
func TestWriteTransactionsTakeTheLockUpFront(t *testing.T) {
	dir := t.TempDir()
	a, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := OpenFile(DBPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	txA, err := a.Begin()
	if err != nil {
		t.Fatal(err)
	}
	var n int
	if err := txA.QueryRow(`SELECT COUNT(*) FROM settings`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	errB := make(chan error, 1)
	go func() {
		txB, err := b.Begin()
		if err != nil {
			errB <- err
			return
		}
		defer txB.Rollback()
		var m int
		if err := txB.QueryRow(`SELECT COUNT(*) FROM settings`).Scan(&m); err != nil {
			errB <- err
			return
		}
		if _, err := txB.Exec(`INSERT INTO settings(key, value) VALUES(?, '1')`, "b"); err != nil {
			errB <- err
			return
		}
		errB <- txB.Commit()
	}()
	time.Sleep(200 * time.Millisecond)
	if _, err := txA.Exec(`INSERT INTO settings(key, value) VALUES('a', '1')`); err != nil {
		t.Fatalf("first writer: %v", err)
	}
	if err := txA.Commit(); err != nil {
		t.Fatalf("first writer: %v", err)
	}
	if err := <-errB; err != nil {
		t.Fatalf("second writer: %v", err)
	}
	if err := a.QueryRow(`SELECT COUNT(*) FROM settings WHERE key IN ('a','b')`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("rows = %d, %v; want both writes", n, err)
	}
}

func TestOptimizeRuns(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := Optimize(context.Background(), db); err != nil {
		t.Fatal(err)
	}
}
