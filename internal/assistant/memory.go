package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Memory (OpenSpec change assistant-memory): short facts the user confirmed,
// stored as the synced entity memory. Every in-app turn sends the live items in
// the fixed instructions (design D3); remember proposes a new one (D2). Both
// live here, beside the display tools and outside the shared registry, so MCP
// clients, agent tokens and routines never see a memory item.

const (
	// MaxMemoryItems is the most live items a user keeps (devices refuse a 21st).
	MaxMemoryItems = 20
	// MaxMemoryText is the longest item in characters.
	MaxMemoryText = opsync.MaxMemoryText
)

// MemoryNote introduces the items in the fixed instructions.
const MemoryNote = "The user's stated preferences (from Memory; follow them unless the user says otherwise):"

// Messages of remember's refusals (the device's manifest carries them too).
const (
	MemoryFullMessage       = "Memory holds at most 20 items and is full, so nothing was added. Tell the user they can remove items in Settings → Integrations → Assistant → Memory."
	MemoryDuplicateMessage  = "Memory already holds this fact, so nothing was added."
	MemoryInvalidMessage    = "text: one fact of 1 to 200 characters"
	MemoryProposedNote      = "Proposed, not applied: the user reviews it and confirms it in the app."
	memoryUnavailableReason = "the tool remember is not available in this turn; use only the tools listed"
)

// RememberTool proposes one memory item; it is offered in turns without a skill.
var RememberTool = ToolDef{
	Name: "remember",
	Description: "Propose remembering one lasting fact the user stated about themselves or how they like to work, such as \"Does not work on Fridays\". " +
		"The proposal is reviewed like any other change; once applied, the fact is sent with every later turn. Changes nothing until the user applies it.",
	Schema: map[string]any{"type": "object", "additionalProperties": false, "required": []string{"text"}, "properties": map[string]any{
		"text": map[string]any{"type": "string", "minLength": 1, "maxLength": MaxMemoryText, "description": "The fact as one short sentence in the user's language, at most 200 characters."},
	}},
}

// CleanMemory is an item's text as a turn uses it: whitespace runs and line
// breaks become one space, and the text is cut to MaxMemoryText characters.
func CleanMemory(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > MaxMemoryText {
		s = string([]rune(s)[:MaxMemoryText])
	}
	return s
}

// memorySection is the items in the fixed instructions, at most MaxMemoryItems
// in their order; empty when there are none.
func memorySection(items []string) string {
	var lines []string
	for _, it := range items {
		if c := CleanMemory(it); c != "" && len(lines) < MaxMemoryItems {
			lines = append(lines, "- "+c)
		}
	}
	if len(lines) == 0 {
		return ""
	}
	return "\n\n" + MemoryNote + "\n" + strings.Join(lines, "\n") + "\n"
}

// memoryRow is one live item.
type memoryRow struct {
	ID, Text string
	Position float64
}

// memoryRows are the user's live items in their order (position, then id).
// A ciphertext text is left out: the server never reads an encrypted item
// (encrypted accounts run the assistant on their device).
func (l *Loop) memoryRows(ctx context.Context, userID string) ([]memoryRow, map[string]bool, error) {
	list, err := l.Sync.List(ctx, userID, "memory", true)
	if err != nil {
		return nil, nil, fmt.Errorf("read memory: %w", err)
	}
	known := map[string]bool{}
	var out []memoryRow
	for _, e := range list {
		id := rawString(e["id"])
		known[id] = true
		text := rawString(e["text"])
		if e.Deleted() || e2ee.IsCiphertext(text) || strings.TrimSpace(text) == "" {
			continue
		}
		var pos float64
		_ = json.Unmarshal(e["position"], &pos)
		out = append(out, memoryRow{ID: id, Text: text, Position: pos})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Position != out[j].Position {
			return out[i].Position < out[j].Position
		}
		return out[i].ID < out[j].ID
	})
	return out, known, nil
}

// Memory is the texts a turn sends, in order.
func (l *Loop) Memory(ctx context.Context, userID string) ([]string, error) {
	rows, _, err := l.memoryRows(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Text)
	}
	return out, nil
}

