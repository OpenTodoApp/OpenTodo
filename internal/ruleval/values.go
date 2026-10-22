// Package ruleval holds the values of an automation rule (OpenSpec change
// automation-rules, design D1 to D4): the trigger, the condition and the actions
// as decoded shapes with their checks, and the condition matcher shared with the
// web client through match.vectors.json. It is a leaf package: internal/sync
// calls the checks for the rule entity's kinds, and the engine in internal/rules
// uses the decoded shapes. Nothing here reads or writes storage.
package ruleval

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/origin"
)

// Bounds of the values (spec "Rule validation").
const (
	MaxIDs          = 32
	MaxIDLen        = 64
	MaxComment      = 2000
	MaxDays         = 365
	MaxMinutes      = 100_000
	MaxRulesPerUser = 50
)

// Trigger kinds (spec "Rule validation").
const (
	TaskCreated   = "task.created"
	TaskCompleted = "task.completed"
	TaskReopened  = "task.reopened"
	LabelAdded    = "label.added"
	LabelRemoved  = "label.removed"
	AssignedToMe  = "assigned.to_me"
	TaskMoved     = "task.moved"
	DueReached    = "due.reached"
	Overdue       = "overdue"
	Schedule      = "schedule"
)

// TriggerKinds is the closed set of trigger kinds.
var TriggerKinds = []string{TaskCreated, TaskCompleted, TaskReopened, LabelAdded, LabelRemoved, AssignedToMe, TaskMoved, DueReached, Overdue, Schedule}

// IsTimeTrigger reports the kinds the scheduler fires (the rest come from batches).
func IsTimeTrigger(kind string) bool {
	return kind == DueReached || kind == Overdue || kind == Schedule
}

// Trigger is a decoded trigger.
type Trigger struct {
	Kind      string  `json:"kind"`
	LabelID   string  `json:"label_id,omitempty"`
	ProjectID string  `json:"project_id,omitempty"`
	SectionID *string `json:"section_id,omitempty"`
	At        string  `json:"at,omitempty"`
	Weekdays  []int   `json:"weekdays,omitempty"`
}

var hhmm = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

func members(raw json.RawMessage, what string) (map[string]json.RawMessage, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return nil, fmt.Errorf("%s must be an object", what)
	}
	return m, nil
}

func onlyKeys(m map[string]json.RawMessage, what string, allowed ...string) error {
	for k := range m {
		if !slices.Contains(allowed, k) {
			return fmt.Errorf("%s does not allow %q", what, k)
		}
	}
	return nil
}

func checkID(id, what string) error {
	if id == "" || len(id) > MaxIDLen {
		return fmt.Errorf("%s must be an id of 1 to %d characters", what, MaxIDLen)
	}
	return nil
}

func checkIDs(list []string, what string) error {
	if len(list) > MaxIDs {
		return fmt.Errorf("%s may hold at most %d ids", what, MaxIDs)
	}
	for _, id := range list {
		if err := checkID(id, what); err != nil {
			return err
		}
	}
	return nil
}

func strict(raw json.RawMessage, v any, what string) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s has a member of the wrong type", what)
	}
	return nil
}

