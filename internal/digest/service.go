package digest

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/mail"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Scheduling (design D6).
const (
	// TickInterval is the pass interval on the jobs leader.
	TickInterval = 5 * time.Minute
	// Window is how long after the chosen hour a failed send is retried.
	Window = 6 * time.Hour
	// RetryEvery spaces the retries of a failed send, so they stay below the
	// per-recipient sending limit of outgoing email (five an hour).
	RetryEvery = 15 * time.Minute
)

// Outcomes recorded in last_outcome besides a failed stage.
const (
	OutcomeSent      = "sent"
	OutcomeSkipped   = "skipped"
	OutcomeEncrypted = "encrypted_account"
	OutcomeLimited   = "rate_limited"
)

// Mailer is the part of mail.Service the digest uses.
type Mailer interface {
	Enabled(ctx context.Context) bool
	Send(ctx context.Context, m mail.Message) error
	RecordFailure(ctx context.Context, m mail.Message, reason string)
}

// EncryptionChecker reports whether an account has end-to-end encryption on.
type EncryptionChecker interface {
	Enabled(ctx context.Context, userID string) (bool, error)
}

// Options configure a Service; zero values are production defaults.
type Options struct {
	// Origin is the configured public origin (OPENTODO_BASE_URL); when empty the
	// origin stored with the settings is used.
	Origin string
	Log    *slog.Logger
	Now    func() time.Time
	E2EE   EncryptionChecker
}

// Service builds and schedules digests.
type Service struct {
	db     *sql.DB
	sync   *opsync.Service
	mail   Mailer
	store  *Store
	e2ee   EncryptionChecker
	origin string
	log    *slog.Logger
	now    func() time.Time
}

