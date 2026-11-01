package ruleval

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// Step is one decoded step of a routine.
type Step struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	In        map[string]Arg `json:"in,omitempty"`
	Then      []Step         `json:"then,omitempty"`
	Otherwise []Step         `json:"otherwise,omitempty"`
	Do        []Step         `json:"do,omitempty"`
}

// Arg is a step input: a reference to an output or a literal value.
type Arg struct {
	Ref string          `json:"ref,omitempty"`
	Lit json.RawMessage `json:"literal,omitempty"`
}

// IsRef reports whether the input is a reference.
func (a Arg) IsRef() bool { return a.Ref != "" }

// Reserved references: the trigger's output and a Repeat's current item.
const (
	RefTrigger = "trigger"
	RefItem    = "item"
)

// StepError is a refused routine: the step, the input and a code.
type StepError struct {
	Step  string `json:"step,omitempty"`
	Input string `json:"input,omitempty"`
	Code  string `json:"code"`
	Msg   string `json:"message"`
}

func (e *StepError) Error() string { return e.Msg }

// Step error codes.
const (
	CodeInvalid      = "invalid_step"
	CodeTooMany      = "too_many_steps"
	CodeTooDeep      = "too_deep"
	CodeTooLarge     = "too_large"
	CodeUnknownKind  = "unknown_kind"
	CodeUnknownInput = "unknown_input"
	CodeMissing      = "missing_input"
	CodeBadLiteral   = "invalid_literal"
	CodeBadRef       = "unknown_ref"
	CodeDuplicateID  = "duplicate_id"
	CodeTypeMismatch = "type_mismatch"
	CodeForEach      = "for_each"
	CodeNoOutput     = "no_output"
	CodeTooManyAI    = "too_many_ai_steps"
)

func stepErr(step, input, code, format string, args ...any) *StepError {
	return &StepError{Step: step, Input: input, Code: code, Msg: fmt.Sprintf(format, args...)}
}

var stepIDRe = regexp.MustCompile(`^[a-z0-9]{1,8}$`)

// placeholderRe finds the {id} placeholders of a template.
var placeholderRe = regexp.MustCompile(`\{([a-z0-9]{1,8})\}`)

// Placeholders lists the references a template names, in order.
func Placeholders(template string) []string {
	var out []string
	for _, m := range placeholderRe.FindAllStringSubmatch(template, -1) {
		if !slices.Contains(out, m[1]) {
			out = append(out, m[1])
		}
	}
	return out
}

// ParseSteps decodes and checks a non-null `steps` value (the sync shape check,
// design "Data model impact"): an array of steps with known kinds, unique ids,
// inputs of the declared names with literals of the declared shapes, every
// required input, references only to outputs visible from the step, at most
// MaxSteps steps across MaxBlockDepth block levels and MaxStepsBytes encoded.
func ParseSteps(raw json.RawMessage) ([]Step, error) {
	if len(raw) > MaxStepsBytes {
		return nil, stepErr("", "", CodeTooLarge, "steps may be at most %d KB", MaxStepsBytes/1024)
	}
	p := &stepParser{ids: map[string]bool{}}
	steps, err := p.list(raw, 0)
	if err != nil {
		return nil, err
	}
	if len(steps) == 0 {
		return nil, stepErr("", "", CodeInvalid, "a routine needs at least one step")
	}
	if err := checkRefs(steps, map[string]bool{}, false); err != nil {
		return nil, err
	}
	return steps, nil
}

// CheckSteps is the sync kind check of rule.steps.
func CheckSteps(raw json.RawMessage) error { _, err := ParseSteps(raw); return err }

type stepParser struct {
	ids   map[string]bool
	count int
	ai    int
}

