package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
)

// Checkpoints. In WAL mode a commit appends pages to the write-ahead log, and a
// checkpoint copies them back into the database file. SQLite's automatic
// checkpoint runs inside the commit that crosses wal_autocheckpoint pages
// (1000 by default), so that one write also pays for copying about 4 MB and
// syncing the database file: a push of 100 ops took about three times as long
// when it was the one. A server instead checkpoints from the reader pool in a
// background job (tenant.checkpointJob, CheckpointWAL), beside the writer, and
// the writer's own automatic checkpoint is only a backstop for a process that
// runs no such job (a maintenance command, a server that does not lead the
// jobs, a job that fell behind).

// AutoCheckpointPages is the writer's wal_autocheckpoint: about 40 MB of log
// with 4 KiB pages, well above what the checkpoint job leaves between runs.
const AutoCheckpointPages = 10000

// WALTruncateBytes is the log size above which CheckpointWAL also truncates
// the file. A checkpoint lets the writer start the log again from its
// beginning but keeps the file; after a large write (an import, a compaction)
// it would stay that large, or keep growing while readers never let a passive
// checkpoint finish.
const WALTruncateBytes int64 = 64 << 20

// CheckpointResult is what PRAGMA wal_checkpoint reports.
type CheckpointResult struct {
	// Busy: the checkpoint could not run, or not to the end (another
	// checkpoint was running, or a TRUNCATE waited for readers or the writer
	// longer than busy_timeout).
	Busy bool
	// Frames is the number of frames in the log, Copied how many of them are
	// in the database file now.
	Frames, Copied int64
	// Truncated: the log was over the limit and a TRUNCATE checkpoint ran.
	Truncated bool
}

// Complete reports whether every frame of the log is in the database file.
func (r CheckpointResult) Complete() bool { return !r.Busy && r.Copied >= r.Frames }

func checkpointMode(ctx context.Context, db *sql.DB, mode string) (CheckpointResult, error) {
	var r CheckpointResult
	var busy int
	if err := db.QueryRowContext(ctx, "PRAGMA wal_checkpoint("+mode+")").Scan(&busy, &r.Frames, &r.Copied); err != nil {
		return r, fmt.Errorf("checkpoint %s: %w", mode, err)
	}
	r.Busy = busy != 0
	return r, nil
}

// CheckpointWAL copies the write-ahead log of dataDir's database back into
// the file without waiting for readers or the writer (PASSIVE), from db, which
// may be the reader pool. When the log file is still larger than truncateOver
// bytes afterwards, it runs a TRUNCATE checkpoint, which waits up to
// busy_timeout for readers to leave the log and holds writers meanwhile, and
// leaves an empty log file.
func CheckpointWAL(ctx context.Context, db *sql.DB, dataDir string, truncateOver int64) (CheckpointResult, error) {
	r, err := checkpointMode(ctx, db, "PASSIVE")
	if err != nil {
		return r, err
	}
	st, err := os.Stat(DBPath(dataDir) + "-wal")
	if errors.Is(err, fs.ErrNotExist) {
		return r, nil
	}
	if err != nil {
		return r, fmt.Errorf("checkpoint: %w", err)
	}
	if st.Size() <= truncateOver {
		return r, nil
	}
	r, err = checkpointMode(ctx, db, "TRUNCATE")
	r.Truncated = err == nil
	return r, err
}
