package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The AI steps of routines (OpenSpec change routines-ai-step): Ask AI and
// Summarise make one provider call each through the assistant (D1), within
// the routine's daily token budget (D11); a run of a routine with an AI step
// is a proposal unless the routine is in effective auto mode (D2, D4, D5).

// AI makes a routine's provider calls for the run-as user (the assistant's
// single-shot completion, wired by internal/httpapi).
type AI interface {
	Complete(ctx context.Context, uid string, c AICall) (AIAnswer, error)
	// Estimate is a call's expected tokens before it is made.
	Estimate(c AICall) int64
}

// AICall is one AI step's request: the instruction, the material (sent as
// untrusted text), the answer form and its maximum.
type AICall struct {
	Instruction string
	Context     []string
	Answer      string
	MaxTokens   int64
}

// AIAnswer is the answer and its tokens.
type AIAnswer struct {
	Text          string
	Lines         []string
	Input, Output int64
}

// AIError is a call that gave no answer; Code is the failed step's error code
// (ai_not_configured, ai_no_consent, ai_refused, ai_truncated,
// assistant_quota, or a provider error code).
type AIError struct {
	Code string
	Msg  string
}

func (e *AIError) Error() string { return e.Code + ": " + e.Msg }

// Answer maxima of an AI step (tokens; the assistant's routine limits).
const (
	aiTextTokens   = 1000
	aiLinesTokens  = 2000
	aiShortTokens  = 200
	aiMediumTokens = 400
)

// The daily token budget per routine (D11).
const (
	DefaultAIBudget = 20_000
	MinAIBudget     = 1_000
	MaxAIBudget     = 200_000
)

// AIStepTime is what each AI step adds to a run's time limit (D1).
const AIStepTime = 90 * time.Second

// ErrCodeAIBudget fails an AI step whose call would pass the daily budget.
const ErrCodeAIBudget = "ai_budget"

// AIBudget reads rule.ai_budget: 0 (or anything out of range) as the default.
func AIBudget(v float64) int64 {
	n := int64(v)
	if n < MinAIBudget || n > MaxAIBudget {
		return DefaultAIBudget
	}
	return n
}

// ValidAIBudget reports whether a value may be saved as rule.ai_budget.
func ValidAIBudget(v float64) bool {
	return v == 0 || (v >= MinAIBudget && v <= MaxAIBudget && v == float64(int64(v)))
}

// aiCallOf builds a step's request from its inputs.
func (st *runState) aiCallOf(s *ruleval.Step, in map[string]ruleval.Value) AICall {
	if s.Kind == "summarise" {
		length, _ := lit[string](s, "length")
		c := AICall{Instruction: summaryInstruction(length), Answer: "text", MaxTokens: aiShortTokens}
		if length == "medium" {
			c.MaxTokens = aiMediumTokens
		}
		if v, ok := in["text"]; ok {
			c.Context = append(c.Context, st.material(v))
		}
		return c
	}
	c := AICall{Instruction: st.litText(s.In["instruction"].Lit), Answer: ruleval.AIAnswer(s), MaxTokens: aiTextTokens}
	if c.Answer == "lines" {
		c.MaxTokens = aiLinesTokens
	}
	for _, name := range []string{"context", "context2", "context3"} {
		if v, ok := in[name]; ok {
			c.Context = append(c.Context, st.material(v))
		}
	}
	return c
}

func summaryInstruction(length string) string {
	if length == "medium" {
		return "Summarise the material in about 150 words."
	}
	return "Summarise the material in about 50 words."
}

// material is a value as the model reads it (D1): text and lines as they
// are; tasks with title, due, priority, labels and project; a project with its
// name, sections and open tasks.
func (st *runState) material(v ruleval.Value) string {
	switch v.Type {
	case ruleval.TTask:
		return st.taskLine(v.ID)
	case ruleval.TTasks:
		lines := make([]string, 0, len(v.IDs))
		for _, id := range v.IDs {
			lines = append(lines, st.taskLine(id))
		}
		return strings.Join(lines, "\n")
	case ruleval.TProject:
		p := st.projects[v.ID]
		var b strings.Builder
		b.WriteString("Project: " + str(p, "name"))
		var sections []string
		for id, pid := range st.w.sections {
			if pid == v.ID && st.w.sectionName[id] != "" {
				sections = append(sections, st.w.sectionName[id])
			}
		}
		slices.Sort(sections)
		if len(sections) > 0 {
			b.WriteString("\nSections: " + strings.Join(sections, ", "))
		}
		var open []string
		for id, t := range st.tasks {
			if str(t, "project_id") == v.ID && opsync.IsNull(t["completed_at"]) && opsync.IsNull(t["deleted_at"]) {
				open = append(open, id)
			}
		}
		slices.Sort(open)
		if len(open) > ruleval.MaxListItems {
			open = open[:ruleval.MaxListItems]
		}
		if len(open) > 0 {
			b.WriteString("\nOpen tasks:")
			for _, id := range open {
				b.WriteString("\n" + st.taskLine(id))
			}
		}
		return b.String()
	}
	return st.render(v)
}

