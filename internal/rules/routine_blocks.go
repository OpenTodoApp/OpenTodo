package rules

import (
	"encoding/json"
	"regexp"
	"time"
)

// The blocks of a routine run (OpenSpec change assistant-routine-blocks, D1):
// an Ask AI step answering in text may show tasks, a day or week of the
// calendar, or the deadlines of some days, at most MaxRunBlocks per run. A
// run keeps each as its kind and checked parameters, never text, and every
// device renders it from its own rows.

// MaxRunBlocks is the most blocks one run shows.
const MaxRunBlocks = 4

// The kinds a run's block may have.
const (
	RunBlockTasks     = "tasks"
	RunBlockCalendar  = "calendar"
	RunBlockDeadlines = "deadlines"
)

// RunBlock is one block of a run: tasks (IDs), calendar (Date, Span) or
// deadlines (From, To).
type RunBlock struct {
	Kind string   `json:"kind"`
	IDs  []string `json:"ids,omitempty"`
	Date string   `json:"date,omitempty"`
	Span string   `json:"span,omitempty"`
	From string   `json:"from,omitempty"`
	To   string   `json:"to,omitempty"`
}

// Block parameter limits (the assistant's display tools).
const (
	maxRunBlockIDs  = 20
	maxRunBlockDays = 31
)

var blockIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func blockDay(s string) (time.Time, bool) {
	if len(s) != len(time.DateOnly) {
		return time.Time{}, false
	}
	d, err := time.Parse(time.DateOnly, s)
	return d, err == nil
}

// valid reports whether a block is one a run may keep: a known kind with
// only its own parameters, each well formed.
func (b RunBlock) valid() bool {
	switch b.Kind {
	case RunBlockTasks:
		if len(b.IDs) == 0 || len(b.IDs) > maxRunBlockIDs || b.Date != "" || b.Span != "" || b.From != "" || b.To != "" {
			return false
		}
		for _, id := range b.IDs {
			if !blockIDRe.MatchString(id) {
				return false
			}
		}
		return true
	case RunBlockCalendar:
		_, ok := blockDay(b.Date)
		return ok && (b.Span == "day" || b.Span == "week") && len(b.IDs) == 0 && b.From == "" && b.To == ""
	case RunBlockDeadlines:
		from, ok1 := blockDay(b.From)
		to, ok2 := blockDay(b.To)
		return ok1 && ok2 && !to.Before(from) && to.Sub(from) < maxRunBlockDays*24*time.Hour && len(b.IDs) == 0 && b.Date == "" && b.Span == ""
	}
	return false
}

// checkRunBlocks checks a device's blocks (D1): at most MaxRunBlocks, each valid.
func checkRunBlocks(list []RunBlock) error {
	if len(list) > MaxRunBlocks {
		return ErrBadCommit
	}
	for _, b := range list {
		if !b.valid() {
			return ErrBadCommit
		}
	}
	return nil
}

// blocksJSON is a run's blocks as stored: the empty string for none.
func blocksJSON(list []RunBlock) string {
	if len(list) == 0 {
		return ""
	}
	b, _ := json.Marshal(list)
	return string(b)
}

// blocksOf reads a stored blocks column; anything unreadable is none.
func blocksOf(s string) []RunBlock {
	if s == "" {
		return nil
	}
	var out []RunBlock
	if json.Unmarshal([]byte(s), &out) != nil {
		return nil
	}
	return out
}
