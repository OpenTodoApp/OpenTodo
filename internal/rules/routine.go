package rules

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/relay"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines (OpenSpec change routines-engine): a rule with steps. A run plans
// every step against the materialised rows and the changes the earlier steps
// planned, and writes only when the whole plan succeeded (design D5).

// Tools plans a step through the agent tool registry (agenttools.Registry):
// the validation and the planning of a change are one code path for agents,
// the assistant and routines (design D4, D11).
type Tools interface {
	Plan(ctx context.Context, c agenttools.Caller, name string, args json.RawMessage, overlay agenttools.ChangeSet) (agenttools.Plan, error)
}

// EnvFunc reports what step availability reads for a user (design D15).
type EnvFunc func(ctx context.Context, uid string) ruleval.Env

// Limits of a routine run (design D6).
const (
	RunTimeLimit = 60 * time.Second
	MaxWrites    = 500
)

// Error codes of a failed step (design D10).
const (
	ErrCodeTypeMismatch = "type_mismatch"
	ErrCodeNotFound     = "not_found"
	ErrCodeInvalid      = "invalid_argument"
	ErrCodeWriteLimit   = "write_limit"
	ErrCodeTimeLimit    = "time_limit"
	ErrCodeEncrypted    = "encrypted"
	ErrCodeIterations   = "iteration_limit"
	ErrCodeTenantLimit  = "tenant_limit"
	ErrCodeTaskRequired = "task_required"
)

// Manual run refusals.
var (
	ErrTaskRequired = errors.New("this routine reads the trigger's task: give task_id")
	ErrRateLimited  = errors.New("too many runs in the last minute")
	ErrPausedRule   = errors.New("the server paused this routine: turn it on again first")
	ErrOff          = errors.New("automations are turned off on this server")
	ErrInvalidDraft = errors.New("invalid routine")
)

// stepFail is a step that failed while planning: no later step runs and
// nothing is written.
type stepFail struct {
	code string
	msg  string
}

func (f *stepFail) Error() string { return f.code + ": " + f.msg }

func failf(code, format string, args ...any) *stepFail {
	return &stepFail{code: code, msg: fmt.Sprintf(format, args...)}
}

// errEnded is a Stop step: the run ends with outcome ended.
var errEnded = errors.New("ended")

// isRoutine reports a rule read through its steps (not the legacy actions).
func (r *rule) isRoutine() bool { return len(r.Steps) > 0 }

// triggerType is the type of the reference "trigger" for this rule.
func (r *rule) triggerType() ruleval.Type {
	return ruleval.TriggerOutput(r.Trigger.Kind, r.HasCondition)
}

// readsTrigger reports whether any step refers to the trigger's output.
func readsTrigger(steps []ruleval.Step) bool {
	found := false
	ruleval.Walk(steps, func(s *ruleval.Step) {
		for _, a := range s.In {
			if a.Ref == ruleval.RefTrigger {
				found = true
			}
			if txt, tmpl, ok := ruleval.TextLiteral(a.Lit); ok && (tmpl || s.Kind == "format") {
				for _, p := range ruleval.Placeholders(txt) {
					if p == ruleval.RefTrigger {
						found = true
					}
				}
			}
		}
	})
	return found
}

// StepPreview is one step of a test: its record, a preview of its output and
// the changes it planned. Previews go only to the user who asked and are
// never stored (design D8).
type StepPreview struct {
	StepRecord
	// Estimate is an AI step's expected tokens (routines-ai-step D11).
	Estimate int64                `json:"estimate,omitempty"`
	Preview  any                  `json:"preview,omitempty"`
	Changes  []agenttools.Change  `json:"changes,omitempty"`
	Warning  *ruleval.StepWarning `json:"warning,omitempty"`
}

// Result is the answer of a run, a test run or a dry run.
type Result struct {
	Run Run `json:"run"`
	// Steps carries previews for a test; for a real run it is the records.
	Steps []StepPreview `json:"steps"`
	// Writes is how many entities the run wrote, or would write.
	Writes int  `json:"writes"`
	Test   bool `json:"test"`
	// DeviceRun is what the device in hand runs (routines-ai-step D7).
	DeviceRun *relay.RoutineRun `json:"device_run,omitempty"`
}

