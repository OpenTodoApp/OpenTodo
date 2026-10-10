package backup

import (
	"context"
	"errors"
	"strconv"
	"time"
)

// maxSleep caps how long the scheduler sleeps between checks so wall-clock
// jumps (suspend, NTP, DST) are noticed within a minute.
const maxSleep = time.Minute

// nextRun returns the first scheduled instant strictly after `after`,
// evaluated in loc. Frequency "off" yields the zero time.
func nextRun(sc Schedule, after time.Time, loc *time.Location) time.Time {
	hh, mm := 3, 0
	if len(sc.Time) == 5 {
		hh, _ = strconv.Atoi(sc.Time[:2])
		mm, _ = strconv.Atoi(sc.Time[3:])
	}
	a := after.In(loc)
	switch sc.Frequency {
	case FreqHourly:
		c := time.Date(a.Year(), a.Month(), a.Day(), a.Hour(), mm, 0, 0, loc)
		for !c.After(after) {
			c = c.Add(time.Hour)
		}
		return c
	case FreqDaily:
		c := time.Date(a.Year(), a.Month(), a.Day(), hh, mm, 0, 0, loc)
		for i := 1; !c.After(after); i++ {
			c = time.Date(a.Year(), a.Month(), a.Day()+i, hh, mm, 0, 0, loc)
		}
		return c
	case FreqWeekly:
		days := (sc.Weekday - int(a.Weekday()) + 7) % 7
		c := time.Date(a.Year(), a.Month(), a.Day()+days, hh, mm, 0, 0, loc)
		for i := 1; !c.After(after); i++ {
			c = time.Date(a.Year(), a.Month(), a.Day()+days+7*i, hh, mm, 0, 0, loc)
		}
		return c
	}
	return time.Time{}
}

// due reports the next scheduled run and whether it is already due. The
// reference point is the last scheduled attempt (successful or not) or, when
// the schedule never ran, the moment it was configured; so a run missed while
// the server was stopped is due at startup, exactly once.
func (s *Service) due(ctx context.Context) (time.Time, bool, error) {
	set, err := s.LoadSettings(ctx)
	if err != nil || !set.Enabled() {
		return time.Time{}, false, err
	}
	ref, err := s.lastScheduledStart(ctx)
	if err != nil {
		return time.Time{}, false, err
	}
	ref = max(ref, set.ScheduleSince)
	now := s.now()
	refT := now
	if ref > 0 {
		refT = time.UnixMilli(ref)
	}
	next := nextRun(set.Schedule, refT, s.loc)
	return next, !next.After(now), nil
}

// NextRun is the next scheduled time for status displays (nil when disabled).
// A missed run reports the current time: it starts momentarily.
func (s *Service) NextRun(ctx context.Context) (*time.Time, error) {
	next, isDue, err := s.due(ctx)
	if err != nil || next.IsZero() {
		return nil, err
	}
	if isDue {
		now := s.now()
		return &now, nil
	}
	return &next, nil
}

// runIfDue performs a scheduled backup when one is due.
func (s *Service) runIfDue(ctx context.Context) {
	_, isDue, err := s.due(ctx)
	if err != nil {
		s.log.Error("backup scheduler", "err", err)
		return
	}
	if !isDue {
		return
	}
	if _, err := s.RunNow(ctx, KindScheduled); err != nil && !errors.Is(err, ErrRunning) {
		s.log.Error("backup scheduler", "err", err)
	}
}

// Start launches the scheduler goroutine; it stops when ctx is cancelled. Runs
// left "running" by a previous process are marked as interrupted first.
func (s *Service) Start(ctx context.Context) {
	if err := s.markInterrupted(context.WithoutCancel(ctx)); err != nil {
		s.log.Error("backup: mark interrupted runs", "err", err)
	}
	s.recordPendingRestore(context.WithoutCancel(ctx))
	go s.loop(ctx)
}

func (s *Service) loop(ctx context.Context) {
	timer := time.NewTimer(s.startupDelay)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			s.runIfDue(ctx)
		case <-s.wakeCh:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
		}
		wait := maxSleep
		if next, isDue, err := s.due(ctx); err == nil && !next.IsZero() {
			if isDue {
				wait = time.Second
			} else if d := next.Sub(s.now()); d < wait {
				wait = max(d, time.Second)
			}
		}
		timer.Reset(wait)
	}
}
