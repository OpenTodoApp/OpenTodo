// Package deliveryq is the machinery shared by the two durable outbound queues
// in SQLite, webhook deliveries (internal/webhook) and notification channel
// messages (internal/channels): the parallel pass over due rows, pruning the
// log, and the "next due" times of the tenant's "webhooks" job. Each
// queue keeps its payloads, its send and the recording of an attempt's
// outcome; the retry schedule is webhook.Backoff for both.
package deliveryq

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

// Queue tuning shared by both queues (webhooks design D2).
const (
	// Concurrency is how many items one worker pass sends in parallel.
	Concurrency = 4
	// AutoDisableAfter consecutive failed items disable their target.
	AutoDisableAfter = 20
	// Retry is the pause before the "webhooks" job runs again when deliveries
	// are still due after a run (a backlog larger than one run sends).
	Retry = time.Second
	// Batches bounds the passes of one run per queue (Batches x Concurrency items).
	Batches = 64
	// LogRetention bounds the log by age (Table.LogLimit by count).
	LogRetention = 30 * 24 * time.Hour
)

// Table names one queue's tables. The names are constants of the queue's
// package, never input, so building SQL from them opens no injection surface.
type Table struct {
	// Items is the queue and log table (webhook_deliveries); Targets the table
	// of what items are sent to (webhooks), joined on Items.TargetCol = Targets.id.
	Items, Targets, TargetCol string
	// Finished are the statuses that may be pruned beyond the newest LogLimit per target.
	Finished string
	// LogLimit is how many finished items the log keeps per target.
	LogLimit int
	// Noun and Nouns name an item in errors ("delivery", "deliveries").
	Noun, Nouns string
}

// Drain runs process (one pass that sends due items and reports how many)
// until nothing was sent, at most Batches times, or ctx ends.
func Drain(ctx context.Context, process func(context.Context) int) {
	for i := 0; i < Batches && ctx.Err() == nil && process(ctx) > 0; i++ {
	}
}

// Fanout runs send for every item of batch in parallel and waits for all.
// Sends must not be cut short by shutdown: an interrupted attempt would be
// recorded as a failure, so they run on ctx without its cancellation and each
// is bounded by its own timeout instead.
func Fanout[T any](ctx context.Context, batch []T, send func(context.Context, T)) {
	sendCtx := context.WithoutCancel(ctx)
	var wg sync.WaitGroup
	for _, item := range batch {
		wg.Add(1)
		go func() {
			defer wg.Done()
			send(sendCtx, item)
		}()
	}
	wg.Wait()
}

// Prune drops log entries older than LogRetention and finished entries beyond
// the newest LogLimit per target. Queued items younger than the retention
// window are never dropped.
func Prune(ctx context.Context, db *sql.DB, t Table, now time.Time) error {
	cutoff := now.Add(-LogRetention).UnixMilli()
	if _, err := db.ExecContext(ctx, `DELETE FROM `+t.Items+` WHERE created_at < ?`, cutoff); err != nil {
		return fmt.Errorf("prune old %s: %w", t.Nouns, err)
	}
	_, err := db.ExecContext(ctx, `DELETE FROM `+t.Items+` WHERE id IN (
		SELECT id FROM (
			SELECT id, status, ROW_NUMBER() OVER (PARTITION BY `+t.TargetCol+` ORDER BY created_at DESC, rowid DESC) AS rn
			FROM `+t.Items+`
		) WHERE rn > ? AND status IN (`+t.Finished+`))`, t.LogLimit)
	if err != nil {
		return fmt.Errorf("prune %s log: %w", t.Noun, err)
	}
	return nil
}

// NextDue is the earliest queued item of an enabled target; ok is false when
// nothing is queued (a host's "next due" index, OpenSpec multi-tenant-host).
func NextDue(ctx context.Context, db *sql.DB, t Table) (time.Time, bool, error) {
	var at sql.NullInt64
	err := db.QueryRowContext(ctx, `SELECT MIN(d.next_attempt_at) FROM `+t.Items+` d JOIN `+t.Targets+` c ON c.id = d.`+t.TargetCol+`
		WHERE d.status IN ('pending','retry') AND c.enabled = 1`).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}

// NextPrune is when the oldest item leaves the log (LogRetention).
func NextPrune(ctx context.Context, db *sql.DB, t Table) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := db.QueryRowContext(ctx, `SELECT MIN(created_at) FROM `+t.Items).Scan(&at); err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64).Add(LogRetention), true, nil
}
