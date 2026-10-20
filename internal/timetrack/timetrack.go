// Package timetrack holds the rules of tracked time (OpenSpec change
// `time-tracking`, design D2, D3, D8) that the server and the web client both
// apply: the one-running-entry rule and its repair, the minutes of an entry,
// the day an entry belongs to and the CSV export. It depends on internal/e2ee alone
// (ciphertext detection) and writes nothing; callers turn its results into ops. web/src/lib/time.ts is the
// twin, pinned by the fixtures in testdata/.
package timetrack

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Entry is the part of a time_entry row the rules read.
type Entry struct {
	ID        string `json:"id"`
	TaskID    string `json:"task_id"`
	UserID    string `json:"user_id"`
	StartedAt int64  `json:"started_at"`
	// EndedAt is nil while the entry runs.
	EndedAt   *int64 `json:"ended_at"`
	Note      string `json:"note"`
	DeletedAt *int64 `json:"deleted_at"`
}

// Live reports whether the entry is not deleted.
func (e Entry) Live() bool { return e.DeletedAt == nil }

// IsRunning reports whether the entry is live and has no end.
func (e Entry) IsRunning() bool { return e.Live() && e.EndedAt == nil }

// Repair is one ended_at value to write.
type Repair struct {
	ID      string `json:"id"`
	EndedAt int64  `json:"ended_at"`
}

// wins orders running entries: the greatest started_at, then the greatest id.
func wins(a, b Entry) bool {
	if a.StartedAt != b.StartedAt {
		return a.StartedAt > b.StartedAt
	}
	return a.ID > b.ID
}

// runningOf lists the user's running entries, the one to keep first.
func runningOf(entries []Entry, userID string) []Entry {
	var out []Entry
	for _, e := range entries {
		if e.UserID == userID && e.IsRunning() {
			out = append(out, e)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return wins(out[i], out[j]) })
	return out
}

// Running returns the user's one running entry: the greatest started_at, ties
// by the greatest id; nil when none runs.
func Running(entries []Entry, userID string) *Entry {
	r := runningOf(entries, userID)
	if len(r) == 0 {
		return nil
	}
	return &r[0]
}

// Repairs ends every other running entry of the user at the kept one's
// started_at. Every device computes the same values, so the repair converges.
func Repairs(entries []Entry, userID string) []Repair {
	r := runningOf(entries, userID)
	if len(r) < 2 {
		return nil
	}
	out := make([]Repair, 0, len(r)-1)
	for _, e := range r[1:] {
		out = append(out, Repair{ID: e.ID, EndedAt: r[0].StartedAt})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// StartBatch is what starting (or stopping) at `at` writes besides the new
// entry: the repairs, and the kept running entry ended at `at`.
func StartBatch(entries []Entry, userID string, at int64) []Repair {
	keep := Running(entries, userID)
	if keep == nil {
		return nil
	}
	end := at
	if end < keep.StartedAt {
		end = keep.StartedAt
	}
	return append(Repairs(entries, userID), Repair{ID: keep.ID, EndedAt: end})
}

// MinutesOf is the entry's whole minutes: max(0, (ended_at or now) - started_at),
// rounded down. An entry inverted by concurrent edits counts zero.
func MinutesOf(e Entry, now int64) int {
	end := now
	if e.EndedAt != nil {
		end = *e.EndedAt
	}
	if end <= e.StartedAt {
		return 0
	}
	return int((end - e.StartedAt) / 60000)
}

// DayOf is the logical day (YYYY-MM-DD) an entry belongs to: the day of its
// start in loc, the previous date while the wall time is before dayStart
// minutes after midnight (day-boundary; the rule of digest.LogicalDay). An
// entry across midnight belongs whole to the day it started.
func DayOf(ms int64, loc *time.Location, dayStart int) string {
	if loc == nil {
		loc = time.UTC
	}
	l := time.UnixMilli(ms).In(loc)
	if l.Hour()*60+l.Minute() < dayStart {
		y, m, d := l.Date()
		return time.Date(y, m, d-1, 12, 0, 0, 0, loc).Format(time.DateOnly)
	}
	return l.Format(time.DateOnly)
}

// TotalsByTask sums the minutes of the live entries per task, a running one to now.
func TotalsByTask(entries []Entry, now int64) map[string]int {
	out := map[string]int{}
	for _, e := range entries {
		if e.Live() {
			out[e.TaskID] += MinutesOf(e, now)
		}
	}
	return out
}

var (
	hoursDuration   = regexp.MustCompile(`^(\d+(?:\.\d+)?)h(?:(\d{1,2})(?:m|min)?)?$`)
	minutesDuration = regexp.MustCompile(`^(\d+)(?:m|min|mins|minutes)?$`)
)

// ParseDuration reads a typed duration in minutes (design D9): 30m, 45min,
// 1h, 1h30, 1h30m, 1.5h or a bare number of minutes. Units are not
// translated; there is no "+" and no clock reading. ok is false for anything
// else, including minutes over 59 after an hour count. The web twin is
// parseDuration in web/src/lib/time.ts; the filter grammar and the CLI use it.
func ParseDuration(s string) (minutes int, ok bool) {
	t := strings.ToLower(strings.TrimSpace(s))
	if m := hoursDuration.FindStringSubmatch(t); m != nil {
		h, err := strconv.ParseFloat(m[1], 64)
		if err != nil {
			return 0, false
		}
		mins := 0
		if m[2] != "" {
			mins, _ = strconv.Atoi(m[2])
			if mins > 59 {
				return 0, false
			}
		}
		total := math.Round(h*60 + float64(mins))
		if total > MaxDuration {
			return 0, false
		}
		return int(total), true
	}
	if m := minutesDuration.FindStringSubmatch(t); m != nil {
		n, err := strconv.Atoi(m[1])
		if err != nil || n > MaxDuration {
			return 0, false
		}
		return n, true
	}
	return 0, false
}

// MaxDuration bounds a typed duration: 100 days in minutes.
const MaxDuration = 144000
