package email

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/config"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Service bundles the per-user inbox settings, the message processor and,
// when the operator configured a mailbox, the poller.
type Service struct {
	cfg    config.EmailConfig
	store  *Store
	proc   *Processor
	poller *Poller
}

// Options tune a Service. Source replaces the IMAP client (tests).
type Options struct {
	Log    *slog.Logger
	Audit  *audit.Recorder
	Source Source
}

// New wires email capture. With cfg disabled the service only answers the
// API with enabledByOperator false and never opens a connection.
func New(db *sql.DB, sync *opsync.Service, cfg config.EmailConfig, o Options) *Service {
	log := o.Log
	if log == nil {
		log = slog.Default()
	}
	s := &Service{cfg: cfg, store: NewStore(db, o.Audit)}
	s.proc = NewProcessor(s.store, sync, cfg.LocalPart, cfg.Domain, log)
	if cfg.Enabled() {
		src := o.Source
		if src == nil {
			src = &IMAPSource{
				Addr: cfg.IMAPHost, User: cfg.IMAPUser, Password: cfg.IMAPPassword,
				Mailbox: cfg.Mailbox, Delete: cfg.Processed == "delete", Folder: cfg.ProcessedFolder,
			}
		}
		s.poller = NewPoller(src, s.proc, s.store, cfg.PollInterval, log)
	}
	return s
}

// Enabled reports whether the operator configured email capture.
func (s *Service) Enabled() bool { return s.cfg.Enabled() }

// Store returns the per-user inbox settings.
func (s *Service) Store() *Store { return s.store }

// Processor returns the message processor.
func (s *Service) Processor() *Processor { return s.proc }

// Poller returns the poller, nil when email capture is disabled.
func (s *Service) Poller() *Poller { return s.poller }

// Address returns the inbox address for a secret.
func (s *Service) Address(secret string) string { return s.cfg.AddressFor(secret) }

// Run polls until ctx ends; it returns at once when email capture is disabled.
func (s *Service) Run(ctx context.Context) {
	if s.poller == nil {
		return
	}
	s.poller.Run(ctx)
}

// Poller fetches unseen messages at a fixed interval and hands them to the
// processor. A failed poll is logged once and retried at the next tick.
type Poller struct {
	src       Source
	proc      *Processor
	store     *Store
	interval  time.Duration
	log       *slog.Logger
	now       func() time.Time
	lastPrune time.Time
}

// NewPoller wires a Poller.
func NewPoller(src Source, proc *Processor, store *Store, interval time.Duration, log *slog.Logger) *Poller {
	if interval <= 0 {
		interval = time.Minute
	}
	return &Poller{src: src, proc: proc, store: store, interval: interval, log: log, now: time.Now}
}

// Run polls immediately and then every interval until ctx is cancelled.
func (p *Poller) Run(ctx context.Context) {
	p.log.Info("email capture polling", "interval", p.interval.String())
	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		p.tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (p *Poller) tick(ctx context.Context) {
	counts, err := p.Poll(ctx)
	if ctx.Err() != nil {
		return
	}
	if err != nil {
		// Server errors carry no message content; the poll is retried next tick.
		p.log.Warn("email poll failed", "err", err)
	}
	if len(counts) > 0 {
		args := make([]any, 0, 2*len(counts))
		for k, v := range counts {
			args = append(args, string(k), v)
		}
		p.log.Info("email poll", args...)
	}
	if now := p.now(); now.Sub(p.lastPrune) > 24*time.Hour {
		if _, err := p.store.PruneReceipts(ctx, now); err != nil {
			p.log.Warn("email receipt prune failed", "err", err)
		}
		p.lastPrune = now
	}
}

// Poll runs one pass over the mailbox and returns the count of each outcome.
// Messages are marked processed only after their outcome is final, so a
// transient failure leaves them for the next poll.
func (p *Poller) Poll(ctx context.Context) (map[Outcome]int, error) {
	mb, err := p.src.Open(ctx)
	if err != nil {
		return nil, err
	}
	defer mb.Close()
	msgs, err := mb.Unseen(ctx)
	if err != nil {
		return nil, err
	}
	counts := map[Outcome]int{}
	var done []uint32
	var firstErr error
	for _, m := range msgs {
		if ctx.Err() != nil {
			break
		}
		var out Outcome
		if m.Size > MaxMessageBytes {
			out = TooLarge
		} else {
			raw, err := mb.Fetch(ctx, m.UID)
			if err != nil {
				firstErr = err
				break // the connection is likely gone; keep what is done
			}
			if out, err = p.proc.Process(ctx, raw); err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
		}
		counts[out]++
		done = append(done, m.UID)
	}
	if err := mb.Done(ctx, done); err != nil && firstErr == nil {
		firstErr = err
	}
	return counts, firstErr
}