// New wires the digest over the database, the sync service and outgoing email.
func New(db *sql.DB, syncSvc *opsync.Service, m Mailer, o Options) *Service {
	if o.Log == nil {
		o.Log = slog.Default()
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.E2EE == nil {
		o.E2EE = e2ee.NewStore(db)
	}
	return &Service{db: db, sync: syncSvc, mail: m, store: NewStore(db, o.Now), e2ee: o.E2EE, origin: o.Origin, log: o.Log, now: o.Now}
}

// Store returns the settings store.
func (s *Service) Store() *Store { return s.store }

type action int

const (
	actNone action = iota
	actSend
	actSkip
)

// planFor decides what a pass does for one row: send for the local date when
// the chosen weekday's hour has passed within the window and nothing was sent
// for that date yet; give up (skip) once the window closed after an attempt.
func planFor(st Settings, now time.Time) (action, string) {
	loc, err := time.LoadLocation(st.TimeZone)
	if err != nil {
		return actNone, ""
	}
	local := now.In(loc)
	for back := 0; back <= 1; back++ {
		d := local.AddDate(0, 0, -back)
		date := d.Format(day)
		if int(d.Weekday()) != st.Weekday || st.LastSentFor == date {
			continue
		}
		sched := time.Date(d.Year(), d.Month(), d.Day(), st.Hour, 0, 0, 0, loc)
		if now.Before(sched) {
			continue
		}
		if now.Before(sched.Add(Window)) {
			if st.LastAttemptAt >= sched.UnixMilli() && now.Sub(time.UnixMilli(st.LastAttemptAt)) < RetryEvery {
				return actNone, ""
			}
			return actSend, date
		}
		if st.LastAttemptAt >= sched.UnixMilli() {
			return actSkip, date
		}
	}
	return actNone, ""
}

// NextSendAt is when the next digest is due for enabled settings, or zero.
func NextSendAt(st Settings, now time.Time) time.Time {
	loc, err := time.LoadLocation(st.TimeZone)
	if err != nil || !st.Enabled {
		return time.Time{}
	}
	local := now.In(loc)
	for i := -1; i <= 8; i++ {
		d := local.AddDate(0, 0, i)
		if int(d.Weekday()) != st.Weekday || st.LastSentFor == d.Format(day) {
			continue
		}
		sched := time.Date(d.Year(), d.Month(), d.Day(), st.Hour, 0, 0, 0, loc)
		if now.Before(sched.Add(Window)) {
			return sched
		}
	}
	return time.Time{}
}

// NextDue is when a pass next has work: the earliest scheduled send, retry
// or give-up among the enabled rows. A host's shared scheduler opens a tenant
// only then (multi-tenant-host D3). ok is false while outgoing email is off or
// nobody opted in.
func (s *Service) NextDue(ctx context.Context) (time.Time, bool, error) {
	if s.mail == nil || !s.mail.Enabled(ctx) {
		return time.Time{}, false, nil
	}
	rows, err := s.store.Enabled(ctx)
	if err != nil {
		return time.Time{}, false, err
	}
	now := s.now()
	var next time.Time
	for _, st := range rows {
		if at := dueAt(st, now); !at.IsZero() && (next.IsZero() || at.Before(next)) {
			next = at
		}
	}
	return next, !next.IsZero(), nil
}

// dueAt is when a pass next acts on one row (the inverse of planFor): now when
// it would act now, the scheduled hour when that is ahead, otherwise the next
// retry or the end of the window, whichever comes first.
func dueAt(st Settings, now time.Time) time.Time {
	if act, _ := planFor(st, now); act != actNone {
		return now
	}
	sched := NextSendAt(st, now)
	if sched.IsZero() || sched.After(now) {
		return sched
	}
	retry := time.UnixMilli(st.LastAttemptAt).Add(RetryEvery)
	if end := sched.Add(Window); end.Before(retry) {
		return end
	}
	return retry
}

// Run passes every TickInterval until ctx ends (jobs leader only).
func (s *Service) Run(ctx context.Context) {
	t := time.NewTicker(TickInterval)
	defer t.Stop()
	for {
		if n, err := s.Tick(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			s.log.Error("digest scheduler", "err", err)
		} else if n > 0 {
			s.log.Info("weekly digests sent", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Tick runs one pass and returns how many digests were sent.
func (s *Service) Tick(ctx context.Context) (int, error) {
	if s.mail == nil || !s.mail.Enabled(ctx) {
		return 0, nil
	}
	rows, err := s.store.Enabled(ctx)
	if err != nil {
		return 0, err
	}
	now := s.now()
	sent := 0
	for _, st := range rows {
		if ctx.Err() != nil {
			return sent, ctx.Err()
		}
		act, date := planFor(st, now)
		if act == actNone {
			continue
		}
		ok, err := s.handle(ctx, st, act, date, now)
		if err != nil {
			s.log.Error("weekly digest", "user", st.UserID, "err", err)
			continue
		}
		if ok {
			sent++
		}
	}
	return sent, nil
}

func (s *Service) handle(ctx context.Context, st Settings, act action, date string, now time.Time) (bool, error) {
	to, active, err := s.recipient(ctx, st.UserID)
	if err != nil || !active {
		return false, err
	}
	stub := mail.Message{Kind: mail.KindDigest, To: to, UserID: st.UserID, Lang: st.Lang}
	if act == actSkip {
		s.mail.RecordFailure(ctx, stub, OutcomeSkipped)
		return false, s.store.MarkOutcome(ctx, st.UserID, OutcomeSkipped, date)
	}
	// A digest is never built for an encrypted account (email-digest
	// "Encryption turns the digest off"): refuse first, record, and turn it off.
	on, err := s.e2ee.Enabled(ctx, st.UserID)
	if err != nil {
		return false, err
	}
	if on {
		s.mail.RecordFailure(ctx, stub, OutcomeEncrypted)
		if err := s.store.MarkOutcome(ctx, st.UserID, OutcomeEncrypted, date); err != nil {
			return false, err
		}
		_, err := s.store.Disable(ctx, st.UserID)
		return false, err
	}
	msg, err := s.Build(ctx, st, to, now)
	if err != nil {
		return false, err
	}
	if err := s.store.MarkAttempt(ctx, st.UserID, now); err != nil {
		return false, err
	}
	err = s.mail.Send(ctx, msg)
	// The outcome is recorded even when shutdown began during the send: a
	// digest that went out but is not marked sent would go out again after the
	// restart (reliable-background-jobs).
	octx := context.WithoutCancel(ctx)
	switch {
	case err == nil:
		return true, s.store.MarkSent(octx, st.UserID, date)
	case errors.Is(err, mail.ErrEncrypted):
		_ = s.store.MarkOutcome(octx, st.UserID, OutcomeEncrypted, date)
		_, derr := s.store.Disable(octx, st.UserID)
		return false, derr
	case errors.Is(err, mail.ErrRateLimited):
		return false, s.store.MarkOutcome(octx, st.UserID, OutcomeLimited, "")
	case errors.Is(err, mail.ErrDisabled):
		return false, nil
	}
	stage := mail.StageSend
	var se *mail.SendError
	if errors.As(err, &se) {
		stage = se.Stage
	}
	// Retried at the next pass until the window closes (mail.Send audited it).
	return false, s.store.MarkOutcome(octx, st.UserID, stage, "")
}

// recipient is the account's address and whether it may receive mail
// (deactivated accounts get nothing).
func (s *Service) recipient(ctx context.Context, userID string) (string, bool, error) {
	var email string
	var deactivated sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT u.email, st.deactivated_at FROM users u LEFT JOIN user_status st ON st.user_id = u.id WHERE u.id = ?`, userID).Scan(&email, &deactivated)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("digest recipient: %w", err)
	}
	return email, !deactivated.Valid, nil
}

// Build assembles the digest for the last full week in the user's zone from
// their materialized rows (design D6), with the definitions of stats.go.
func (s *Service) Build(ctx context.Context, st Settings, to string, now time.Time) (mail.Message, error) {
	loc, err := time.LoadLocation(st.TimeZone)
	if err != nil {
		return mail.Message{}, err
	}
	prefs, err := s.sync.Get(ctx, st.UserID, "user_prefs", "me")
	if err != nil {
		return mail.Message{}, err
	}
	// The day start (day-boundary D6) moves both "today" and the day each
	// completion counts for, so the digest matches the Statistics screen.
	in, err := s.input(ctx, st.UserID, loc, DayStart(str(prefs, "day_start")), now)
	if err != nil {
		return mail.Message{}, err
	}
	week := WeekPeriod(in.Today, WeekStart(str(prefs, "week_start")), -1)
	stats := Compute(in, week)
	names := map[string]string{}
	for _, p := range in.Projects {
		names[p.ID] = e2ee.Display(p.Name)
	}
	items := func(list []Task) ([]mail.DigestItem, int) {
		out := []mail.DigestItem{}
		for i, t := range list {
			if i == mail.DigestMaxTasks {
				return out, len(list) - i
			}
			out = append(out, mail.DigestItem{Title: e2ee.Display(t.Title), Due: t.Due, Project: names[t.ProjectID]})
		}
		return out, 0
	}
	d := &mail.DigestVars{WeekStart: week.Start, WeekEnd: week.End, Completed: stats.Completed, Created: stats.Created, Late: stats.Late, Slipped: stats.Slipped}
	d.Overdue, d.OverdueMore = items(stats.OverdueTasks)
	d.Ahead, d.AheadMore = items(in.Ahead(in.Counted()))
	for i, p := range in.WithoutNextAction() {
		if i == mail.DigestMaxProjects {
			d.IdleMore++
			continue
		}
		d.Idle = append(d.Idle, e2ee.Display(p.Name))
	}
	review, err := s.sync.Get(ctx, st.UserID, "review", "me")
	if err != nil {
		return mail.Message{}, err
	}
	if ms := int64(num(review, "completed_at")); ms > 0 {
		d.LastReview = LogicalDay(time.UnixMilli(ms), loc, in.DayStart)
	}
	origin := s.origin
	if origin == "" {
		origin = st.Origin
	}
	return mail.Message{Kind: mail.KindDigest, To: to, Lang: st.Lang, UserID: st.UserID, Origin: origin,
		Vars: mail.Vars{Link: strings.TrimRight(origin, "/") + "/review", Digest: d}}, nil
}

// input reads the user's rows as the statistics need them.
func (s *Service) input(ctx context.Context, userID string, loc *time.Location, dayStart int, now time.Time) (Input, error) {
	in := Input{Me: userID, Today: LogicalDay(now, loc, dayStart), Loc: loc, DayStart: dayStart}
	tasks, err := s.sync.List(ctx, userID, "task", false)
	if err != nil {
		return in, err
	}
	// Deleted projects too: their tasks are in the Trash with them.
	projects, err := s.sync.List(ctx, userID, "project", true)
	if err != nil {
		return in, err
	}
	shared, err := s.sync.SharedProjects(ctx, userID)
	if err != nil {
		return in, err
	}
	in.Shared = map[string]string{}
	for id, a := range shared {
		in.Shared[id] = a.Role
	}
	for _, e := range tasks {
		in.Tasks = append(in.Tasks, TaskOf(e))
	}
	for _, e := range projects {
		in.Projects = append(in.Projects, ProjectOf(e))
	}
	return in, nil
}

// compile-time check that the mail service satisfies Mailer.
var _ Mailer = (*mail.Service)(nil)