// RunRequest is a manual run: the page, the palette, the CLI, REST or MCP.
type RunRequest struct {
	RuleID string
	// RunID is the client's UUID: a repeated request answers the first run.
	RunID  string
	TaskID string
	Test   bool
	// Source is manual or mcp.
	Source string
	// CallAI lets a test call the model for its AI steps (the person
	// confirmed the estimate, routines-ai-step D11); real runs always do.
	CallAI bool
	// Device and Session: Run now from the device in hand on an encrypted
	// account (routines-ai-step D7): the run waits for that device's commit
	// and is not sent over the relay. Session is the caller's session hash.
	Device  string
	Session string
}

// runState is one run in progress.
type runState struct {
	e        *Engine
	ctx      context.Context
	w        *world
	r        *rule
	caller   agenttools.Caller
	env      ruleval.Env
	key      string
	runID    string
	test     bool
	deadline time.Time
	start    time.Time
	nowMs    int64

	// tasks and projects are the rows with the planned changes laid over.
	tasks    map[string]opsync.Entity
	projects map[string]opsync.Entity
	overlay  agenttools.ChangeSet
	// completing marks planned completions (the write rolls a series forward).
	completing map[string]bool
	sides      []sideEffect
	vals       map[string]ruleval.Value
	trigger    ruleval.Value
	curItem    *ruleval.Value
	failedAt   int
	records    []StepPreview
	iterations int
	seq        int
	emails     int
	// AI steps (routines-ai-step): whether this run calls the model, the
	// tokens it used, and the AI's answers (to mark items "Written by AI").
	callAI   bool
	aiTokens int64
	aiTexts  []string
}

// sideEffect is a notification, a delivery or an email queued after commit.
type sideEffect struct {
	kind string
	run  func(ctx context.Context) error
	spec sideSpec
}

func (e *Engine) newRun(ctx context.Context, w *world, r *rule, key, runID string, test bool) *runState {
	now := e.now()
	st := &runState{e: e, ctx: ctx, w: w, r: r, key: key, runID: runID, test: test, start: now, deadline: now.Add(RunTimeLimit), nowMs: now.UnixMilli(),
		tasks: map[string]opsync.Entity{}, projects: map[string]opsync.Entity{}, completing: map[string]bool{}, vals: map[string]ruleval.Value{}, callAI: !test}
	// A run with AI steps may take 90 s more per AI step (routines-ai-step D1).
	ruleval.Walk(r.Steps, func(s *ruleval.Step) {
		if ruleval.IsAI(s.Kind) {
			st.deadline = st.deadline.Add(AIStepTime)
		}
	})
	for id, t := range w.tasks {
		st.tasks[id] = t
	}
	for id, p := range w.projectRows {
		st.projects[id] = p
	}
	st.caller = agenttools.Caller{UserID: w.uid, TokenID: Device(r.ID), TokenName: "routine", Scope: agenttools.ScopeRoutine, Encrypted: w.encrypted}
	if e.Env != nil {
		st.env = e.Env(ctx, w.uid)
	} else {
		st.env = ruleval.Env{Automations: true}
	}
	st.env.Automations = st.env.Automations && e.on(ctx)
	st.env.Encrypted = w.encrypted
	// A shared routine's steps follow its availability (routines-shared D3).
	st.env.Shared = w.project != ""
	return st
}

// plan runs every step in order. It returns the failed step's index (-1) and
// its failure, errEnded for a Stop, or nil.
func (st *runState) plan() (int, error) {
	err := st.list(st.r.Steps)
	if err == nil || errors.Is(err, errEnded) {
		return -1, err
	}
	return st.failedAt, err
}

func (st *runState) list(steps []ruleval.Step) error {
	for i := range steps {
		if err := st.step(&steps[i]); err != nil {
			return err
		}
	}
	return nil
}

