package webhook

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/deliveryq"
	"github.com/OpenTodoApp/opentodo/internal/outbound"
)

// Queue tuning from the design (D2); the shared values live in deliveryq.
const (
	// Concurrency is how many deliveries one worker pass sends in parallel.
	Concurrency = deliveryq.Concurrency
	// MaxAttempts is the first attempt plus one retry per RetrySchedule entry.
	MaxAttempts = 1 + 6
	// AutoDisableAfter consecutive failed deliveries disables a webhook.
	AutoDisableAfter = deliveryq.AutoDisableAfter
	// LogRetention bounds the delivery log (LogLimit bounds it per webhook).
	LogRetention = deliveryq.LogRetention
)

// table is the delivery queue and log (deliveryq).
var table = deliveryq.Table{Items: "webhook_deliveries", Targets: "webhooks", TargetCol: "webhook_id",
	Finished: "'delivered','failed'", LogLimit: LogLimit, Noun: "delivery", Nouns: "deliveries"}

// RetrySchedule is the nominal wait after the n-th failed attempt (about 27 h in
// total). Each wait is jittered by ±20 %.
var RetrySchedule = []time.Duration{
	30 * time.Second, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour, 8 * time.Hour, 16 * time.Hour,
}

// Backoff returns the jittered wait after `failed` attempts (1-based) given a
// random value r in [0,1). ok is false when no retry remains.
func Backoff(failed int, r float64) (time.Duration, bool) {
	if failed < 1 || failed > len(RetrySchedule) || failed >= MaxAttempts {
		return 0, false
	}
	base := RetrySchedule[failed-1]
	factor := 0.8 + 0.4*r
	return time.Duration(float64(base) * factor), true
}

func defaultResolver() Resolver { return net.DefaultResolver }

// SetWake installs what Wake calls: the tenant's jobs signal (internal/jobs).
// Call it before the service is used.
func (s *Service) SetWake(fn func()) { s.wake = fn }

// Wake reports that deliveries may be due now, so the "webhooks" job runs at
// once instead of at its next check.
func (s *Service) Wake() {
	if s.wake != nil {
		s.wake()
	}
}

type queued struct {
	id, webhookID, event string
	payload              []byte
	attempts             int
	url, secret          string
}

type result struct {
	ok       bool
	code     int
	errMsg   string
	excerpt  string
	duration time.Duration
	terminal bool // do not retry (target refused by policy)
}

// ProcessDue sends up to Concurrency due deliveries in parallel, records the
// outcomes and returns how many it handled. Deliveries of disabled webhooks
// stay queued until the webhook is enabled again.
func (s *Service) ProcessDue(ctx context.Context) int {
	rows, err := s.db.QueryContext(ctx, `SELECT d.id, d.webhook_id, d.event, d.payload, d.attempts, w.url, w.secret
		FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
		WHERE d.status IN ('pending','retry') AND d.next_attempt_at <= ? AND w.enabled = 1
		ORDER BY d.next_attempt_at, d.created_at LIMIT ?`, s.nowMs(), Concurrency)
	if err != nil {
		if ctx.Err() == nil {
			s.log.Error("webhooks: poll failed", "err", err)
		}
		return 0
	}
	var batch []queued
	for rows.Next() {
		var q queued
		var payload string
		if err := rows.Scan(&q.id, &q.webhookID, &q.event, &payload, &q.attempts, &q.url, &q.secret); err != nil {
			rows.Close()
			s.log.Error("webhooks: scan failed", "err", err)
			return 0
		}
		q.payload = []byte(payload)
		batch = append(batch, q)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		s.log.Error("webhooks: poll failed", "err", err)
		return 0
	}
	if len(batch) == 0 {
		return 0
	}
	// Each send is bounded by DeliveryTimeout, not by shutdown.
	deliveryq.Fanout(ctx, batch, func(ctx context.Context, q queued) {
		res := s.send(ctx, q)
		if err := s.record(ctx, q, res, false); err != nil {
			s.log.Error("webhooks: record failed", "delivery", q.id, "err", err)
		}
	})
	return len(batch)
}