// taskLine is one task for the model: "- title (due …, priority …, labels …, project …)".
func (st *runState) taskLine(id string) string {
	t := st.tasks[id]
	var parts []string
	var due struct {
		Date string `json:"date"`
		Time string `json:"time"`
	}
	if json.Unmarshal(t["due"], &due) == nil && due.Date != "" {
		parts = append(parts, strings.TrimSpace("due "+due.Date+" "+due.Time))
	}
	if p := int(num(t, "priority")); p >= 1 && p <= 3 {
		parts = append(parts, "priority "+strconv.Itoa(p))
	}
	var labels []string
	_ = json.Unmarshal(t["labels"], &labels)
	var names []string
	for _, l := range labels {
		if n := st.w.labelName[l]; n != "" {
			names = append(names, n)
		}
	}
	if len(names) > 0 {
		parts = append(parts, "labels "+strings.Join(names, ", "))
	}
	if pid := str(t, "project_id"); pid != "" {
		if n := str(st.projects[pid], "name"); n != "" {
			parts = append(parts, "project "+n)
		}
	}
	line := "- " + str(t, "title")
	if len(parts) > 0 {
		line += " (" + strings.Join(parts, ", ") + ")"
	}
	return line
}

// aiStep runs an Ask AI or Summarise step: the estimate always (a preview
// shows it), the call only when the run calls the model (real runs, and tests
// the person confirmed), within the daily budget.
func (st *runState) aiStep(s *ruleval.Step, in map[string]ruleval.Value, at int) (ruleval.Value, string, error) {
	call := st.aiCallOf(s, in)
	empty := ruleval.Value{Type: ruleval.TText}
	if s.Kind == "ask_ai" && call.Answer == "lines" {
		empty = ruleval.Value{Type: ruleval.TLines, Lines: []string{}}
	}
	if st.e.AI == nil {
		return empty, "", failf(ruleval.ReasonAINotConfigured, "the assistant is not set up for you on this server")
	}
	est := st.e.AI.Estimate(call)
	st.records[at].Estimate += est
	if !st.callAI {
		return empty, StepSkipped, nil
	}
	day := time.UnixMilli(st.nowMs).UTC().Format(time.DateOnly)
	used, err := st.e.Store.aiTokens(st.ctx, st.r.ID, day)
	if err != nil {
		return empty, "", err
	}
	if used+st.aiTokens+est > st.r.AIBudget {
		return empty, "", failf(ErrCodeAIBudget, "Daily AI budget reached: %d of %d tokens used today, this step needs about %d", used+st.aiTokens, st.r.AIBudget, est)
	}
	ans, err := st.e.AI.Complete(st.ctx, st.w.uid, call)
	tokens := ans.Input + ans.Output
	st.records[at].Tokens += tokens
	st.aiTokens += tokens
	if tokens > 0 && st.r.ID != draftID {
		if uerr := st.e.Store.addAITokens(context.WithoutCancel(st.ctx), st.r.ID, st.w.uid, day, tokens); uerr != nil {
			st.e.Log.Warn("routines: AI tokens not recorded", "rule", st.r.ID, "err", uerr)
		}
	}
	if err != nil {
		var ae *AIError
		if errors.As(err, &ae) {
			return empty, "", failf(ae.Code, "%s", ae.Msg)
		}
		return empty, "", err
	}
	if call.Answer == "lines" && s.Kind == "ask_ai" {
		lines := ans.Lines
		if len(lines) > ruleval.MaxListItems {
			lines = lines[:ruleval.MaxListItems]
		}
		st.aiTexts = append(st.aiTexts, lines...)
		return ruleval.Value{Type: ruleval.TLines, Lines: lines}, "", nil
	}
	st.aiTexts = append(st.aiTexts, ans.Text)
	return st.textOut(ans.Text)
}

// draftID is the id of an unsaved routine's test (no budget is kept for it).
const draftID = "draft"

// ---- effective mode (D4, D5, D6) ----

// Fallback reasons (D5), and "agent" when an agent wrote ai_apply or edited
// the routine after it was turned on (D6).
const (
	FallbackLimit      = "limit"
	FallbackFailures   = "failures"
	FallbackDisallowed = "disallowed_write"
	FallbackAgent      = "agent"
)