func (st *runState) writesPlanned() int {
	seen := map[string]bool{}
	for _, c := range st.overlay {
		seen[c.Entity+"\x00"+c.EntityID] = true
	}
	return len(seen) + len(st.sides)
}

// step plans one step: availability, inputs, the step itself (once per item
// when it receives a list for a single input), its blocks and its record.
func (st *runState) step(s *ruleval.Step) error {
	began := time.Now()
	// A step inside a Repeat keeps one record over its iterations.
	at := slices.IndexFunc(st.records, func(r StepPreview) bool { return r.StepID == s.ID })
	again := at >= 0
	if !again {
		st.records = append(st.records, StepPreview{StepRecord: StepRecord{Idx: len(st.records), StepID: s.ID, Kind: s.Kind, Status: StepOK, IDs: []string{}}})
		at = len(st.records) - 1
	}
	finish := func(out ruleval.Value, status string, err error) error {
		r := &st.records[at]
		items := out.Len()
		if out.Type == ruleval.TNumber || out.Type == ruleval.TDate {
			items = 1
		}
		r.DurationMs += time.Since(began).Milliseconds()
		if out.Type != "" {
			r.OutType = string(out.Type)
		}
		if again {
			r.Items += items
		} else {
			r.Items = items
		}
		if err != nil {
			st.failedAt = at
		}
		if r.Status == StepOK && status != "" {
			r.Status = status
		}
		r.IDs = appendIDs(r.IDs, idsOf(out)...)
		if st.test {
			r.Preview = st.preview(out)
		}
		var f *stepFail
		switch {
		case errors.As(err, &f):
			if r.Status != StepUnavailable {
				r.Status = StepFailed
			}
			r.Error = f.code
		case errors.Is(err, errEnded):
			r.Status = StepEnded
		case err != nil:
			r.Status, r.Error = StepFailed, "internal"
		}
		return err
	}
	if st.e.now().After(st.deadline) {
		return finish(ruleval.Value{}, "", failf(ErrCodeTimeLimit, "the run took longer than %s", RunTimeLimit))
	}
	if a := ruleval.StepAvailable(s, st.env); !a.Available {
		st.records[at].Status = StepUnavailable
		return finish(ruleval.Value{}, "", failf("unavailable:"+a.Reason, "Not available: %s", ruleval.ReasonText(a.Reason)))
	}
	out, status, err := st.run(s, at)
	if err == nil && st.writesPlanned() > MaxWrites {
		err = failf(ErrCodeWriteLimit, "the run would write %d items, more than %d", st.writesPlanned(), MaxWrites)
	}
	if err == nil {
		st.vals[s.ID] = out
	}
	return finish(out, status, err)
}

func appendIDs(list []string, more ...string) []string {
	for _, id := range more {
		if len(list) >= MaxRecordedIDs {
			break
		}
		list = append(list, id)
	}
	return list
}

func idsOf(v ruleval.Value) []string {
	switch v.Type {
	case ruleval.TTasks:
		return v.IDs
	case ruleval.TTask, ruleval.TProject:
		if v.ID != "" {
			return []string{v.ID}
		}
	}
	return nil
}

// ref resolves a reference.
func (st *runState) ref(name string, item *ruleval.Value) (ruleval.Value, bool) {
	switch name {
	case ruleval.RefTrigger:
		return st.trigger, true
	case ruleval.RefItem:
		if item != nil {
			return *item, true
		}
		return ruleval.Value{}, false
	}
	v, ok := st.vals[name]
	return v, ok
}

