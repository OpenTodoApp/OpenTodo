package backup

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"

	"github.com/pixari/opentodo/internal/store"
)

// restoreMargin is kept free on top of what a restore needs.
const restoreMargin = 64 << 20

// ErrInsufficientStorage means the data directory's filesystem cannot hold a
// restore (archive + extracted database + safety copy).
var ErrInsufficientStorage = errors.New("not enough free disk space for a restore")

// ensureFreeSpace fails when fewer than need + restoreMargin bytes are free on
// dataDir's filesystem. Where free space is unknown it never fails.
func ensureFreeSpace(dataDir string, need int64) error {
	return ensureFreeSpaceWith(freeBytes, dataDir, need)
}

func ensureFreeSpaceWith(freeFn func(string) (int64, bool), dataDir string, need int64) error {
	free, ok := freeFn(dataDir)
	if !ok || free >= need+restoreMargin {
		return nil
	}
	return fmt.Errorf("%w: %s needed, %s free", ErrInsufficientStorage, humanBytes(need+restoreMargin), humanBytes(free))
}

// uploadCap is the largest archive the data directory can take for a restore:
// free space minus twice the current database and the margin. -1 means no cap.
func uploadCap(freeFn func(string) (int64, bool), dataDir string) int64 {
	free, ok := freeFn(dataDir)
	if !ok {
		return -1
	}
	c := free - 2*fileSize(store.DBPath(dataDir)) - restoreMargin
	if c < 0 {
		return 0
	}
	return c
}

func humanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGTPE"[exp])
}

// Counts summarise what a restore brings back.
type Counts struct {
	Accounts int64 `json:"accounts"`
	Projects int64 `json:"projects"`
	Tasks    int64 `json:"tasks"`
	Ops      int64 `json:"ops"`
}

// Preview counts the accounts, live projects, live tasks and operations in a
// staged database. It opens the file read-only and runs no migration: the
// counts come from tables every schema has (users, ops, and the materialized
// fields, called scope_fields since project sharing).
func Preview(st Staged) (Counts, error) {
	return countDB(st.DBPath())
}

func countDB(path string) (Counts, error) {
	var c Counts
	if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
		return c, err
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return c, err
	}
	defer db.Close()
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&c.Accounts); err != nil {
		return c, fmt.Errorf("count accounts: %w", err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&c.Ops); err != nil {
		return c, fmt.Errorf("count operations: %w", err)
	}
	table := "fields"
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'scope_fields'`).Scan(&n); err == nil && n > 0 {
		table = "scope_fields"
	}
	// An entity is live when it has no deleted_at, or deleted_at is null.
	live := func(entity string) (int64, error) {
		var v int64
		err := db.QueryRow(`SELECT COUNT(DISTINCT f.entity_id) FROM `+table+` f
			WHERE f.entity = ? AND NOT EXISTS (
			  SELECT 1 FROM `+table+` d WHERE d.entity = f.entity AND d.entity_id = f.entity_id
			    AND d.field = 'deleted_at' AND d.value NOT IN ('null', ''))`, entity).Scan(&v)
		return v, err
	}
	if c.Projects, err = live("project"); err != nil {
		return c, fmt.Errorf("count projects: %w", err)
	}
	if c.Tasks, err = live("task"); err != nil {
		return c, fmt.Errorf("count tasks: %w", err)
	}
	return c, nil
}