func (p *stepParser) list(raw json.RawMessage, depth int) ([]Step, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil || (items == nil && string(bytes.TrimSpace(raw)) != "[]") {
		return nil, stepErr("", "", CodeInvalid, "steps must be a list")
	}
	out := make([]Step, 0, len(items))
	for _, item := range items {
		s, err := p.step(item, depth)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

func (p *stepParser) step(raw json.RawMessage, depth int) (Step, error) {
	var s Step
	m, err := members(raw, "a step")
	if err != nil {
		return s, stepErr("", "", CodeInvalid, "every step must be an object")
	}
	if p.count++; p.count > MaxSteps {
		return s, stepErr("", "", CodeTooMany, "a routine may hold at most %d steps", MaxSteps)
	}
	_ = json.Unmarshal(m["id"], &s.ID)
	if !stepIDRe.MatchString(s.ID) || s.ID == RefTrigger || s.ID == RefItem {
		return s, stepErr(s.ID, "", CodeInvalid, "a step id must be 1 to 8 characters a-z and 0-9 (trigger and item are reserved)")
	}
	if p.ids[s.ID] {
		return s, stepErr(s.ID, "", CodeDuplicateID, "step id %q is used twice", s.ID)
	}
	p.ids[s.ID] = true
	_ = json.Unmarshal(m["kind"], &s.Kind)
	k, ok := StepKindOf(s.Kind)
	if !ok {
		return s, stepErr(s.ID, "", CodeUnknownKind, "step %s: unknown kind %q", s.ID, s.Kind)
	}
	if IsAI(s.Kind) {
		if p.ai++; p.ai > MaxAISteps {
			return s, stepErr(s.ID, "", CodeTooManyAI, "a routine may hold at most %d AI steps", MaxAISteps)
		}
	}
	allowed := append([]string{"id", "kind", "in"}, k.Blocks...)
	for key := range m {
		if !slices.Contains(allowed, key) {
			return s, stepErr(s.ID, "", CodeInvalid, "step %s (%s) does not allow %q", s.ID, s.Kind, key)
		}
	}
	if s.In, err = p.inputs(k, s.ID, m["in"]); err != nil {
		return s, err
	}
	for _, b := range k.Blocks {
		raw, has := m[b]
		if !has || isNull(raw) {
			continue
		}
		if depth+1 > MaxBlockDepth {
			return s, stepErr(s.ID, "", CodeTooDeep, "blocks may nest at most %d deep", MaxBlockDepth)
		}
		inner, err := p.list(raw, depth+1)
		if err != nil {
			return s, err
		}
		switch b {
		case "then":
			s.Then = inner
		case "otherwise":
			s.Otherwise = inner
		case "do":
			s.Do = inner
		}
	}
	return s, nil
}

func isNull(raw json.RawMessage) bool { return string(bytes.TrimSpace(raw)) == "null" }

func (p *stepParser) inputs(k *StepKind, id string, raw json.RawMessage) (map[string]Arg, error) {
	out := map[string]Arg{}
	if len(raw) > 0 && !isNull(raw) {
		m, err := members(raw, "in")
		if err != nil {
			return nil, stepErr(id, "", CodeInvalid, "step %s: in must be an object", id)
		}
		names := make([]string, 0, len(m))
		for name := range m {
			names = append(names, name)
		}
		slices.Sort(names)
		for _, name := range names {
			if _, ok := k.input(name); !ok {
				return nil, stepErr(id, name, CodeUnknownInput, "%s: unknown input %q", k.Kind, name)
			}
		}
		for i := range k.Inputs {
			def := &k.Inputs[i]
			v, has := m[def.Name]
			if !has {
				continue
			}
			a, err := parseArg(k, def, id, v)
			if err != nil {
				return nil, err
			}
			out[def.Name] = a
		}
	}
	for _, def := range k.Inputs {
		if _, has := out[def.Name]; def.Required && !has {
			return nil, stepErr(id, def.Name, CodeMissing, "%s: %s is required", k.Kind, def.Name)
		}
	}
	// Subtasks take their parent's project (routines-dynamic-data D5).
	if _, parent := out["parent"]; parent && k.Kind == "create_tasks" {
		if _, project := out["project"]; project {
			return nil, stepErr(id, "project", CodeInvalid, "create_tasks: subtasks take the parent's project; give parent or project, not both")
		}
	}
	for _, set := range k.OneOf {
		n := 0
		for _, name := range set {
			if _, has := out[name]; has {
				n++
			}
		}
		if n != 1 {
			return nil, stepErr(id, set[0], CodeMissing, "%s: give exactly one of %s", k.Kind, strings.Join(set, ", "))
		}
	}
	return out, nil
}

func parseArg(k *StepKind, def *Input, id string, raw json.RawMessage) (Arg, error) {
	var a Arg
	m, err := members(raw, "an input")
	if err != nil || len(m) != 1 {
		return a, stepErr(id, def.Name, CodeInvalid, "%s.%s must be {ref} or {literal}", k.Kind, def.Name)
	}
	if r, has := m["ref"]; has {
		if json.Unmarshal(r, &a.Ref) != nil || a.Ref == "" {
			return a, stepErr(id, def.Name, CodeInvalid, "%s.%s: ref must name a step", k.Kind, def.Name)
		}
		if len(def.Accepts) == 0 {
			return a, stepErr(id, def.Name, CodeInvalid, "%s.%s takes a literal value only", k.Kind, def.Name)
		}
		return a, nil
	}
	lit, has := m["literal"]
	if !has {
		return a, stepErr(id, def.Name, CodeInvalid, "%s.%s must be {ref} or {literal}", k.Kind, def.Name)
	}
	if def.Lit == LitNone {
		return a, stepErr(id, def.Name, CodeInvalid, "%s.%s takes a reference only", k.Kind, def.Name)
	}
	if msg := checkLiteral(def, lit); msg != "" {
		return a, stepErr(id, def.Name, CodeBadLiteral, "%s.%s: %s", k.Kind, def.Name, msg)
	}
	a.Lit = lit
	return a, nil
}

// TextLiteral reads a text literal: a plain string, or {"format": template}.
func TextLiteral(raw json.RawMessage) (text string, template bool, ok bool) {
	if json.Unmarshal(raw, &text) == nil {
		return text, false, true
	}
	var f struct {
		Format *string `json:"format"`
	}
	if strict(raw, &f, "text") != nil || f.Format == nil {
		return "", false, false
	}
	return *f.Format, true, true
}

func checkText(s string, maxRunes int) string {
	if !utf8.ValidString(s) {
		return "must be valid text"
	}
	if e2ee.IsCiphertext(s) {
		return ""
	}
	if maxRunes == 0 {
		maxRunes = MaxLiteralText
	}
	if utf8.RuneCountInString(s) > maxRunes {
		return fmt.Sprintf("may be at most %d characters", maxRunes)
	}
	return ""
}

func checkLiteral(def *Input, raw json.RawMessage) string {
	switch def.Lit {
	case LitText:
		s, _, ok := TextLiteral(raw)
		if !ok {
			return `must be text or {"format": text}`
		}
		return checkText(s, def.Max)
	case LitNumber:
		var n float64
		if json.Unmarshal(raw, &n) != nil || math.IsNaN(n) || math.IsInf(n, 0) {
			return "must be a number"
		}
		if def.Max > 0 && (n < 0 || n > float64(def.Max)) {
			return fmt.Sprintf("must be from 0 to %d", def.Max)
		}
	case LitDate:
		if _, ok := DateLiteral(raw); !ok {
			return `must be YYYY-MM-DD, "today", "tomorrow" or {"in_days": n}`
		}
	case LitProject, LitTask:
		var v map[string]string
		if strict(raw, &v, "") != nil || len(v) != 1 || checkID(v[string(def.Lit)], "") != nil {
			return fmt.Sprintf(`must be {"%s": id}`, def.Lit)
		}
	case LitLines:
		var l []string
		if json.Unmarshal(raw, &l) != nil || l == nil || len(l) > MaxListItems {
			return fmt.Sprintf("must be a list of at most %d texts", MaxListItems)
		}
		for _, s := range l {
			if msg := checkText(s, 1000); msg != "" {
				return msg
			}
		}
	case LitBool:
		var b bool
		if json.Unmarshal(raw, &b) != nil {
			return "must be true or false"
		}
	case LitEnum:
		var s string
		if json.Unmarshal(raw, &s) != nil || !slices.Contains(def.Enum, s) {
			return fmt.Sprintf("must be one of %v", def.Enum)
		}
	case LitID:
		var s string
		if json.Unmarshal(raw, &s) != nil || checkID(s, "") != nil {
			return "must be an id"
		}
	case LitIDs:
		var l []string
		if json.Unmarshal(raw, &l) != nil || l == nil || checkIDs(l, "") != nil {
			return fmt.Sprintf("must be a list of at most %d ids", MaxIDs)
		}
	case LitActions:
		if _, err := ParseStepActions(raw); err != nil {
			return err.Error()
		}
	case LitCondition:
		if _, err := ParseCondition(raw); err != nil {
			return err.Error()
		}
	case LitCompare:
		if _, err := ParseCompare(raw); err != nil {
			return err.Error()
		}
	case LitPeriod:
		if _, err := ParsePeriod(raw); err != nil {
			return err.Error()
		}
	case LitWhere:
		if _, err := ParseWhere(raw); err != nil {
			return err.Error()
		}
	}
	return ""
}

// checkRefs refuses a reference to an output not visible from its step: the
// trigger, an earlier step of the same or an enclosing block, or the current
// item inside a Repeat. Templates' placeholders are references too.
func checkRefs(list []Step, visible map[string]bool, inRepeat bool) error {
	vis := map[string]bool{}
	for k, v := range visible {
		vis[k] = v
	}
	ok := func(ref string) bool {
		return ref == RefTrigger || (ref == RefItem && inRepeat) || vis[ref]
	}
	for _, s := range list {
		for _, name := range s.inputNames() {
			a := s.In[name]
			refs := []string{}
			if a.IsRef() {
				refs = append(refs, a.Ref)
			} else if txt, tmpl, isText := TextLiteral(a.Lit); isText && (tmpl || (s.Kind == "format" && name == "template")) && !e2ee.IsCiphertext(txt) {
				refs = append(refs, Placeholders(txt)...)
			}
			for _, ref := range refs {
				if !ok(ref) {
					return stepErr(s.ID, name, CodeBadRef, "%s.%s: %q is not an earlier step", s.Kind, name, ref)
				}
			}
		}
		for _, block := range [][]Step{s.Then, s.Otherwise} {
			if err := checkRefs(block, vis, inRepeat); err != nil {
				return err
			}
		}
		if err := checkRefs(s.Do, vis, true); err != nil {
			return err
		}
		vis[s.ID] = true
	}
	return nil
}

// CountSteps counts the steps of a routine across its blocks.
func CountSteps(list []Step) int {
	n := 0
	for _, s := range list {
		n += 1 + CountSteps(s.Then) + CountSteps(s.Otherwise) + CountSteps(s.Do)
	}
	return n
}

// Walk calls fn for every step, depth first in order.
func Walk(list []Step, fn func(*Step)) {
	for i := range list {
		fn(&list[i])
		Walk(list[i].Then, fn)
		Walk(list[i].Otherwise, fn)
		Walk(list[i].Do, fn)
	}
}

// inputNames lists a step's given inputs in the order of its kind's table.
func (s *Step) inputNames() []string {
	k, ok := StepKindOf(s.Kind)
	if !ok {
		return nil
	}
	var out []string
	for _, def := range k.Inputs {
		if _, has := s.In[def.Name]; has {
			out = append(out, def.Name)
		}
	}
	return out
}
