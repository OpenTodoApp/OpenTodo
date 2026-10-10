package email

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strconv"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Outcome is what happened to one message. Every outcome except a transient
// error lets the poller mark the message processed.
type Outcome string

// Message outcomes, also used as the keys of the per-poll log counters.
const (
	Created      Outcome = "created"
	Duplicate    Outcome = "duplicate"
	Unroutable   Outcome = "unroutable"     // no recipient carries a sub-address
	UnknownInbox Outcome = "unknown_secret" // the secret matches no account
	Disabled     Outcome = "disabled"       // the user switched capture off
	Deactivated  Outcome = "deactivated"    // the account is deactivated
	NotAllowed   Outcome = "not_allowed"    // sender not on the allowlist
	RateLimited  Outcome = "rate_limited"   // hourly cap reached
	TooLarge     Outcome = "too_large"
	Malformed    Outcome = "malformed"
)

// Device is the op device of tasks created from email: like every other
// server-side write it is "server" (spec: Message becomes a task).
const Device = opsync.ServerDevice

// Processor turns one raw message into at most one task.
type Processor struct {
	store  *Store
	sync   *opsync.Service
	local  string
	domain string
	log    *slog.Logger
	now    func() time.Time
	cap    int
}

// NewProcessor wires a Processor for the address local@domain.
func NewProcessor(store *Store, sync *opsync.Service, local, domain string, log *slog.Logger) *Processor {
	if log == nil {
		log = slog.Default()
	}
	return &Processor{store: store, sync: sync, local: local, domain: domain, log: log, now: time.Now, cap: HourlyCap}
}

// Process handles one message. A non-nil error is transient (database): the
// message should stay in the mailbox and be retried at the next poll. Message
// content is never logged above debug level.
func (p *Processor) Process(ctx context.Context, raw []byte) (Outcome, error) {
	if len(raw) > MaxMessageBytes {
		return TooLarge, nil
	}
	msg, err := Parse(raw)
	if err != nil {
		return Malformed, nil
	}
	secret, ok := Route(msg.Header, p.local, p.domain)
	if !ok {
		return Unroutable, nil
	}
	in, found, err := p.store.BySecret(ctx, secret)
	if err != nil {
		return "", err
	}
	if !found {
		return UnknownInbox, nil
	}
	if !in.Enabled {
		return Disabled, nil
	}
	if off, err := p.store.Deactivated(ctx, in.UserID); err != nil {
		return "", err
	} else if off {
		return Deactivated, nil
	}
	if len(in.Allowlist) > 0 && !slices.Contains(in.Allowlist, msg.From) {
		return NotAllowed, nil
	}
	if seen, err := p.store.HasReceipt(ctx, in.UserID, msg.MessageID); err != nil {
		return "", err
	} else if seen {
		return Duplicate, nil
	}
	now := p.now()
	if n, err := p.store.HourlyCount(ctx, in.UserID, now); err != nil {
		return "", err
	} else if n >= p.cap {
		return RateLimited, nil
	}
	ops := taskOps(in.UserID, msg, now)
	res, err := p.sync.ApplyStrict(ctx, in.UserID, ops)
	if errors.Is(err, opsync.ErrInvalidOp) {
		return Malformed, nil // never retried: the same message would fail again
	}
	if err != nil {
		return "", fmt.Errorf("email: apply: %w", err)
	}
	// The ops are deterministic (ids derived from account and Message-ID), so a
	// crash between Apply and this receipt only replays duplicates next time.
	if _, err := p.store.AddReceipt(ctx, in.UserID, msg.MessageID, now); err != nil {
		return "", err
	}
	if res.Applied > 0 {
		p.sync.NotifyApplied(res, Device)
	} else {
		return Duplicate, nil
	}
	p.log.Debug("email: task created", "user", in.UserID, "message_id", msg.MessageID)
	return Created, nil
}

// TaskID is the id of the task created from messageID for userID. It is
// derived, not random, so replaying a message can only produce duplicates.
func TaskID(userID, messageID string) string {
	return ids.NameID("email-task", userID+"\x00"+messageID)
}

// taskOps builds the ops of a new Inbox task: title, description, priority 4,
// no due date, no project.
func taskOps(userID string, msg *Parsed, now time.Time) []opsync.Op {
	id := TaskID(userID, msg.MessageID)
	ms := now.UnixMilli()
	str := func(s string) json.RawMessage { b, _ := json.Marshal(s); return b }
	num := json.RawMessage(strconv.FormatInt(ms, 10))
	fields := []struct {
		name  string
		value json.RawMessage
	}{
		{"title", str(msg.Title)},
		{"description", str(msg.Description)},
		{"priority", json.RawMessage("4")},
		{"created_at", num},
		{"position", num},
	}
	ops := make([]opsync.Op, len(fields))
	for i, f := range fields {
		ops[i] = opsync.Op{
			ID:       ids.NameID("email-op", userID+"\x00"+msg.MessageID+"\x00"+f.name),
			Entity:   "task",
			EntityID: id,
			Field:    f.name,
			Value:    f.value,
			TS:       ms,
			Device:   Device,
		}
	}
	return ops
}
