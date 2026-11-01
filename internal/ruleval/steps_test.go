package ruleval

import (
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

type stepVectors struct {
	Check []struct {
		Name    string          `json:"name"`
		Trigger Type            `json:"trigger"`
		Steps   json.RawMessage `json:"steps"`
		Types   map[string]Type `json:"types"`
		Content *string         `json:"content"`
		Error   *StepError      `json:"error"`
	} `json:"check"`
	Auto []struct {
		Name    string          `json:"name"`
		Steps   json.RawMessage `json:"steps"`
		Blocked *struct {
			Step string `json:"step"`
			What string `json:"what"`
		} `json:"blocked"`
	} `json:"auto"`
	Reading []struct {
		Name    string          `json:"name"`
		Actions json.RawMessage `json:"actions"`
		Steps   json.RawMessage `json:"steps"`
		Legacy  bool            `json:"legacy"`
		Read    json.RawMessage `json:"read"`
	} `json:"reading"`
	Data []struct {
		Fn        string                     `json:"fn"`
		In        map[string]json.RawMessage `json:"in"`
		Out       json.RawMessage            `json:"out"`
		Truncated bool                       `json:"truncated"`
	} `json:"data"`
}

func readStepVectors(t *testing.T) stepVectors {
	t.Helper()
	raw, err := os.ReadFile("../../web/src/lib/rules/steps.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v stepVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// TestAutoVectors: Apply without asking refuses the same steps as
// web/src/lib/rules/steps.ts (routines-ai-step D4).
func TestAutoVectors(t *testing.T) {
	v := readStepVectors(t)
	if len(v.Auto) < 5 {
		t.Fatalf("only %d auto vectors", len(v.Auto))
	}
	for _, c := range v.Auto {
		steps, err := ParseSteps(c.Steps)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		step, what := AutoBlocker(steps)
		want := [2]string{}
		if c.Blocked != nil {
			want = [2]string{c.Blocked.Step, c.Blocked.What}
		}
		if [2]string{step, what} != want {
			t.Errorf("%s: %s %s, want %v", c.Name, step, what, want)
		}
	}
}

// TestStepVectors: the shape check and the type checker agree with
// web/src/lib/rules/steps.ts on every vector.
func TestStepVectors(t *testing.T) {
	v := readStepVectors(t)
	if len(v.Check) < 40 {
		t.Fatalf("only %d check vectors", len(v.Check))
	}
	for _, c := range v.Check {
		steps, err := ParseSteps(c.Steps)
		var types map[string]Type
		if err == nil {
			types, err = Check(steps, c.Trigger)
		}
		if c.Error != nil {
			var se *StepError
			if !errors.As(err, &se) {
				t.Errorf("%s: err = %v, want %s", c.Name, err, c.Error.Code)
				continue
			}
			if se.Code != c.Error.Code || se.Step != c.Error.Step || se.Input != c.Error.Input {
				t.Errorf("%s: got %s/%s/%s (%s), want %s/%s/%s", c.Name, se.Step, se.Input, se.Code, se.Msg, c.Error.Step, c.Error.Input, c.Error.Code)
			}
			if c.Error.Msg != "" && se.Msg != c.Error.Msg {
				t.Errorf("%s: message %q, want %q", c.Name, se.Msg, c.Error.Msg)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		if !reflect.DeepEqual(types, c.Types) {
			t.Errorf("%s: types %v, want %v", c.Name, types, c.Types)
		}
		if c.Content != nil {
			if got := ContentStep(steps, c.Trigger, types); got != *c.Content {
				t.Errorf("%s: content step %q, want %q", c.Name, got, *c.Content)
			}
		}
	}
}

func TestReadRoutineVectors(t *testing.T) {
	for _, c := range readStepVectors(t).Reading {
		steps, legacy, err := ReadRoutine(c.Actions, c.Steps)
		if string(c.Read) == "null" {
			if err == nil {
				t.Errorf("%s: want an error", c.Name)
			}
			continue
		}
		if err != nil || legacy != c.Legacy {
			t.Errorf("%s: legacy %v err %v", c.Name, legacy, err)
			continue
		}
		var want []Step
		if err := json.Unmarshal(c.Read, &want); err != nil {
			t.Fatal(err)
		}
		got, _ := json.Marshal(steps)
		exp, _ := json.Marshal(want)
		if !sameJSONText(got, exp) {
			t.Errorf("%s: read %s, want %s", c.Name, got, exp)
		}
	}
}

func sameJSONText(a, b []byte) bool {
	var x, y any
	_ = json.Unmarshal(a, &x)
	_ = json.Unmarshal(b, &y)
	return reflect.DeepEqual(x, y)
}

func dec[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	return v
}

// TestStepDataVectors: the data steps give the outputs stepData.ts gives.
func TestStepDataVectors(t *testing.T) {
	v := readStepVectors(t)
	if len(v.Data) < 40 {
		t.Fatalf("only %d data vectors", len(v.Data))
	}
	for i, c := range v.Data {
		var got any
		in := c.In
		switch c.Fn {
		case "split_lines":
			got, _ = SplitLines(dec[string](t, in["text"]))
		case "join":
			got = JoinLines(dec[[]string](t, in["lines"]), dec[string](t, in["separator"]))
		case "format":
			got = FormatTemplate(dec[string](t, in["template"]), dec[map[string]string](t, in["vals"]))
		case "replace":
			got = ReplaceText(dec[string](t, in["text"]), dec[string](t, in["find"]), dec[string](t, in["with"]), dec[bool](t, in["case"]))
		case "filter_lines":
			got = FilterLines(dec[[]string](t, in["lines"]), dec[string](t, in["text"]), dec[bool](t, in["not"]))
		case "sort_lines":
			got = SortLines(dec[[]string](t, in["lines"]), dec[bool](t, in["desc"]))
		case "sort_tasks":
			ids := []string{}
			for _, x := range SortTasks(dec[[]SortTask](t, in["tasks"]), dec[string](t, in["by"]), dec[bool](t, in["desc"])) {
				ids = append(ids, x.ID)
			}
			got = ids
		case "take":
			got = Take(dec[[]string](t, in["list"]), dec[int](t, in["n"]), dec[bool](t, in["from_end"]))
		case "number":
			got = RenderNumber(dec[float64](t, in["n"]))
		case "holds":
			cmp, err := ParseCompare(in["is"])
			if err != nil {
				t.Fatalf("vector %d: %v", i, err)
			}
			got = Holds(dec[Value](t, in["value"]), cmp)
		case "cut":
			s, cut := CutText(dec[string](t, in["text"]))
			if cut != c.Truncated {
				t.Errorf("vector %d: truncated %v", i, cut)
			}
			got = s
		case "date":
			d, ok := DateLiteral(in["literal"])
			if !ok {
				t.Fatalf("vector %d: bad date literal", i)
			}
			got = d.Resolve(dec[string](t, in["today"]))
		case "period":
			p, err := ParsePeriod(in["period"])
			if err != nil {
				t.Fatalf("vector %d: %v", i, err)
			}
			from, to := p.Range(dec[string](t, in["today"]), time.Weekday(dec[int](t, in["week_start"])))
			got = []string{from, to}
		default:
			t.Fatalf("vector %d: unknown fn %s", i, c.Fn)
		}
		b, _ := json.Marshal(got)
		if !sameJSONText(b, c.Out) {
			t.Errorf("vector %d (%s): got %s, want %s", i, c.Fn, b, c.Out)
		}
	}
}

func TestCutTextOnACharacterBoundary(t *testing.T) {
	long := strings.Repeat("é", MaxTextBytes) // two bytes each
	out, cut := CutText(long)
	if !cut || len(out) != MaxTextBytes || !strings.HasSuffix(out, "é") {
		t.Fatalf("cut %v len %d", cut, len(out))
	}
	odd := "a" + long
	out, _ = CutText(odd)
	if len(out) != MaxTextBytes-1 {
		t.Fatalf("odd cut len %d", len(out))
	}
	lines, more := SplitLines(strings.Repeat("x\n", 600))
	if len(lines) != MaxListItems || !more {
		t.Fatalf("lines %d more %v", len(lines), more)
	}
}

func TestSyncShapeCheckSizes(t *testing.T) {
	big := `[{"id":"a","kind":"notify","in":{"text":{"literal":"` + strings.Repeat("x", 33*1024) + `"}}}]`
	var se *StepError
	if err := CheckSteps(json.RawMessage(big)); !errors.As(err, &se) || se.Code != CodeTooLarge {
		t.Fatalf("32 KB: %v", err)
	}
	if err := CheckSteps(json.RawMessage(`{"id":"a"}`)); err == nil {
		t.Fatal("an object passed")
	}
	enc := `[{"id":"a","kind":"notify","in":{"text":{"literal":"enc:v1:` + strings.Repeat("A", 500) + `"}}}]`
	if err := CheckSteps(json.RawMessage(enc)); err != nil {
		t.Fatalf("a ciphertext literal is not bounded by its plain length: %v", err)
	}
}

// TestAvailability is design D15's table.
func TestAvailability(t *testing.T) {
	ok := Env{Automations: true, EmailConfigured: true, EmailVerified: true, Webhooks: []string{"w1"}, Energy: true}
	with := func(f func(*Env)) Env { e := ok; f(&e); return e }
	cases := []struct {
		name   string
		kind   string
		env    Env
		reason string
	}{
		{"email ok", "email_me", ok, ""},
		{"email without SMTP", "email_me", with(func(e *Env) { e.EmailConfigured = false }), ReasonEmailNotConfigured},
		{"unverified address", "email_me", with(func(e *Env) { e.EmailVerified = false }), ReasonEmailNotVerified},
		{"encrypted", "email_me", with(func(e *Env) { e.Encrypted = true }), ReasonEncrypted},
		{"demo email", "email_me", with(func(e *Env) { e.Demo = true }), ReasonDemo},
		{"members outside a shared project", "email_members", ok, ReasonNotShared},
		{"members in a shared project", "email_members", with(func(e *Env) { e.Shared = true }), ""},
		{"no webhook", "webhook", with(func(e *Env) { e.Webhooks = nil }), ReasonNoWebhook},
		{"demo webhook", "webhook", with(func(e *Env) { e.Demo = true }), ReasonDemo},
		{"focus off", "set_focus", with(func(e *Env) { e.FocusOff = true }), ReasonFocusOff},
		{"time tracking off", "start_timer", with(func(e *Env) { e.TimeTrackingOff = true }), ReasonTimeTrackingOff},
		{"automations off", "split_lines", with(func(e *Env) { e.Automations = false }), ReasonAutomationsOff},
		{"notify without channels", "notify", with(func(e *Env) { e.Webhooks = nil }), ""},
		{"notify on a demo", "notify", with(func(e *Env) { e.Demo = true }), ""},
	}
	for _, c := range cases {
		a := Available(c.kind, c.env)
		if a.Reason != c.reason || a.Available != (c.reason == "") {
			t.Errorf("%s: %+v, want %q", c.name, a, c.reason)
		}
		if c.reason != "" && c.reason != ReasonEncrypted && c.reason != ReasonDemo && c.reason != ReasonNotShared && a.Setting == "" {
			t.Errorf("%s: no setting", c.name)
		}
	}
	steps, err := ParseSteps(json.RawMessage(`[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"energy":"low"}}}},
		{"id":"b","kind":"webhook","in":{"webhook_id":{"literal":"gone"}}},
		{"id":"c","kind":"if","in":{"value":{"ref":"trigger"},"is":{"literal":{"empty":true}}},"then":[
			{"id":"d","kind":"email_me","in":{"subject":{"literal":"s"},"text":{"literal":"t"}}}]}]`))
	if err != nil {
		t.Fatal(err)
	}
	warn := Unavailable(steps, with(func(e *Env) { e.Energy = false; e.EmailVerified = false }))
	var got []string
	for _, w := range warn {
		got = append(got, w.Step+":"+w.Reason)
	}
	if want := []string{"a:energy_off", "b:no_webhook", "d:email_not_verified"}; !slices.Equal(got, want) {
		t.Fatalf("warnings %v, want %v", got, want)
	}
}

// TestCatalogueIsWhole: every kind has a group and declared inputs; every
// tool a step names is a registry tool (checked against the registry in
// internal/agenttools).
func TestCatalogueIsWhole(t *testing.T) {
	seen := map[string]bool{}
	for _, k := range Steps {
		if seen[k.Kind] || k.Group == "" || (k.Out == "" && k.SameAs == "") {
			t.Errorf("%s: duplicate or incomplete", k.Kind)
		}
		seen[k.Kind] = true
		for _, in := range k.Inputs {
			if len(in.Accepts) == 0 && in.Lit == LitNone {
				t.Errorf("%s.%s takes nothing", k.Kind, in.Name)
			}
		}
	}
	for _, out := range []string{"fetch_url", "rss", "email", "run_script", "create_event", "create_routine", "run_routine"} {
		if seen[out] {
			t.Errorf("%s must not be a step", out)
		}
	}
}

// TestFocusVectors: Set today's focus places like web/src/lib/focusSet.ts.
func TestFocusVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/focusSet.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vs []struct {
		Name  string   `json:"name"`
		Style string   `json:"style"`
		Order string   `json:"order"`
		IDs   []string `json:"ids"`
		Tasks []struct {
			ID          string `json:"id"`
			CompletedAt *int64 `json:"completed_at"`
			DeletedAt   *int64 `json:"deleted_at"`
			Estimate    *int   `json:"estimate_minutes"`
		} `json:"tasks"`
		Out json.RawMessage `json:"out"`
	}
	if err := json.Unmarshal(raw, &vs); err != nil {
		t.Fatal(err)
	}
	for _, v := range vs {
		tasks := map[string]FocusTask{}
		for _, x := range v.Tasks {
			tasks[x.ID] = FocusTask{Open: x.CompletedAt == nil && x.DeletedAt == nil, Estimate: x.Estimate}
		}
		got, _ := json.Marshal(PlanSetFocus(v.IDs, tasks, v.Style, v.Order, "2026-11-04"))
		if !sameJSONText(got, v.Out) {
			t.Errorf("%s: %s, want %s", v.Name, got, v.Out)
		}
	}
}