// run plans a step's kind with its inputs, once per item of the list an input
// receives where it takes a single value (implicit for each, design D3).
func (st *runState) run(s *ruleval.Step, at int) (ruleval.Value, string, error) {
	k, _ := ruleval.StepKindOf(s.Kind)
	switch s.Kind {
	case "if":
		return st.runIf(s)
	case "repeat":
		return st.runRepeat(s)
	}
	in := map[string]ruleval.Value{}
	eachName := ""
	var each ruleval.Value
	for name, a := range s.In {
		if !a.IsRef() {
			continue
		}
		v, ok := st.ref(a.Ref, st.item())
		if !ok {
			return ruleval.Value{}, "", failf(ErrCodeInvalid, "%s.%s: %s has no value", s.Kind, name, a.Ref)
		}
		def := inputDef(k, name)
		if isList(v.Type) && !acceptsType(def, v.Type) {
			eachName, each = name, v
		}
		in[name] = v
	}
	if eachName == "" {
		return st.exec(s, in, at)
	}
	items := elements(each)
	if st.iterations += len(items); st.iterations > ruleval.MaxIterations {
		return ruleval.Value{}, "", failf(ErrCodeIterations, "a run may repeat at most %d times", ruleval.MaxIterations)
	}
	var outs []ruleval.Value
	status := ""
	for i, it := range items {
		in[eachName] = it
		st.seq = i
		out, s2, err := st.exec(s, in, at)
		if err != nil {
			return ruleval.Value{}, "", err
		}
		if s2 != "" {
			status = s2
		}
		outs = append(outs, out)
	}
	return collect(k.Out, outs), status, nil
}

func (st *runState) item() *ruleval.Value { return st.curItem }

func inputDef(k *ruleval.StepKind, name string) *ruleval.Input {
	for i := range k.Inputs {
		if k.Inputs[i].Name == name {
			return &k.Inputs[i]
		}
	}
	return &ruleval.Input{}
}

func isList(t ruleval.Type) bool { return t == ruleval.TTasks || t == ruleval.TLines }

func acceptsType(def *ruleval.Input, t ruleval.Type) bool {
	for _, a := range def.Accepts {
		if a == t {
			return true
		}
	}
	return false
}

// elements splits a list into single values.
func elements(v ruleval.Value) []ruleval.Value {
	var out []ruleval.Value
	switch v.Type {
	case ruleval.TTasks:
		for _, id := range v.IDs {
			out = append(out, ruleval.Value{Type: ruleval.TTask, ID: id})
		}
	case ruleval.TLines:
		for _, l := range v.Lines {
			out = append(out, ruleval.Value{Type: ruleval.TText, Text: l})
		}
	}
	return out
}

// collect makes a list of per-item outputs (Repeat's output, a for-each).
func collect(single ruleval.Type, outs []ruleval.Value) ruleval.Value {
	var v ruleval.Value
	for _, o := range outs {
		switch o.Type {
		case ruleval.TTask:
			v.Type, v.IDs = ruleval.TTasks, append(v.IDs, o.ID)
		case ruleval.TTasks:
			v.Type, v.IDs = ruleval.TTasks, append(v.IDs, o.IDs...)
		case ruleval.TText:
			v.Type, v.Lines = ruleval.TLines, append(v.Lines, o.Text)
		case ruleval.TLines:
			v.Type, v.Lines = ruleval.TLines, append(v.Lines, o.Lines...)
		}
	}
	if v.Type == "" {
		switch single {
		case ruleval.TTask, ruleval.TTasks:
			v.Type, v.IDs = ruleval.TTasks, []string{}
		case ruleval.TText, ruleval.TLines:
			v.Type, v.Lines = ruleval.TLines, []string{}
		default:
			v.Type = ruleval.TNone
		}
	}
	return v
}

func (st *runState) runIf(s *ruleval.Step) (ruleval.Value, string, error) {
	v, ok := st.ref(s.In["value"].Ref, st.item())
	if !ok {
		return ruleval.Value{}, "", failf(ErrCodeInvalid, "if: no value")
	}
	cmp, err := ruleval.ParseCompare(s.In["is"].Lit)
	if err != nil {
		return ruleval.Value{}, "", failf(ErrCodeInvalid, "%s", err)
	}
	if cmp.Text != nil && v.Type == ruleval.TDate {
		if d, ok := ruleval.DateLiteral(jsonOf(*cmp.Text)); ok {
			t := d.Resolve(st.w.today)
			cmp.Text = &t
		}
	}
	block := s.Otherwise
	if ruleval.Holds(v, cmp) {
		block = s.Then
	}
	return ruleval.Value{Type: ruleval.TNone}, "", st.list(block)
}

