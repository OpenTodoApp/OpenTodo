package agenttools

import (
	"encoding/json"
	"testing"
)

// agent-routine-sends: the steps and the legacy action that send content off
// the server, wherever they sit in a routine.
func TestSendsOut(t *testing.T) {
	cases := []struct {
		name           string
		steps, actions string
		want           bool
	}{
		{"none", ``, ``, false},
		{"plain", `[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"x"}}}]`, `null`, false},
		{"notify stays in the app", `[{"id":"a","kind":"notify","in":{"text":{"literal":"x"}}}]`, ``, false},
		{"webhook", `[{"id":"a","kind":"webhook","in":{"webhook_id":{"literal":"h"}}}]`, ``, true},
		{"email_me", `[{"id":"a","kind":"email_me","in":{}}]`, ``, true},
		{"email_members", `[{"id":"a","kind":"email_members","in":{}}]`, ``, true},
		{"in a branch", `[{"id":"a","kind":"if","then":[],"otherwise":[{"id":"b","kind":"webhook"}]}]`, ``, true},
		{"in a loop", `[{"id":"a","kind":"for_each","do":[{"id":"b","kind":"email_me"}]}]`, ``, true},
		{"legacy action", ``, `{"priority":1,"webhook":{"webhook_id":"h"}}`, true},
		{"legacy action cleared", ``, `{"priority":1,"webhook":null}`, false},
		{"a text that names a kind", `[{"id":"a","kind":"create_tasks","in":{"title":{"literal":"webhook"}}}]`, ``, false},
	}
	for _, c := range cases {
		if got := sendsOut(json.RawMessage(c.steps), json.RawMessage(c.actions)); got != c.want {
			t.Errorf("%s: sendsOut = %v, want %v", c.name, got, c.want)
		}
	}
}
