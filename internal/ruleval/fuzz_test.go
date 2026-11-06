package ruleval

import (
	"encoding/json"
	"os"
	"testing"
)

// FuzzParseRuleValues feeds arbitrary JSON to every parser of a routine's
// stored values (external-security-review): triggers, conditions, actions and
// steps come from the op log, written by any device, an AI agent or an import,
// and must be refused cleanly, never panic. Parsed steps also go through the
// type checker. Seeds are the shared step vectors.
func FuzzParseRuleValues(f *testing.F) {
	if b, err := os.ReadFile("../../web/src/lib/rules/steps.vectors.json"); err == nil {
		var v struct {
			Check []struct {
				Steps json.RawMessage `json:"steps"`
			} `json:"check"`
		}
		if json.Unmarshal(b, &v) == nil {
			for _, c := range v.Check {
				f.Add([]byte(c.Steps))
			}
		}
	}
	for _, s := range []string{`null`, `{}`, `[]`, `{"type":"date","at":"09:00"}`, `{"all":[{"field":"priority","op":"eq","value":1}]}`, `[{"id":"a","kind":"find_tasks","in":{}}]`} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, raw []byte) {
		r := json.RawMessage(raw)
		_, _ = ParseTrigger(r)
		_, _ = ParseCondition(r)
		_, _ = ParseActions(r)
		_, _ = ParseStepActions(r)
		_, _ = ParseCompare(r)
		_, _ = ParsePeriod(r)
		_, _ = ParseWhere(r)
		if steps, err := ParseSteps(r); err == nil {
			for _, trig := range []Type{TTask, TNone, TDate} {
				_, _ = Check(steps, trig)
			}
		}
	})
}