func (st *runState) runRepeat(s *ruleval.Step) (ruleval.Value, string, error) {
	list, ok := st.ref(s.In["list"].Ref, st.item())
	if !ok {
		return ruleval.Value{}, "", failf(ErrCodeInvalid, "repeat: no list")
	}
	items := elements(list)
	if st.iterations += len(items); st.iterations > ruleval.MaxIterations {
		return ruleval.Value{}, "", failf(ErrCodeIterations, "a run may repeat at most %d times", ruleval.MaxIterations)
	}
	prev := st.curItem
	defer func() { st.curItem = prev }()
	var outs []ruleval.Value
	for i := range items {
		st.curItem = &items[i]
		if err := st.list(s.Do); err != nil {
			return ruleval.Value{}, "", err
		}
		if n := len(s.Do); n > 0 {
			outs = append(outs, st.vals[s.Do[n-1].ID])
		}
	}
	single := ruleval.TNone
	if n := len(s.Do); n > 0 {
		single = st.vals[s.Do[n-1].ID].Type
	}
	return collect(single, outs), "", nil
}

func jsonOf(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// preview is what a test shows of an output: titles and text included.
func (st *runState) preview(v ruleval.Value) any {
	switch v.Type {
	case ruleval.TText:
		return v.Text
	case ruleval.TLines:
		return v.Lines
	case ruleval.TNumber:
		return v.Number
	case ruleval.TDate:
		return v.Date
	case ruleval.TTask:
		return map[string]string{"id": v.ID, "title": str(st.tasks[v.ID], "title")}
	case ruleval.TTasks:
		out := []map[string]string{}
		for _, id := range v.IDs {
			out = append(out, map[string]string{"id": id, "title": str(st.tasks[id], "title")})
		}
		return out
	case ruleval.TProject:
		return map[string]string{"id": v.ID, "name": str(st.projects[v.ID], "name")}
	}
	return nil
}

// litText reads a step's text literal, expanding a {format} template.
func (st *runState) litText(raw json.RawMessage) string {
	txt, tmpl, ok := ruleval.TextLiteral(raw)
	if !ok {
		return ""
	}
	if !tmpl {
		return txt
	}
	return st.format(txt)
}

// format expands a template's placeholders: a task list as its titles one
// per line, a number in decimal, a date as YYYY-MM-DD.
func (st *runState) format(template string) string {
	vals := map[string]string{}
	for _, ref := range ruleval.Placeholders(template) {
		if v, ok := st.ref(ref, st.item()); ok {
			vals[ref] = st.render(v)
		}
	}
	return ruleval.FormatTemplate(template, vals)
}

// render writes a value as text.
func (st *runState) render(v ruleval.Value) string {
	switch v.Type {
	case ruleval.TText:
		return v.Text
	case ruleval.TLines:
		return strings.Join(v.Lines, "\n")
	case ruleval.TNumber:
		return ruleval.RenderNumber(v.Number)
	case ruleval.TDate:
		return v.Date
	case ruleval.TTask:
		return str(st.tasks[v.ID], "title")
	case ruleval.TTasks:
		titles := make([]string, 0, len(v.IDs))
		for _, id := range v.IDs {
			titles = append(titles, str(st.tasks[id], "title"))
		}
		return strings.Join(titles, "\n")
	case ruleval.TProject:
		return str(st.projects[v.ID], "name")
	}
	return ""
}

// textIn is an input as text: a reference rendered, or a literal expanded.
func (st *runState) textIn(s *ruleval.Step, in map[string]ruleval.Value, name string) (string, bool) {
	if v, ok := in[name]; ok {
		return st.render(v), true
	}
	a, ok := s.In[name]
	if !ok {
		return "", false
	}
	return st.litText(a.Lit), true
}