// AIMode is how a routine with AI steps runs: Auto when it applies the AI's
// results itself, otherwise as proposals; Asked is ai_apply = "auto"; Reason
// and At say why auto mode is off although asked.
type AIMode struct {
	Auto     bool   `json:"auto"`
	Asked    bool   `json:"asked"`
	Reason   string `json:"reason,omitempty"`
	At       int64  `json:"at,omitempty"`
	Failures int    `json:"failures"`
}

// agentDevice reports a device of an AI agent or assistant, or of a rule:
// none of them may turn on Apply without asking (D6).
func agentDevice(device string) bool {
	return opsync.IsAgentDevice(device) || strings.HasPrefix(device, opsync.AssistantDevicePrefix) || strings.HasPrefix(device, opsync.RuleDevicePrefix)
}

// fieldMeta is a field's winning value with its op's time and device.
type fieldMeta struct {
	value  string
	ts     int64
	device string
}

// AIMode reads a routine's effective mode: auto only when ai_apply is "auto"
// from the person (not an agent), no agent edited its trigger, condition or
// steps since, and no fallback is newer than the winning ai_apply op.
func (e *Engine) AIMode(ctx context.Context, uid, ruleID string) (AIMode, error) {
	var m AIMode
	scope := "user:" + uid
	pid, err := e.ruleProject(ctx, ruleID)
	if err != nil {
		return m, err
	}
	if pid != "" {
		scope = opsync.ProjectScope(pid)
	}
	rows, err := e.db.QueryContext(ctx, `SELECT field, value, ts, device FROM scope_fields WHERE scope_id = ? AND entity = 'rule' AND entity_id = ?
		AND field IN ('ai_apply', 'trigger', 'condition', 'steps', 'actions')`, scope, ruleID)
	if err != nil {
		return m, err
	}
	meta := map[string]fieldMeta{}
	for rows.Next() {
		var f string
		var fm fieldMeta
		if err := rows.Scan(&f, &fm.value, &fm.ts, &fm.device); err != nil {
			rows.Close()
			return m, err
		}
		meta[f] = fm
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return m, err
	}
	reason, at, failures, err := e.Store.aiState(ctx, ruleID)
	if err != nil {
		return m, err
	}
	m.Failures = failures
	apply, ok := meta["ai_apply"]
	if !ok || apply.value != `"auto"` {
		return m, nil
	}
	m.Asked = true
	if agentDevice(apply.device) {
		m.Reason = FallbackAgent
		return m, nil
	}
	if pid != "" && e.fieldAuthor(ctx, ruleID, "ai_apply", apply.ts, apply.device) != uid {
		// In a shared routine only the run-as person's own choice counts
		// (routines-shared D6).
		m.Reason = FallbackNotRunAs
		return m, nil
	}
	for _, f := range []string{"trigger", "condition", "steps", "actions"} {
		if x, ok := meta[f]; ok && agentDevice(x.device) && x.ts > apply.ts {
			m.Reason, m.At = FallbackAgent, x.ts
			return m, nil
		}
	}
	if reason != "" && at >= apply.ts {
		m.Reason, m.At = reason, at
		return m, nil
	}
	m.Auto = true
	return m, nil
}

// autoCheck is what an auto run's plan may not do (D4): "" when it may be
// written without asking, FallbackLimit past 20 items, FallbackDisallowed for
// a write auto mode does not allow.
func (st *runState) autoCheck() string {
	if _, what := ruleval.AutoBlocker(st.r.Steps); what != "" {
		return FallbackDisallowed
	}
	merged := mergeChanges(st.overlay)
	if len(merged) > ruleval.MaxAutoItems {
		return FallbackLimit
	}
	for _, m := range merged {
		switch m.entity {
		case "task":
			if m.create {
				continue
			}
			if st.completing[m.id] || !st.autoTaskPatch(m) {
				return FallbackDisallowed
			}
		case "comment", "label":
			if !m.create {
				return FallbackDisallowed
			}
		default:
			return FallbackDisallowed
		}
	}
	return ""
}

