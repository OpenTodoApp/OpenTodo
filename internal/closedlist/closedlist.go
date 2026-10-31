// Package closedlist is Today's closed list (OpenSpec change today-closed-list):
// an optional limit on how many of Today's available tasks it lists, filled first
// come, first served, the rest waiting for a slot. The slots are derived from
// synced rows and the caller's logical today, never stored. The same rule is
// implemented in web/src/lib/closedList.ts; both evaluate
// web/src/lib/closedList.vectors.json and must agree. Pure, standard library only.
package closedlist

import (
	"math"
	"sort"
	"strings"
)

// Max is the largest limit and the most ids a taken list keeps.
const Max = 20

// ReadLimit reads a stored limit: 0 (off) for a non-integer or a value outside 1-20.
func ReadLimit(raw any) int {
	v, ok := raw.(float64)
	if !ok {
		if i, isInt := raw.(int); isInt {
			v, ok = float64(i), true
		}
	}
	if !ok || v != math.Trunc(v) || v < 1 || v > Max {
		return 0
	}
	return int(v)
}

// Task is one of Today's open tasks as the rule reads it.
type Task struct {
	ID        string
	CreatedAt int64
	// Earlier is a task in Today's Earlier group (overdue, or a passed deadline).
	Earlier bool
	// Due is the date Earlier sorts by (the due date, else the deadline).
	Due string
	// Habit tasks never take a slot.
	Habit bool
	// Blocked by an open task: the fallback rule when no predicate is given.
	Blocked bool
}

// Review is the part of the personal review row the rule reads.
type Review struct {
	FocusDate, Focus, SlotsDate, Slots string
}

// Input is everything the rule needs. Today is the caller's logical today.
type Input struct {
	Tasks  []Task
	Limit  any
	Today  string
	Review Review
}

// Fill is the result: Limit is 0 when off; Slots and Waiting are in fill order;
// Chosen is how many slots hold a focus or taken task.
type Fill struct {
	Limit   int
	Slots   []string
	Waiting []string
	Chosen  int
}

// NotBlocked is the fallback availability rule.
func NotBlocked(t Task) bool { return !t.Blocked }

// IDs splits a comma-separated id list chosen on date; none when date is not today.
func IDs(list, date, today string) []string {
	if list == "" || date != today {
		return nil
	}
	var out []string
	for _, s := range strings.Split(list, ",") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func byCreation(a, b Task) bool {
	if a.CreatedAt != b.CreatedAt {
		return a.CreatedAt < b.CreatedAt
	}
	return a.ID < b.ID
}

// Compute fills Today's slots: today's focus, then the taken tasks in the order
// taken, then Earlier oldest due first, then the rest oldest created first, ties
// by id. Only tasks available reports true for count; habits never do. A nil
// available uses NotBlocked.
func Compute(in Input, available func(Task) bool) Fill {
	if available == nil {
		available = NotBlocked
	}
	limit := ReadLimit(in.Limit)
	counted := map[string]Task{}
	var list []Task
	for _, t := range in.Tasks {
		if t.Habit || !available(t) {
			continue
		}
		counted[t.ID] = t
		list = append(list, t)
	}
	order := []string{}
	seen := map[string]bool{}
	push := func(id string) {
		if _, ok := counted[id]; ok && !seen[id] {
			seen[id] = true
			order = append(order, id)
		}
	}
	for _, id := range IDs(in.Review.Focus, in.Review.FocusDate, in.Today) {
		push(id)
	}
	for _, id := range IDs(in.Review.Slots, in.Review.SlotsDate, in.Today) {
		push(id)
	}
	chosen := len(order)
	var earlier, rest []Task
	for _, t := range list {
		if seen[t.ID] {
			continue
		}
		if t.Earlier {
			earlier = append(earlier, t)
		} else {
			rest = append(rest, t)
		}
	}
	sort.SliceStable(earlier, func(i, j int) bool {
		if earlier[i].Due != earlier[j].Due {
			return earlier[i].Due < earlier[j].Due
		}
		return byCreation(earlier[i], earlier[j])
	})
	sort.SliceStable(rest, func(i, j int) bool { return byCreation(rest[i], rest[j]) })
	for _, t := range earlier {
		push(t.ID)
	}
	for _, t := range rest {
		push(t.ID)
	}
	if limit == 0 {
		return Fill{Slots: order, Waiting: []string{}}
	}
	if len(order) <= limit {
		return Fill{Limit: limit, Slots: order, Waiting: []string{}, Chosen: min(chosen, limit)}
	}
	return Fill{Limit: limit, Slots: order[:limit], Waiting: order[limit:], Chosen: min(chosen, limit)}
}

// Take returns the taken list after Take a slot for id, or full when every slot
// already holds a focus or taken task. Ids that no longer count are dropped; at
// most Max ids are kept.
func Take(f Fill, taken []string, id string) (next []string, full bool) {
	if f.Limit > 0 && f.Chosen >= f.Limit {
		return nil, true
	}
	live := map[string]bool{}
	for _, x := range f.Slots {
		live[x] = true
	}
	for _, x := range f.Waiting {
		live[x] = true
	}
	for _, x := range taken {
		if x != id && live[x] {
			next = append(next, x)
		}
	}
	next = append(next, id)
	if len(next) > Max {
		next = next[len(next)-Max:]
	}
	return next, false
}

// WaitingSet is the waiting ids as a set.
func (f Fill) WaitingSet() map[string]bool {
	out := make(map[string]bool, len(f.Waiting))
	for _, id := range f.Waiting {
		out[id] = true
	}
	return out
}
