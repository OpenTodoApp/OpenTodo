package ruleval

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"time"
)

// StepActions is a Change tasks step's `set`: a rule's actions extended with
// energy and moving to the Trash (design D4).
type StepActions struct {
	Actions
	// HasActions is false when only energy or trash were given.
	HasActions bool
	// Energy is deep, medium, low or "clear".
	Energy *string
	Trash  bool
}

// ParseStepActions decodes a `set` value: at least one key.
func ParseStepActions(raw json.RawMessage) (StepActions, error) {
	var out StepActions
	m, err := members(raw, "set")
	if err != nil {
		return out, err
	}
	rest := map[string]json.RawMessage{}
	for k, v := range m {
		switch k {
		case "energy":
			var s string
			if json.Unmarshal(v, &s) != nil || !slices.Contains([]string{"deep", "medium", "low", "clear"}, s) {
				return out, errors.New(`set.energy must be "deep", "medium", "low" or "clear"`)
			}
			out.Energy = &s
		case "trash":
			if string(v) != "true" {
				return out, errors.New("set.trash must be true")
			}
			out.Trash = true
		default:
			rest[k] = v
		}
	}
	if len(rest) == 0 {
		if out.Energy == nil && !out.Trash {
			return out, errors.New("set must hold at least one change")
		}
		return out, nil
	}
	b, _ := json.Marshal(rest)
	if out.Actions, err = ParseActions(b); err != nil {
		return out, err
	}
	out.HasActions = true
	return out, nil
}

// Compare is an If step's test.
type Compare struct {
	// Op is >, >=, =, !=, <=, <, empty, not_empty or contains.
	Op string
	// Number or Text (a date is text YYYY-MM-DD) is what the value is compared with.
	Number *float64
	Text   *string
}

var compareOps = []string{">", ">=", "=", "!=", "<=", "<", "empty", "not_empty", "contains"}

// ParseCompare decodes {op: value}.
func ParseCompare(raw json.RawMessage) (Compare, error) {
	var c Compare
	m, err := members(raw, "is")
	if err != nil || len(m) != 1 {
		return c, fmt.Errorf("is must be one test of %v", compareOps)
	}
	for op, v := range m {
		if !slices.Contains(compareOps, op) {
			return c, fmt.Errorf("is must be one test of %v", compareOps)
		}
		c.Op = op
		switch op {
		case "empty", "not_empty":
			if string(v) != "true" {
				return c, fmt.Errorf("is.%s must be true", op)
			}
		case "contains":
			var s string
			if json.Unmarshal(v, &s) != nil || s == "" || checkText(s, 500) != "" {
				return c, errors.New("is.contains must be a text of 1 to 500 characters")
			}
			c.Text = &s
		default:
			var n float64
			var s string
			switch {
			case json.Unmarshal(v, &n) == nil && !math.IsNaN(n) && !math.IsInf(n, 0):
				c.Number = &n
			case json.Unmarshal(v, &s) == nil && checkText(s, 500) == "":
				c.Text = &s
			default:
				return c, fmt.Errorf("is.%s must be a number, a date or a text", op)
			}
		}
	}
	return c, nil
}

// Period is a Tracked time step's period: a word or {from, to} (dates).
type Period struct {
	Word     string
	From, To string
}

var periodWords = []string{"today", "this_week", "last_week", "this_month"}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func validDate(s string) bool {
	if !dateRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// ParsePeriod decodes a period.
func ParsePeriod(raw json.RawMessage) (Period, error) {
	var p Period
	if s, ok := word(raw); ok {
		if !slices.Contains(periodWords, s) {
			return p, fmt.Errorf("period must be one of %v or {from, to}", periodWords)
		}
		p.Word = s
		return p, nil
	}
	var r struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if strict(raw, &r, "period") != nil || !validDate(r.From) || !validDate(r.To) || r.From > r.To {
		return p, errors.New("period must be a word or {from, to} with dates YYYY-MM-DD, from not after to")
	}
	p.From, p.To = r.From, r.To
	return p, nil
}

// Range resolves a period to dates [from, to] given today and the first day of the week.
func (p Period) Range(today string, weekStart time.Weekday) (string, string) {
	switch p.Word {
	case "today":
		return today, today
	case "this_week", "last_week":
		t, _ := time.Parse("2006-01-02", today)
		back := (int(t.Weekday()) - int(weekStart) + 7) % 7
		start := t.AddDate(0, 0, -back)
		if p.Word == "last_week" {
			start = start.AddDate(0, 0, -7)
		}
		end := start.AddDate(0, 0, 6)
		if p.Word == "this_week" {
			end = t
		}
		return start.Format("2006-01-02"), end.Format("2006-01-02")
	case "this_month":
		return today[:8] + "01", today
	}
	return p.From, p.To
}

// Where is a Filter step's test: a condition over tasks, or a text test over lines.
type Where struct {
	Condition *Condition
	// Contains or NotContains (case-insensitive) for lines.
	Contains    *string
	NotContains *string
}

// ParseWhere decodes a where value.
func ParseWhere(raw json.RawMessage) (Where, error) {
	var w Where
	m, err := members(raw, "where")
	if err != nil {
		return w, err
	}
	if len(m) == 1 {
		for k, v := range m {
			if k == "contains" || k == "not_contains" {
				var s string
				if json.Unmarshal(v, &s) != nil || s == "" || checkText(s, 500) != "" {
					return w, fmt.Errorf("where.%s must be a text of 1 to 500 characters", k)
				}
				if k == "contains" {
					w.Contains = &s
				} else {
					w.NotContains = &s
				}
				return w, nil
			}
		}
	}
	c, err := ParseCondition(raw)
	if err != nil {
		return w, err
	}
	w.Condition = &c
	return w, nil
}

// IsText reports a text test (over lines) rather than a condition.
func (w Where) IsText() bool { return w.Condition == nil }

// DateLit is a date literal: a date, a word or a number of days from today.
type DateLit struct {
	Date   string
	Word   string
	InDays int
}

// DateLiteral decodes a date literal.
func DateLiteral(raw json.RawMessage) (DateLit, bool) {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if s == "today" || s == "tomorrow" {
			return DateLit{Word: s}, true
		}
		if validDate(s) {
			return DateLit{Date: s}, true
		}
		return DateLit{}, false
	}
	var d struct {
		InDays *int `json:"in_days"`
	}
	if strict(raw, &d, "date") != nil || d.InDays == nil || *d.InDays < -MaxDays || *d.InDays > MaxDays {
		return DateLit{}, false
	}
	return DateLit{Word: "in_days", InDays: *d.InDays}, true
}

// Resolve is the literal's date given today.
func (d DateLit) Resolve(today string) string {
	switch d.Word {
	case "today":
		return today
	case "tomorrow":
		return AddDays(today, 1)
	case "in_days":
		return AddDays(today, d.InDays)
	}
	return d.Date
}