// ParseTrigger decodes and checks a trigger value.
func ParseTrigger(raw json.RawMessage) (Trigger, error) {
	var t Trigger
	m, err := members(raw, "trigger")
	if err != nil {
		return t, err
	}
	var kind string
	if json.Unmarshal(m["kind"], &kind) != nil || !slices.Contains(TriggerKinds, kind) {
		return t, fmt.Errorf("trigger.kind must be one of %v", TriggerKinds)
	}
	allowed := map[string][]string{
		LabelAdded:   {"kind", "label_id"},
		LabelRemoved: {"kind", "label_id"},
		TaskMoved:    {"kind", "project_id", "section_id"},
		Schedule:     {"kind", "at", "weekdays"},
	}[kind]
	if allowed == nil {
		allowed = []string{"kind"}
	}
	if err := onlyKeys(m, "trigger "+kind, allowed...); err != nil {
		return t, err
	}
	if err := strict(raw, &t, "trigger"); err != nil {
		return t, err
	}
	switch kind {
	case LabelAdded, LabelRemoved:
		if err := checkID(t.LabelID, "trigger.label_id"); err != nil {
			return t, err
		}
	case TaskMoved:
		if err := checkID(t.ProjectID, "trigger.project_id"); err != nil {
			return t, err
		}
		if t.SectionID != nil {
			if err := checkID(*t.SectionID, "trigger.section_id"); err != nil {
				return t, err
			}
		}
	case Schedule:
		if !hhmm.MatchString(t.At) {
			return t, errors.New("trigger.at must be a time HH:MM")
		}
		if len(t.Weekdays) == 0 || len(t.Weekdays) > 7 {
			return t, errors.New("trigger.weekdays must list 1 to 7 weekdays (1 is Monday)")
		}
		seen := map[int]bool{}
		for _, d := range t.Weekdays {
			if d < 1 || d > 7 || seen[d] {
				return t, errors.New("trigger.weekdays must be distinct days from 1 (Monday) to 7 (Sunday)")
			}
			seen[d] = true
		}
	}
	return t, nil
}

// Condition is a decoded condition: every predicate that is set must hold.
type Condition struct {
	Project  *ProjectPred
	Section  *SectionPred
	Labels   *LabelsPred
	Priority []int
	Due      *DatePred
	Deadline *DatePred
	Start    string
	Evening  *bool
	Blocked  *bool
	Assignee string
	Origin   *OriginPred
	Habit    *bool
	Estimate *MinutesPred
	Tracked  *MinutesPred
}

// ProjectPred is `project`: one of the ids (and their sub-projects), or none.
type ProjectPred struct {
	None        bool
	In          []string
	Descendants bool
}

// SectionPred is `section`: one of the ids, or none.
type SectionPred struct {
	None bool
	In   []string
}

// LabelsPred is `labels`.
type LabelsPred struct {
	Any  []string `json:"any,omitempty"`
	All  []string `json:"all,omitempty"`
	None []string `json:"none,omitempty"`
}

// DatePred is `due` or `deadline`: a word (none, set, today, overdue) or within N days.
type DatePred struct {
	Word   string
	Within int
}

// OriginPred is `origin`: a kind, or none.
type OriginPred struct {
	None bool
	Kind string
}

// MinutesPred is `estimate` or `tracked`: none, at least, or at most.
type MinutesPred struct {
	None bool
	Min  *int
	Max  *int
}

// ConditionKeys is the closed set of predicate names.
var ConditionKeys = []string{"project", "section", "labels", "priority", "due", "deadline", "start", "evening", "blocked", "assignee", "origin", "habit", "estimate", "tracked"}

// ParseCondition decodes and checks a non-null condition value.
func ParseCondition(raw json.RawMessage) (Condition, error) {
	var c Condition
	m, err := members(raw, "condition")
	if err != nil {
		return c, err
	}
	if err := onlyKeys(m, "condition", ConditionKeys...); err != nil {
		return c, err
	}
	for k, v := range m {
		if err := c.parsePredicate(k, v); err != nil {
			return c, err
		}
	}
	return c, nil
}

func word(raw json.RawMessage) (string, bool) {
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return "", false
	}
	return s, true
}

func boolean(raw json.RawMessage, what string) (*bool, error) {
	var b bool
	if json.Unmarshal(raw, &b) != nil {
		return nil, fmt.Errorf("condition.%s must be true or false", what)
	}
	return &b, nil
}