// PlanRemember checks one remember call against the live items and the
// draft's new ones: the text is cleaned, a duplicate (ignoring case) or a 21st
// item is refused. It returns the tool result and, when accepted, the change.
// The device's twin (web/src/lib/assistantDevice/memory.ts) is pinned by
// memory.vectors.json.
func PlanRemember(live []string, draft agenttools.ChangeSet, raw json.RawMessage, id string, now int64) (map[string]any, *agenttools.Change) {
	var a map[string]json.RawMessage
	var text string
	if json.Unmarshal(raw, &a) != nil || len(a) != 1 || json.Unmarshal(a["text"], &text) != nil {
		return map[string]any{"error": "invalid_arguments", "message": MemoryInvalidMessage}, nil
	}
	text = strings.Join(strings.Fields(text), " ")
	if text == "" || utf8.RuneCountInString(text) > MaxMemoryText || e2ee.IsCiphertext(text) {
		return map[string]any{"error": "invalid_arguments", "message": MemoryInvalidMessage}, nil
	}
	have := append([]string{}, live...)
	for _, c := range draft {
		if c.Entity == "memory" && c.Create {
			have = append(have, rawString(c.Patch["text"]))
		}
	}
	for _, h := range have {
		if strings.EqualFold(CleanMemory(h), text) {
			return map[string]any{"error": "already_remembered", "message": MemoryDuplicateMessage}, nil
		}
	}
	if len(have) >= MaxMemoryItems {
		return map[string]any{"error": "memory_full", "message": MemoryFullMessage, "limit": MaxMemoryItems}, nil
	}
	t, _ := json.Marshal(text)
	n, _ := json.Marshal(now)
	ch := agenttools.Change{Entity: "memory", EntityID: id, Create: true, Patch: map[string]json.RawMessage{"text": t, "position": n, "created_at": n}}
	return map[string]any{"proposed": true, "text": text, "status_note": MemoryProposedNote}, &ch
}

// runRemember runs one remember call of a turn into the draft.
func (l *Loop) runRemember(ctx context.Context, in TurnInput, call ToolCall, draft *agenttools.ChangeSet, now int64) (string, bool, error) {
	if in.Skill != nil {
		return marshal(map[string]any{"error": "unavailable", "message": memoryUnavailableReason}), true, nil
	}
	rows, _, err := l.memoryRows(ctx, in.UserID)
	if err != nil {
		return "", true, err
	}
	live := make([]string, 0, len(rows))
	for _, r := range rows {
		live = append(live, r.Text)
	}
	out, ch := PlanRemember(live, *draft, call.Args, ids.New(), now)
	if ch == nil {
		return marshal(out), true, nil
	}
	next := append(append(agenttools.ChangeSet{}, *draft...), *ch)
	if n := countEntities(next); n > MaxEntities {
		return marshal(map[string]any{"error": "proposal_full", "message": fmt.Sprintf("one proposal holds at most %d changed items; nothing from this call was added.", MaxEntities),
			"limit": MaxEntities, "in_proposal": countEntities(*draft)}), true, nil
	}
	*draft = next
	return marshal(out), false, nil
}

// openMemory checks the memory items of an open proposal (assistant-proposal-editing
// D3 for remember): only new items with a valid id that names no item yet, whose
// fields the op schema accepts. It returns them and the other items.
func (l *Loop) openMemory(ctx context.Context, userID string, open []Proposed) (kept agenttools.ChangeSet, rest []Proposed, dropped int, err error) {
	var mem []Proposed
	for _, p := range open {
		if p.Entity == "memory" {
			mem = append(mem, p)
		} else {
			rest = append(rest, p)
		}
	}
	if len(mem) == 0 {
		return nil, rest, 0, nil
	}
	_, known, err := l.memoryRows(ctx, userID)
	if err != nil {
		return nil, rest, 0, err
	}
	for _, p := range mem {
		if !p.Create || known[p.EntityID] || !opsync.ValidEntityID(p.EntityID) || !memoryPatchOK(p) {
			dropped++
			continue
		}
		known[p.EntityID] = true
		kept = append(kept, agenttools.Change{Entity: "memory", EntityID: p.EntityID, Create: true, Patch: p.Patch})
	}
	return kept, rest, dropped, nil
}

// memoryPatchOK reports whether an open memory item sets a plain text and only
// the fields remember writes, each a value the op schema accepts.
func memoryPatchOK(p Proposed) bool {
	if _, ok := p.Patch["text"]; !ok || len(p.Base) > 0 || e2ee.IsCiphertextJSON(p.Patch["text"]) {
		return false
	}
	for f, v := range p.Patch {
		if f != "text" && f != "position" && f != "created_at" {
			return false
		}
		if opsync.Validate(opsync.Op{ID: "open", Entity: "memory", EntityID: p.EntityID, Field: f, Value: v, TS: 1, Device: "open"}) != nil {
			return false
		}
	}
	return true
}