// send performs one HTTP attempt. Timestamp and signature are fresh each time.
func (s *Service) send(ctx context.Context, q queued) result {
	ctx, cancel := context.WithTimeout(ctx, DeliveryTimeout)
	defer cancel()
	if _, err := ValidateURL(q.url); err != nil {
		return result{errMsg: "invalid_url", terminal: true}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, q.url, bytes.NewReader(q.payload))
	if err != nil {
		return result{errMsg: "invalid_url", terminal: true}
	}
	SetHeaders(req.Header, s.version, q.event, q.id, q.webhookID, q.secret, s.now().Unix(), q.payload)
	start := time.Now()
	resp, err := s.client.Do(req)
	elapsed := time.Since(start)
	if err != nil {
		switch {
		case errors.Is(err, ErrPrivateTarget):
			return result{errMsg: "private_target", duration: elapsed, terminal: true}
		case errors.Is(err, context.DeadlineExceeded) || outbound.IsTimeout(err):
			return result{errMsg: "timeout", duration: elapsed}
		default:
			return result{errMsg: "connection failed: " + outbound.RootCause(err), duration: elapsed}
		}
	}
	defer resp.Body.Close()
	res := result{code: resp.StatusCode, excerpt: readExcerpt(resp.Body), duration: elapsed}
	res.ok = resp.StatusCode >= 200 && resp.StatusCode < 300
	if !res.ok {
		res.errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return res
}

// record stores an attempt's outcome, schedules a retry or finalises the
// delivery, and maintains the webhook's consecutive-failure counter. once marks
// a ping: it is never retried and never counts toward auto-disable.
func (s *Service) record(ctx context.Context, q queued, res result, once bool) error {
	now := s.nowMs()
	attempts := q.attempts + 1
	var code, excerpt any
	if res.code != 0 {
		code = res.code
		excerpt = res.excerpt
	}
	var errMsg any
	if res.errMsg != "" {
		errMsg = res.errMsg
	}
	dur := res.duration.Milliseconds()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	countable := !once && q.event != EventPing
	switch {
	case res.ok:
		_, err = tx.ExecContext(ctx, `UPDATE webhook_deliveries SET status='delivered', attempts=?, next_attempt_at=NULL, last_status_code=?, last_error=NULL,
			response_excerpt=?, duration_ms=?, delivered_at=? WHERE id=?`, attempts, code, excerpt, dur, now, q.id)
		if err == nil && countable {
			_, err = tx.ExecContext(ctx, `UPDATE webhooks SET consecutive_failures=0 WHERE id=?`, q.webhookID)
		}
	default:
		wait, retry := Backoff(attempts, s.rand())
		if once || res.terminal {
			retry = false
		}
		if retry {
			_, err = tx.ExecContext(ctx, `UPDATE webhook_deliveries SET status='retry', attempts=?, next_attempt_at=?, last_status_code=?, last_error=?,
				response_excerpt=?, duration_ms=? WHERE id=?`, attempts, now+wait.Milliseconds(), code, errMsg, excerpt, dur, q.id)
			break
		}
		_, err = tx.ExecContext(ctx, `UPDATE webhook_deliveries SET status='failed', attempts=?, next_attempt_at=NULL, last_status_code=?, last_error=?,
			response_excerpt=?, duration_ms=? WHERE id=?`, attempts, code, errMsg, excerpt, dur, q.id)
		if err == nil && countable {
			_, err = tx.ExecContext(ctx, `UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id=?`, q.webhookID)
		}
		if err == nil && countable {
			_, err = tx.ExecContext(ctx, `UPDATE webhooks SET enabled=0, disabled_reason=?, updated_at=? WHERE id=? AND enabled=1 AND consecutive_failures >= ?`,
				DisabledTooManyFailures, now, q.webhookID, AutoDisableAfter)
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

// Prune drops log entries older than LogRetention and finished entries beyond
// the newest LogLimit per webhook. Queued deliveries younger than the retention
// window are never dropped.
func (s *Service) Prune(ctx context.Context) error { return deliveryq.Prune(ctx, s.db, table, s.now()) }