func (c *Condition) parsePredicate(k string, v json.RawMessage) error {
	var err error
	switch k {
	case "project":
		c.Project, err = parseProjectPred(v)
	case "section":
		c.Section, err = parseSectionPred(v)
	case "labels":
		c.Labels, err = parseLabelsPred(v)
	case "priority":
		c.Priority, err = parsePriorityPred(v)
	case "due":
		c.Due, err = parseDatePred(v, "due", "none", "set", "today", "overdue")
	case "deadline":
		c.Deadline, err = parseDatePred(v, "deadline", "none", "set")
	case "start":
		s, ok := word(v)
		if !ok || !slices.Contains([]string{"someday", "deferred", "none"}, s) {
			return errors.New(`condition.start must be "someday", "deferred" or "none"`)
		}
		c.Start = s
	case "assignee":
		s, ok := word(v)
		if !ok || !slices.Contains([]string{"me", "none", "anyone"}, s) {
			return errors.New(`condition.assignee must be "me", "none" or "anyone"`)
		}
		c.Assignee = s
	case "evening":
		c.Evening, err = boolean(v, k)
	case "blocked":
		c.Blocked, err = boolean(v, k)
	case "habit":
		c.Habit, err = boolean(v, k)
	case "origin":
		c.Origin, err = parseOriginPred(v)
	case "estimate":
		c.Estimate, err = parseMinutesPred(v, "estimate", true)
	case "tracked":
		c.Tracked, err = parseMinutesPred(v, "tracked", false)
	}
	return err
}

func parseProjectPred(v json.RawMessage) (*ProjectPred, error) {
	if s, ok := word(v); ok {
		if s != "none" {
			return nil, errors.New(`condition.project must be "none" or {in: [ids], descendants?}`)
		}
		return &ProjectPred{None: true}, nil
	}
	var p struct {
		In          []string `json:"in"`
		Descendants bool     `json:"descendants"`
	}
	if err := strict(v, &p, "condition.project"); err != nil {
		return nil, err
	}
	if len(p.In) == 0 {
		return nil, errors.New("condition.project.in must name at least one project")
	}
	if err := checkIDs(p.In, "condition.project.in"); err != nil {
		return nil, err
	}
	return &ProjectPred{In: p.In, Descendants: p.Descendants}, nil
}

func parseSectionPred(v json.RawMessage) (*SectionPred, error) {
	if s, ok := word(v); ok {
		if s != "none" {
			return nil, errors.New(`condition.section must be "none" or {in: [ids]}`)
		}
		return &SectionPred{None: true}, nil
	}
	var p struct {
		In []string `json:"in"`
	}
	if err := strict(v, &p, "condition.section"); err != nil {
		return nil, err
	}
	if len(p.In) == 0 {
		return nil, errors.New("condition.section.in must name at least one section")
	}
	if err := checkIDs(p.In, "condition.section.in"); err != nil {
		return nil, err
	}
	return &SectionPred{In: p.In}, nil
}

func parseLabelsPred(v json.RawMessage) (*LabelsPred, error) {
	var p LabelsPred
	if err := strict(v, &p, "condition.labels"); err != nil {
		return nil, err
	}
	if len(p.Any)+len(p.All)+len(p.None) == 0 {
		return nil, errors.New("condition.labels needs any, all or none")
	}
	for name, l := range map[string][]string{"any": p.Any, "all": p.All, "none": p.None} {
		if err := checkIDs(l, "condition.labels."+name); err != nil {
			return nil, err
		}
	}
	return &p, nil
}

func parsePriorityPred(v json.RawMessage) ([]int, error) {
	var p struct {
		In []int `json:"in"`
	}
	if err := strict(v, &p, "condition.priority"); err != nil {
		return nil, err
	}
	if len(p.In) == 0 || len(p.In) > 4 {
		return nil, errors.New("condition.priority.in must list 1 to 4 priorities")
	}
	for _, x := range p.In {
		if x < 1 || x > 4 {
			return nil, errors.New("condition.priority.in holds priorities from 1 to 4")
		}
	}
	return p.In, nil
}

func parseDatePred(v json.RawMessage, what string, words ...string) (*DatePred, error) {
	if s, ok := word(v); ok {
		if !slices.Contains(words, s) {
			return nil, fmt.Errorf("condition.%s must be one of %v or {within_days}", what, words)
		}
		return &DatePred{Word: s}, nil
	}
	var p struct {
		WithinDays *int `json:"within_days"`
	}
	if err := strict(v, &p, "condition."+what); err != nil || p.WithinDays == nil {
		return nil, fmt.Errorf("condition.%s must be one of %v or {within_days}", what, words)
	}
	if *p.WithinDays < 0 || *p.WithinDays > MaxDays {
		return nil, fmt.Errorf("condition.%s.within_days must be from 0 to %d", what, MaxDays)
	}
	return &DatePred{Word: "within", Within: *p.WithinDays}, nil
}

