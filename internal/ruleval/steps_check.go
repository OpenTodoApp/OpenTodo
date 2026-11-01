package ruleval

import (
	"encoding/json"
	"fmt"
	"slices"
)

// typeNames are the types as the interface names them.
var typeNames = map[Type]string{TText: "Text", TTask: "Task", TTasks: "Tasks", TProject: "Project", TDate: "Date", TNumber: "Number", TLines: "Lines", TNone: "no output"}

// TypeName is a type's display name.
func TypeName(t Type) string {
	if n, ok := typeNames[t]; ok {
		return n
	}
	return string(t)
}

func acceptsNames(list []Type) string {
	out := ""
	for i, t := range list {
		if i > 0 {
			out += " or "
		}
		out += TypeName(t)
	}
	return out
}

// elementOf is the item type of a list type ("" for a single value).
func elementOf(t Type) Type {
	switch t {
	case TTasks:
		return TTask
	case TLines:
		return TText
	}
	return ""
}

// listOfType is the list a for-each of single outputs makes ("" when none exists).
func listOfType(t Type) Type {
	switch t {
	case TTask, TTasks:
		return TTasks
	case TText, TLines:
		return TLines
	case TNone:
		return TNone
	}
	return ""
}

// accepts reports whether an input takes a value of type t as it is, with
// the three coercions (design D3): a Task where Tasks is accepted, a Number
// or a Date where Text is accepted.
func accepts(def *Input, t Type) (Type, bool) {
	if slices.Contains(def.Accepts, t) {
		return t, true
	}
	switch {
	case t == TTask && slices.Contains(def.Accepts, TTasks):
		return TTasks, true
	case (t == TNumber || t == TDate) && slices.Contains(def.Accepts, TText):
		return TText, true
	}
	return "", false
}

type checker struct {
	trigger Type
	types   map[string]Type
}

// Check type-checks a parsed routine against the trigger's output type and
// returns every step's output type. A type error names the step, the input
// and both types ("notify: text expects Text, got Tasks").
func Check(steps []Step, trigger Type) (map[string]Type, error) {
	c := &checker{trigger: trigger, types: map[string]Type{}}
	if err := c.list(steps, map[string]Type{}, ""); err != nil {
		return nil, err
	}
	return c.types, nil
}

func copyEnv(env map[string]Type) map[string]Type {
	out := make(map[string]Type, len(env))
	for k, v := range env {
		out[k] = v
	}
	return out
}

func (c *checker) refType(ref string, env map[string]Type, item Type) Type {
	switch ref {
	case RefTrigger:
		return c.trigger
	case RefItem:
		return item
	}
	return env[ref]
}

func (c *checker) list(list []Step, outer map[string]Type, item Type) error {
	env := copyEnv(outer)
	for i := range list {
		out, err := c.step(&list[i], env, item)
		if err != nil {
			return err
		}
		env[list[i].ID] = out
		c.types[list[i].ID] = out
	}
	return nil
}

func (c *checker) step(s *Step, env map[string]Type, item Type) (Type, error) {
	k, _ := StepKindOf(s.Kind)
	eachRef, same := "", Type("")
	for _, name := range s.inputNames() {
		a, def := s.In[name], mustInput(k, name)
		if !a.IsRef() {
			if err := c.templateRefs(s, name, a, env, item); err != nil {
				return "", err
			}
			continue
		}
		t := c.refType(a.Ref, env, item)
		if t == TNone || t == "" {
			return "", stepErr(s.ID, name, CodeNoOutput, "%s.%s: %s has no output", s.Kind, name, a.Ref)
		}
		got, ok := accepts(def, t)
		if !ok {
			el := elementOf(t)
			if _, single := accepts(def, el); el == "" || !single {
				return "", stepErr(s.ID, name, CodeTypeMismatch, "%s: %s expects %s, got %s", s.Kind, name, acceptsNames(def.Accepts), TypeName(t))
			}
			if eachRef != "" && eachRef != a.Ref {
				return "", stepErr(s.ID, name, CodeForEach, "%s: only one input can take a list for each of its items; use Repeat for each", s.Kind)
			}
			eachRef, got = a.Ref, el
		}
		if name == k.SameAs {
			same = got
		}
	}
	out := k.Out
	if k.SameAs != "" {
		out = same
	}
	if eachRef != "" {
		if out = listOfType(out); out == "" {
			return "", stepErr(s.ID, "", CodeForEach, "%s: cannot run once per item here; use Repeat for each", s.Kind)
		}
	}
	switch s.Kind {
	case "if":
		if err := c.list(s.Then, env, item); err != nil {
			return "", err
		}
		if err := c.list(s.Otherwise, env, item); err != nil {
			return "", err
		}
	case "repeat":
		el := elementOf(c.refType(s.In["list"].Ref, env, item))
		if err := c.list(s.Do, env, el); err != nil {
			return "", err
		}
		out = TNone
		if n := len(s.Do); n > 0 {
			if l := listOfType(c.types[s.Do[n-1].ID]); l != "" {
				out = l
			}
		}
	}
	return out, nil
}