// autoTaskPatch reports whether a change of an existing task only sets the
// fields auto mode allows: labels only added, a section of its own project.
func (st *runState) autoTaskPatch(m merged) bool {
	base := st.w.tasks[m.id]
	for f, v := range m.patch {
		switch f {
		case "priority", "due", "start", "deadline", "energy":
		case "labels":
			var before, after []string
			_ = json.Unmarshal(base["labels"], &before)
			_ = json.Unmarshal(v, &after)
			for _, l := range before {
				if !slices.Contains(after, l) {
					return false
				}
			}
		case "section_id":
			var sid *string
			_ = json.Unmarshal(v, &sid)
			if sid != nil && st.w.sections[*sid] != str(base, "project_id") {
				return false
			}
		case "position":
			if _, moving := m.patch["section_id"]; !moving {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// aiTokens reads a routine's tokens of a UTC day.
func (s *Store) aiTokens(ctx context.Context, ruleID, day string) (int64, error) {
	var n int64
	err := s.db.QueryRowContext(ctx, `SELECT tokens FROM rule_ai_usage WHERE rule_id = ? AND day = ?`, ruleID, day).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return n, err
}

// addAITokens counts a call's tokens for the routine's day and drops days
// older than a week (the editor shows the last 7 days).
func (s *Store) addAITokens(ctx context.Context, ruleID, uid, day string, n int64) error {
	if _, err := s.db.ExecContext(ctx, `INSERT INTO rule_ai_usage (rule_id, user_id, day, tokens) VALUES (?, ?, ?, ?)
		ON CONFLICT(rule_id, day) DO UPDATE SET tokens = tokens + excluded.tokens`, ruleID, uid, day, n); err != nil {
		return err
	}
	old := s.now().UTC().AddDate(0, 0, -8).Format(time.DateOnly)
	_, err := s.db.ExecContext(ctx, `DELETE FROM rule_ai_usage WHERE day < ?`, old)
	return err
}

// AIUsageDay is one day of a routine's AI tokens.
type AIUsageDay struct {
	Day    string `json:"day"`
	Tokens int64  `json:"tokens"`
}

// AIUsage lists a routine's tokens of the last 7 UTC days, oldest first.
func (s *Store) AIUsage(ctx context.Context, uid, ruleID string) ([]AIUsageDay, error) {
	from := s.now().UTC().AddDate(0, 0, -6).Format(time.DateOnly)
	rows, err := s.db.QueryContext(ctx, `SELECT day, tokens FROM rule_ai_usage WHERE rule_id = ? AND user_id = ? AND day >= ? ORDER BY day`, ruleID, uid, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AIUsageDay{}
	for rows.Next() {
		var d AIUsageDay
		if err := rows.Scan(&d.Day, &d.Tokens); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// aiState reads a routine's fallback and its failed runs in a row.
func (s *Store) aiState(ctx context.Context, ruleID string) (reason string, at int64, failures int, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT ai_fallback_reason, ai_fallback_at, ai_failures FROM rule_state WHERE rule_id = ?`, ruleID).Scan(&reason, &at, &failures)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	return
}

// setFallback records that a routine left auto mode (D5) and starts the
// failure count again.
func (s *Store) setFallback(ctx context.Context, uid, ruleID, reason string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO rule_state (rule_id, user_id, ai_fallback_reason, ai_fallback_at, ai_failures) VALUES (?, ?, ?, ?, 0)
		ON CONFLICT(rule_id) DO UPDATE SET ai_fallback_reason = excluded.ai_fallback_reason, ai_fallback_at = excluded.ai_fallback_at, ai_failures = 0`,
		ruleID, uid, reason, s.now().UnixMilli())
	return err
}

// countRun counts a finished run of a routine with AI steps: a failure adds
// one, anything else starts again; it returns the failures in a row.
func (s *Store) countRun(ctx context.Context, uid, ruleID string, failed bool) (int, error) {
	if !failed {
		_, err := s.db.ExecContext(ctx, `UPDATE rule_state SET ai_failures = 0 WHERE rule_id = ?`, ruleID)
		return 0, err
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO rule_state (rule_id, user_id, ai_failures) VALUES (?, ?, 1)
		ON CONFLICT(rule_id) DO UPDATE SET ai_failures = ai_failures + 1`, ruleID, uid); err != nil {
		return 0, err
	}
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT ai_failures FROM rule_state WHERE rule_id = ?`, ruleID).Scan(&n)
	return n, err
}

// afterAIRun keeps the failure count of a routine with AI steps and falls
// back to proposals after two failed runs in a row while in auto mode (D5).
func (e *Engine) afterAIRun(ctx context.Context, uid string, r *rule, run Run) {
	if run.Test || !ruleval.HasAI(r.Steps) || run.Outcome == OutcomeWaiting {
		return
	}
	failed := run.Outcome == OutcomeFailed || run.Outcome == OutcomeStopped || run.Outcome == OutcomeMissed
	n, err := e.Store.countRun(ctx, uid, r.ID, failed)
	if err != nil {
		e.Log.Warn("routines: AI failures not counted", "rule", r.ID, "err", err)
		return
	}
	if n < 2 {
		return
	}
	if m, err := e.AIMode(ctx, uid, r.ID); err == nil && m.Auto {
		if err := e.Store.setFallback(ctx, uid, r.ID, FallbackFailures); err != nil {
			e.Log.Warn("routines: fallback not recorded", "rule", r.ID, "err", err)
		}
	}
}
