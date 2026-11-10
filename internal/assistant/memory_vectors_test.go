package assistant

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// memoryCase is one remember call over live items and the draft's new ones,
// and what PlanRemember answers: an error code, or the text it proposes.
type memoryCase struct {
	Name  string          `json:"name"`
	Live  []string        `json:"live"`
	Draft []string        `json:"draft,omitempty"`
	Args  json.RawMessage `json:"args"`
	Error string          `json:"error,omitempty"`
	Text  string          `json:"text,omitempty"`
}

// TestDeviceMemoryVectors pins the device's remember (memory.ts) to PlanRemember.
func TestDeviceMemoryVectors(t *testing.T) {
	full := make([]string, MaxMemoryItems)
	for i := range full {
		full[i] = "Fact " + string(rune('a'+i))
	}
	cases := []memoryCase{
		{Name: "plain", Live: []string{"Anna is my manager"}, Args: json.RawMessage(`{"text":"Does not work on Fridays"}`)},
		{Name: "whitespace and lines", Args: json.RawMessage(`{"text":"  Mornings are\n\tfor  deep work  "}`)},
		{Name: "200 characters", Args: json.RawMessage(`{"text":"` + strings.Repeat("é", 200) + `"}`)},
		{Name: "201 characters", Args: json.RawMessage(`{"text":"` + strings.Repeat("é", 201) + `"}`)},
		{Name: "empty", Args: json.RawMessage(`{"text":"  "}`)},
		{Name: "missing", Args: json.RawMessage(`{}`)},
		{Name: "unknown argument", Args: json.RawMessage(`{"text":"Fine","pin":true}`)},
		{Name: "not a string", Args: json.RawMessage(`{"text":3}`)},
		{Name: "ciphertext", Args: json.RawMessage(`{"text":"enc:v1:AAAA"}`)},
		{Name: "duplicate ignoring case", Live: []string{"Does not work on Fridays"}, Args: json.RawMessage(`{"text":"does NOT work on fridays"}`)},
		{Name: "duplicate in the draft", Draft: []string{"Likes tea"}, Args: json.RawMessage(`{"text":"Likes tea"}`)},
		{Name: "twentieth", Live: full[:19], Args: json.RawMessage(`{"text":"Twentieth"}`)},
		{Name: "full", Live: full, Args: json.RawMessage(`{"text":"Twenty-first"}`)},
		{Name: "full with the draft", Live: full[:19], Draft: []string{"Twentieth"}, Args: json.RawMessage(`{"text":"Twenty-first"}`)},
	}
	for i := range cases {
		c := &cases[i]
		if c.Live == nil {
			c.Live = []string{}
		}
		var draft agenttools.ChangeSet
		for j, d := range c.Draft {
			txt, _ := json.Marshal(d)
			draft = append(draft, agenttools.Change{Entity: "memory", EntityID: "d" + string(rune('0'+j)), Create: true, Patch: map[string]json.RawMessage{"text": txt}})
		}
		out, ch := PlanRemember(c.Live, draft, c.Args, "id", 1)
		if ch == nil {
			c.Error, _ = out["error"].(string)
		} else {
			c.Text, _ = out["text"].(string)
		}
	}
	checkFile(t, "memory.vectors.json", cases)
}
