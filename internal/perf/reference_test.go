//go:build perf

package perf

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// reference is a fixed piece of work of the same kind as the server's budgets:
// SQLite reads through the same pure-Go driver, rows built into Go values, sorted
// and encoded as JSON. Its time on a runner says how fast that runner is for this
// kind of work, so the server's time limits are scaled by it (D2). It never changes
// with the app's code: the rows, the query and the encoding are its own.
type reference struct {
	db *sql.DB
}

const (
	referenceRows     = 20_000
	referenceProjects = 10
	referenceRounds   = 15
)

// newReference writes the reference table once, in its own database under dir.
func newReference(t testing.TB, dir string) *reference {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.Join(dir, "reference.db")+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	exec := func(q string, args ...any) {
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`CREATE TABLE rows (id TEXT PRIMARY KEY, project TEXT NOT NULL, pos INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL)`)
	exec(`CREATE INDEX rows_project ON rows (project, pos)`)
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	body := strings.Repeat("a reference body of a fixed length ", 6)
	for i := range referenceRows {
		if _, err := tx.Exec(`INSERT INTO rows VALUES (?, ?, ?, ?, ?)`,
			fmt.Sprintf("row-%06d", i), fmt.Sprintf("project-%02d", i%referenceProjects), referenceRows-i, fmt.Sprintf("Row %d", i), body); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return &reference{db: db}
}

// measure times one round of the work referenceRounds times and answers the median, in ms.
func (r *reference) measure(t testing.TB) float64 {
	t.Helper()
	type row struct {
		ID    string          `json:"id"`
		Pos   int             `json:"pos"`
		Title string          `json:"title"`
		Body  json.RawMessage `json:"body"`
	}
	times := make([]float64, 0, referenceRounds)
	for i := range referenceRounds {
		start := time.Now()
		rows, err := r.db.Query(`SELECT id, pos, title, body FROM rows WHERE project = ? ORDER BY pos`, fmt.Sprintf("project-%02d", i%referenceProjects))
		if err != nil {
			t.Fatal(err)
		}
		var list []row
		for rows.Next() {
			var x row
			var body string
			if err := rows.Scan(&x.ID, &x.Pos, &x.Title, &body); err != nil {
				t.Fatal(err)
			}
			b, _ := json.Marshal(body)
			x.Body = b
			list = append(list, x)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		_ = rows.Close()
		sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
		if _, err := json.Marshal(map[string]any{"rows": list}); err != nil {
			t.Fatal(err)
		}
		if len(list) != referenceRows/referenceProjects {
			t.Fatalf("the reference read %d rows", len(list))
		}
		times = append(times, ms(time.Since(start)))
	}
	return median(times)
}