func parseOriginPred(v json.RawMessage) (*OriginPred, error) {
	if s, ok := word(v); ok {
		if s != "none" {
			return nil, errors.New(`condition.origin must be "none" or {kind}`)
		}
		return &OriginPred{None: true}, nil
	}
	var p struct {
		Kind string `json:"kind"`
	}
	if err := strict(v, &p, "condition.origin"); err != nil || !slices.Contains(origin.Kinds, p.Kind) {
		return nil, fmt.Errorf("condition.origin.kind must be one of %v", origin.Kinds)
	}
	return &OriginPred{Kind: p.Kind}, nil
}

func parseMinutesPred(v json.RawMessage, what string, allowMax bool) (*MinutesPred, error) {
	if s, ok := word(v); ok {
		if s != "none" {
			return nil, fmt.Errorf(`condition.%s must be "none" or {min_minutes}`, what)
		}
		return &MinutesPred{None: true}, nil
	}
	var p struct {
		Min *int `json:"min_minutes"`
		Max *int `json:"max_minutes"`
	}
	if err := strict(v, &p, "condition."+what); err != nil {
		return nil, err
	}
	if (p.Min == nil) == (p.Max == nil) || (p.Max != nil && !allowMax) {
		return nil, fmt.Errorf("condition.%s takes exactly one bound", what)
	}
	for _, x := range []*int{p.Min, p.Max} {
		if x != nil && (*x < 0 || *x > MaxMinutes) {
			return nil, fmt.Errorf("condition.%s minutes must be from 0 to %d", what, MaxMinutes)
		}
	}
	return &MinutesPred{Min: p.Min, Max: p.Max}, nil
}

// Actions is a decoded actions value (spec "Actions"): the on-drop keys plus the
// automation keys. Due is either a word or InDays.
type Actions struct {
	AddLabels    []string
	RemoveLabels []string
	Priority     *int
	Due          *DueAction
	Start        *string
	Section      *SectionAction
	State        *string
	Deadline     *DueAction
	Assignee     *string
	Comment      *string
	Notify       bool
	WebhookID    string
}

// DueAction is a date action: a word (today, tomorrow, next-week, clear) or in N days.
type DueAction struct {
	Word   string
	InDays int
}

// SectionAction moves a task into a project and one of its sections (or none).
type SectionAction struct {
	ProjectID string  `json:"project_id"`
	SectionID *string `json:"section_id"`
}

// OnDropKeys are the keys of a board column's on_drop rule (rule-boards D2).
var OnDropKeys = []string{"add_labels", "remove_labels", "priority", "due", "start", "section", "state"}

// ActionKeys are the keys of an automation rule's actions: the on-drop keys and more.
var ActionKeys = append(slices.Clone(OnDropKeys), "deadline", "assignee", "comment", "notify", "webhook")

// CheckKeys refuses members outside allowed (shared with the on_drop check in internal/sync).
func CheckKeys(m map[string]json.RawMessage, allowed []string, what string) error {
	for k := range m {
		if !slices.Contains(allowed, k) {
			return fmt.Errorf("unknown %s key %q (allowed: %v)", what, k, allowed)
		}
	}
	return nil
}

// ParseActions decodes and checks an actions value: at least one known key.
func ParseActions(raw json.RawMessage) (Actions, error) {
	var a Actions
	m, err := members(raw, "actions")
	if err != nil {
		return a, err
	}
	if len(m) == 0 {
		return a, errors.New("actions must hold at least one action")
	}
	if err := CheckKeys(m, ActionKeys, "action"); err != nil {
		return a, err
	}
	for k, v := range m {
		if err := a.parseAction(k, v); err != nil {
			return a, err
		}
	}
	return a, nil
}

