package ruleval

import "strings"

// Set today's focus (routines-engine, the Set today's focus step): the Daily
// check's rules for a whole list, the same as web/src/lib/focusSet.ts. Both run
// web/src/lib/focusSet.vectors.json.

// FocusMax is how many tasks Three tasks holds.
const FocusMax = 3

// FocusTask is what placing a task reads.
type FocusTask struct {
	Open     bool
	Estimate *int
}

// FocusPatch is the review fields that set today's focus.
type FocusPatch struct {
	FocusDate string `json:"focus_date"`
	Focus     string `json:"focus"`
	// Slots is set for Bento only.
	Slots *string `json:"focus_slots,omitempty"`
}

// bentoSize is the slot an estimate suggests ("" without a usable one).
func bentoSize(est *int) string {
	switch {
	case est == nil || *est <= 0:
		return ""
	case *est <= 30:
		return "S"
	case *est >= 90:
		return "L"
	}
	return "M"
}

// PlanSetFocus sets today's focus to ids: open tasks only, in order. Three
// tasks keeps the first three; Bento ("bento") places by estimate, then in the
// first free slot in Frog order, and leaves out what finds no slot. order is
// "summit" or Frog.
func PlanSetFocus(ids []string, tasks map[string]FocusTask, style, order, today string) FocusPatch {
	var open []string
	seen := map[string]bool{}
	for _, id := range ids {
		if t, ok := tasks[id]; ok && t.Open && !seen[id] {
			seen[id] = true
			open = append(open, id)
		}
	}
	if style != "bento" {
		if len(open) > FocusMax {
			open = open[:FocusMax]
		}
		return FocusPatch{FocusDate: today, Focus: strings.Join(open, ",")}
	}
	slots := map[string]string{}
	placed := map[string]bool{}
	for _, id := range open {
		if s := bentoSize(tasks[id].Estimate); s != "" && slots[s] == "" {
			slots[s], placed[id] = id, true
		}
	}
	for _, id := range open {
		if placed[id] {
			continue
		}
		for _, s := range []string{"L", "M", "S"} {
			if slots[s] == "" {
				slots[s], placed[id] = id, true
				break
			}
		}
	}
	listing := []string{"L", "M", "S"}
	if order == "summit" {
		listing = []string{"M", "L", "S"}
	}
	var focus, entries []string
	for _, s := range listing {
		if id := slots[s]; id != "" {
			focus = append(focus, id)
			entries = append(entries, s+":"+id)
		}
	}
	joined := strings.Join(entries, ",")
	return FocusPatch{FocusDate: today, Focus: strings.Join(focus, ","), Slots: &joined}
}
