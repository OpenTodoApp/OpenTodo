package rules

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// The routine starters of OpenSpec change routines-starters (design D3): every
// starter of templates/routines/, compiled with its test into
// testdata/starters.json by `make templates`, has its choices filled and runs
// through a real run against its seeded data, which must write exactly what its
// test expects. The use-case runner of usecases_test.go does the run.

type starterTest struct {
	ucSeed
	Fill   map[string]string `json:"fill"`
	RunOn  string            `json:"run_on"`
	Email  bool              `json:"email"`
	Expect ucExpect          `json:"expect"`
}

type starter struct {
	Slug      string          `json:"slug"`
	Trigger   json.RawMessage `json:"trigger"`
	Condition json.RawMessage `json:"condition"`
	Steps     json.RawMessage `json:"steps"`
	Ask       map[string]struct {
		Type string `json:"type"`
	} `json:"ask"`
	Test starterTest `json:"test"`
}

// fillChoices replaces every {"ask": name} in v with the chosen id.
func fillChoices(t *testing.T, v any, fill map[string]string) any {
	t.Helper()
	switch x := v.(type) {
	case map[string]any:
		if name, ok := x["ask"].(string); ok && len(x) == 1 {
			id, ok := fill[name]
			if !ok {
				t.Fatalf("choice %q has no id in the test", name)
			}
			return id
		}
		out := map[string]any{}
		for k, e := range x {
			out[k] = fillChoices(t, e, fill)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = fillChoices(t, e, fill)
		}
		return out
	}
	return v
}

func filled(t *testing.T, raw json.RawMessage, fill map[string]string) json.RawMessage {
	t.Helper()
	if len(raw) == 0 {
		return nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(fillChoices(t, v, fill))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), `"ask"`) {
		t.Fatalf("a choice is left in %s", out)
	}
	return out
}

func TestStarters(t *testing.T) {
	raw, err := os.ReadFile("testdata/starters.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Starters []starter `json:"starters"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Starters) < 8 {
		t.Fatalf("only %d starters", len(f.Starters))
	}
	for _, s := range f.Starters {
		t.Run(s.Slug, func(t *testing.T) {
			if strings.Contains(string(s.Steps), `"get_task"`) || strings.Contains(string(s.Steps), `"literal":{"task"`) {
				t.Fatal("a starter never holds a task chosen by hand")
			}
			c := ucCase{
				ucSeed:    s.Test.ucSeed,
				Name:      s.Slug,
				Trigger:   filled(t, s.Trigger, s.Test.Fill),
				Condition: filled(t, s.Condition, s.Test.Fill),
				RunOn:     s.Test.RunOn,
				Steps:     filled(t, s.Steps, s.Test.Fill),
				Email:     s.Test.Email,
				Expect:    s.Test.Expect,
			}
			runUseCase(t, ucFile{}, c)
		})
	}
}
