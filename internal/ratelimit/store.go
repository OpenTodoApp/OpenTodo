// Package ratelimit keeps the server's rate limits and AI agent limits across
// restarts (OpenSpec change persistent-limits). Every check still reads and
// counts in memory, as before; the store only loads the windows that were
// open when the tenant last closed, and writes the windows that changed in
// the background, through the tenant's limits job (never a goroutine of its
// own) and once more when the tenant closes.
//
// A limiter whose counters the store keeps is a Part. Its keys (client
// addresses, account ids, token ids, email addresses) are stored as keyed
// hashes (Key), never as written.
package ratelimit

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// FlushEvery is how long a changed window waits in memory at most before the
// limits job writes it: what a crash, not a restart, can lose.
const FlushEvery = time.Second

// saltKey is the settings key of the store's hashing salt.
const saltKey = "ratelimit.salt"

// Row is one stored window of one key.
type Row struct {
	Key string
	// Start and Ends are Unix milliseconds: when the window began and when
	// the row can go (the end of the window, or of the last counted time).
	Start, Ends int64
	Count       int
	Refused     int
	// Hits are the counted times of a sliding window, Unix milliseconds.
	Hits []int64
}

// Part is a limiter whose state the store keeps.
type Part interface {
	// Restore hands the part its rows that were open when the store opened.
	Restore(rows []Row)
	// Flush returns the windows that changed since the last Flush: the rows
	// to write, and the keys whose window ended or was reset.
	Flush(now time.Time) (put []Row, gone []string)
}

// Store is one tenant's stored limits. A nil *Store keeps nothing: Key
// returns its argument and Register and Changed do nothing.
type Store struct {
	db   *sql.DB
	now  func() time.Time
	salt string
	wake func()

	mu     sync.Mutex
	loaded map[string][]Row
	parts  map[string]Part
	order  []string

	dirty     atomic.Bool
	lastFlush atomic.Int64
}

// Open reads the open windows and the hashing salt (created on first use).
// wake is called when a window changes while none was waiting (the tenant's
// jobs.Signal), so the limits job runs.
func Open(ctx context.Context, db *sql.DB, now func() time.Time, wake func()) (*Store, error) {
	if now == nil {
		now = time.Now
	}
	s := &Store{db: db, now: now, wake: wake, loaded: map[string][]Row{}, parts: map[string]Part{}}
	fresh, _ := json.Marshal(ids.Secret(32))
	if _, err := db.ExecContext(ctx, `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO NOTHING`,
		saltKey, string(fresh), now().UnixMilli()); err != nil {
		return nil, fmt.Errorf("limits salt: %w", err)
	}
	var raw string
	if err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, saltKey).Scan(&raw); err != nil {
		return nil, fmt.Errorf("limits salt: %w", err)
	}
	if json.Unmarshal([]byte(raw), &s.salt) != nil || s.salt == "" {
		return nil, fmt.Errorf("limits salt: malformed value")
	}
	rows, err := db.QueryContext(ctx, `SELECT limiter, key, start, ends, count, refused, hits FROM limit_windows WHERE ends > ?`, now().UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("load limits: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var name, hits string
		var r Row
		if err := rows.Scan(&name, &r.Key, &r.Start, &r.Ends, &r.Count, &r.Refused, &hits); err != nil {
			return nil, fmt.Errorf("load limits: %w", err)
		}
		r.Hits = parseHits(hits)
		s.loaded[name] = append(s.loaded[name], r)
	}
	return s, rows.Err()
}

// Key is the stored form of a limiter key: a hash keyed with this database's
// salt, so the table never holds an address or an email as written.
func (s *Store) Key(raw string) string {
	if s == nil {
		return raw
	}
	sum := sha256.Sum256([]byte(s.salt + "\x00" + raw))
	return hex.EncodeToString(sum[:16])
}

// Register makes the store keep p's windows under name, and restores the
// ones that were open. A name registered again replaces its part (a server
// built twice over one set of services in tests).
func (s *Store) Register(name string, p Part) {
	if s == nil {
		return
	}
	s.mu.Lock()
	rows := s.loaded[name]
	delete(s.loaded, name)
	if _, ok := s.parts[name]; !ok {
		s.order = append(s.order, name)
	}
	s.parts[name] = p
	s.mu.Unlock()
	if len(rows) > 0 {
		p.Restore(rows)
	}
}

// Changed records that a part's window changed; the first change after a
// flush wakes the limits job.
func (s *Store) Changed() {
	if s == nil {
		return
	}
	if s.dirty.CompareAndSwap(false, true) && s.wake != nil {
		s.wake()
	}
}

// Next is the limits job's due time: FlushEvery after the last flush while a
// window waits to be written, else the end of the oldest stored window.
func (s *Store) Next(ctx context.Context) (time.Time, bool, error) {
	if s == nil {
		return time.Time{}, false, nil
	}
	if s.dirty.Load() {
		return time.UnixMilli(s.lastFlush.Load()).Add(FlushEvery), true, nil
	}
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT MIN(ends) FROM limit_windows`).Scan(&at); err != nil {
		return time.Time{}, false, fmt.Errorf("next limits window: %w", err)
	}
	if !at.Valid {
		return time.Time{}, false, nil
	}
	return time.UnixMilli(at.Int64), true, nil
}

// Flush writes every changed window and removes the ended ones, in one
// transaction.
func (s *Store) Flush(ctx context.Context) error {
	if s == nil {
		return nil
	}
	now := s.now()
	s.lastFlush.Store(now.UnixMilli())
	s.dirty.Store(false)
	s.mu.Lock()
	type change struct {
		name string
		put  []Row
		gone []string
	}
	var changes []change
	for _, name := range s.order {
		put, gone := s.parts[name].Flush(now)
		if len(put)+len(gone) > 0 {
			changes = append(changes, change{name, put, gone})
		}
	}
	s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		s.dirty.Store(true)
		return fmt.Errorf("write limits: %w", err)
	}
	defer tx.Rollback()
	for _, c := range changes {
		for _, r := range c.put {
			if _, err := tx.ExecContext(ctx, `INSERT INTO limit_windows(limiter, key, start, ends, count, refused, hits) VALUES(?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(limiter, key) DO UPDATE SET start = excluded.start, ends = excluded.ends, count = excluded.count,
				refused = excluded.refused, hits = excluded.hits`, c.name, r.Key, r.Start, r.Ends, r.Count, r.Refused, formatHits(r.Hits)); err != nil {
				s.dirty.Store(true)
				return fmt.Errorf("write limits: %w", err)
			}
		}
		for _, k := range c.gone {
			if _, err := tx.ExecContext(ctx, `DELETE FROM limit_windows WHERE limiter = ? AND key = ?`, c.name, k); err != nil {
				s.dirty.Store(true)
				return fmt.Errorf("write limits: %w", err)
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM limit_windows WHERE ends <= ?`, now.UnixMilli()); err != nil {
		return fmt.Errorf("prune limits: %w", err)
	}
	return tx.Commit()
}

func formatHits(h []int64) string {
	var b strings.Builder
	for i, t := range h {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatInt(t, 10))
	}
	return b.String()
}

func parseHits(s string) []int64 {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]int64, 0, len(parts))
	for _, p := range parts {
		if v, err := strconv.ParseInt(p, 10, 64); err == nil {
			out = append(out, v)
		}
	}
	return out
}