func (a *Actions) parseAction(k string, v json.RawMessage) error {
	switch k {
	case "add_labels", "remove_labels":
		var l []string
		if json.Unmarshal(v, &l) != nil {
			return fmt.Errorf("actions.%s must be a list of label ids", k)
		}
		if err := checkIDs(l, "actions."+k); err != nil {
			return err
		}
		if k == "add_labels" {
			a.AddLabels = l
		} else {
			a.RemoveLabels = l
		}
	case "priority":
		var p int
		if json.Unmarshal(v, &p) != nil || p < 1 || p > 4 {
			return errors.New("actions.priority must be from 1 (highest) to 4 (lowest)")
		}
		a.Priority = &p
	case "due":
		d, err := parseDueAction(v, "due", "today", "tomorrow", "next-week", "clear")
		if err != nil {
			return err
		}
		a.Due = d
	case "deadline":
		d, err := parseDueAction(v, "deadline", "clear")
		if err != nil {
			return err
		}
		a.Deadline = d
	case "start":
		return oneWord(v, "actions.start", &a.Start, "someday", "clear")
	case "state":
		return oneWord(v, "actions.state", &a.State, "complete", "reopen")
	case "assignee":
		return oneWord(v, "actions.assignee", &a.Assignee, "me", "clear")
	case "section":
		var s SectionAction
		if err := strict(v, &s, "actions.section"); err != nil {
			return errors.New(`actions.section must be {"project_id":"…","section_id":"…"|null}`)
		}
		if err := checkID(s.ProjectID, "actions.section.project_id"); err != nil {
			return err
		}
		if s.SectionID != nil {
			if err := checkID(*s.SectionID, "actions.section.section_id"); err != nil {
				return err
			}
		}
		a.Section = &s
	case "comment":
		var c struct {
			Text string `json:"text"`
		}
		if err := strict(v, &c, "actions.comment"); err != nil || c.Text == "" || utf8.RuneCountInString(c.Text) > MaxComment || !utf8.ValidString(c.Text) {
			return fmt.Errorf("actions.comment must be {text} with 1 to %d characters", MaxComment)
		}
		a.Comment = &c.Text
	case "notify":
		var b bool
		if json.Unmarshal(v, &b) != nil || !b {
			return errors.New("actions.notify must be true")
		}
		a.Notify = true
	case "webhook":
		var w struct {
			WebhookID string `json:"webhook_id"`
		}
		if err := strict(v, &w, "actions.webhook"); err != nil {
			return errors.New("actions.webhook must be {webhook_id}")
		}
		if err := checkID(w.WebhookID, "actions.webhook.webhook_id"); err != nil {
			return err
		}
		a.WebhookID = w.WebhookID
	}
	return nil
}

func oneWord(v json.RawMessage, what string, dst **string, allowed ...string) error {
	s, ok := word(v)
	if !ok || !slices.Contains(allowed, s) {
		return fmt.Errorf("%s must be one of %v", what, allowed)
	}
	*dst = &s
	return nil
}

func parseDueAction(v json.RawMessage, what string, words ...string) (*DueAction, error) {
	if s, ok := word(v); ok {
		if !slices.Contains(words, s) {
			return nil, fmt.Errorf("actions.%s must be one of %v or {in_days}", what, words)
		}
		return &DueAction{Word: s}, nil
	}
	var p struct {
		InDays *int `json:"in_days"`
	}
	if err := strict(v, &p, "actions."+what); err != nil || p.InDays == nil {
		return nil, fmt.Errorf("actions.%s must be one of %v or {in_days}", what, words)
	}
	if *p.InDays < 0 || *p.InDays > MaxDays {
		return nil, fmt.Errorf("actions.%s.in_days must be from 0 to %d", what, MaxDays)
	}
	return &DueAction{Word: "in_days", InDays: *p.InDays}, nil
}

// CheckTrigger, CheckCondition and CheckActions are the sync kind checks.
func CheckTrigger(raw json.RawMessage) error { _, err := ParseTrigger(raw); return err }

// CheckCondition checks a non-null condition.
func CheckCondition(raw json.RawMessage) error { _, err := ParseCondition(raw); return err }

// CheckActions checks an actions value.
func CheckActions(raw json.RawMessage) error { _, err := ParseActions(raw); return err }