func mustInput(k *StepKind, name string) *Input {
	def, _ := k.input(name)
	return def
}

// templateRefs checks that a template's placeholders name outputs (any type
// but none renders as text).
func (c *checker) templateRefs(s *Step, name string, a Arg, env map[string]Type, item Type) error {
	txt, tmpl, ok := TextLiteral(a.Lit)
	if !ok || (!tmpl && !(s.Kind == "format" && name == "template")) {
		return nil
	}
	for _, ref := range Placeholders(txt) {
		if t := c.refType(ref, env, item); t == TNone || t == "" {
			return stepErr(s.ID, name, CodeNoOutput, "%s.%s: %s has no output", s.Kind, name, ref)
		}
	}
	return nil
}

// ContentStep returns the id of the first step that reads or writes
// user-written text (design D9), or "" for a content-free routine. types are
// the outputs Check returned.
func ContentStep(steps []Step, trigger Type, types map[string]Type) string {
	found := ""
	Walk(steps, func(s *Step) {
		if found == "" && isContent(s, trigger, types) {
			found = s.ID
		}
	})
	return found
}

func isContent(s *Step, trigger Type, types map[string]Type) bool {
	_, has := s.In["name"]
	switch s.Kind {
	case "find_tasks":
		_, q := s.In["query"]
		_, v := s.In["view"]
		return q || v
	case "change_tasks":
		set, _ := ParseStepActions(s.In["set"].Lit)
		return set.Comment != nil
	case "update_project":
		return has
	case "filter":
		w, _ := ParseWhere(s.In["where"].Lit)
		return w.IsText()
	case "sort":
		var by string
		_ = json.Unmarshal(s.In["by"].Lit, &by)
		return by == "title" || by == "text"
	case "if":
		cmp, _ := ParseCompare(s.In["is"].Lit)
		vt := types[s.In["value"].Ref]
		switch s.In["value"].Ref {
		case RefTrigger:
			vt = trigger
		}
		return cmp.Op == "contains" || vt == TText
	case "webhook":
		_, t := s.In["text"]
		return t
	}
	k, _ := StepKindOf(s.Kind)
	return k.Content
}

// ReadRoutine is the one reading of a rule's stored fields as the steps the
// engine runs (design D2): with `steps` null the routine is one Change tasks
// step over the trigger's output whose changes are `actions` (legacy true);
// with `steps` a list, those steps, and `actions` is ignored.
func ReadRoutine(actions, steps json.RawMessage) ([]Step, bool, error) {
	if len(steps) > 0 && !isNull(steps) {
		list, err := ParseSteps(steps)
		return list, false, err
	}
	if len(actions) == 0 || isNull(actions) {
		return nil, true, fmt.Errorf("a rule needs actions or steps")
	}
	if _, err := ParseActions(actions); err != nil {
		return nil, true, err
	}
	in := map[string]Arg{"tasks": {Ref: RefTrigger}, "set": {Lit: actions}}
	return []Step{{ID: "a", Kind: "change_tasks", In: in}}, true, nil
}
