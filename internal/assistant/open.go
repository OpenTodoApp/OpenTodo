package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// Proposals that grow over turns (OpenSpec change assistant-proposal-editing,
// design D3): while a proposal is open and unapplied, the app sends it with the
// next turn. The loop checks it, seeds its draft with it, and the write tools
// plan on top; the final change set is the merge. drop_from_proposal removes
// items. Nothing is stored: the proposal lives in the app until it is applied.

// MaxOpenProposal is the most items an open proposal may hold; more is refused
// with 413 too_large before the provider is called.
const MaxOpenProposal = agenttools.MaxOpenProposal

// OpenProposalNote introduces the open proposal in the fixed instructions (the device's manifest).
const OpenProposalNote = "Open proposal: the user has not applied these changes yet, and this turn amends them. Your write tools add to it, and a write to an item in it changes that item; drop_from_proposal removes items the user no longer wants. Keep the items the user did not ask about. Its items, one per line:"

// DropTool removes items from the open proposal; it is offered only with one.
var DropTool = ToolDef{
	Name:        "drop_from_proposal",
	Description: "Remove items from the open proposal by their ids, for example when the user no longer wants one of the proposed changes. Changes nothing in the app; the user reviews the amended proposal.",
	Schema: map[string]any{"type": "object", "additionalProperties": false, "required": []string{"ids"}, "properties": map[string]any{
		"ids": map[string]any{"type": "array", "minItems": 1, "maxItems": MaxOpenProposal, "description": "Ids of items in the open proposal.", "items": map[string]any{"type": "string"}},
	}},
}

// openDraft checks the open proposal a turn sent back and returns the draft it
// seeds; items that fail a check are left out (a failed check leaves out all).
func (l *Loop) openDraft(ctx context.Context, userID string, open []Proposed, log *slog.Logger) agenttools.ChangeSet {
	if len(open) == 0 {
		return nil
	}
	kept, dropped, err := l.Tools.OpenProposal(ctx, userID, changesOf(open))
	if err != nil {
		log.Error("assistant open proposal not read", "err", err)
		return nil
	}
	if dropped > 0 {
		log.Info("assistant open proposal items left out", "count", dropped)
	}
	return kept
}

// changesOf and proposedOf convert between the wire's items and the draft's changes.
func changesOf(open []Proposed) agenttools.ChangeSet {
	out := make(agenttools.ChangeSet, 0, len(open))
	for _, p := range open {
		out = append(out, agenttools.Change{Entity: p.Entity, EntityID: p.EntityID, Create: p.Create, Patch: p.Patch, Base: p.Base})
	}
	return out
}

func proposedOf(cs agenttools.ChangeSet) []Proposed {
	out := make([]Proposed, 0, len(cs))
	for _, c := range cs {
		out = append(out, Proposed{Entity: c.Entity, EntityID: c.EntityID, Create: c.Create, Patch: c.Patch, Base: c.Base})
	}
	return out
}

// openSection is the open proposal in the fixed instructions: the note, then one
// JSON line per item (entity, id, new when it creates, set: its values).
func openSection(open agenttools.ChangeSet) string {
	if len(open) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\n" + OpenProposalNote + "\n")
	for _, c := range open {
		b.WriteString(openLine(c) + "\n")
	}
	return b.String()
}

// openLine writes one item as compact JSON with its fields in name order, no HTML
// escaping (the device writes the same line with JSON.stringify).
func openLine(c agenttools.Change) string {
	fields := make([]string, 0, len(c.Patch))
	for f := range c.Patch {
		fields = append(fields, f)
	}
	sort.Strings(fields)
	var set bytes.Buffer
	set.WriteByte('{')
	for i, f := range fields {
		if i > 0 {
			set.WriteByte(',')
		}
		set.WriteString(jsonText(f) + ":" + jsonText(c.Patch[f]))
	}
	set.WriteByte('}')
	line := `{"entity":` + jsonText(c.Entity) + `,"id":` + jsonText(c.EntityID)
	if c.Create {
		line += `,"new":true`
	}
	return line + `,"set":` + set.String() + "}"
}

func jsonText(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "null"
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

// dropFromDraft runs drop_from_proposal: every change to a named item leaves the draft.
func dropFromDraft(draft *agenttools.ChangeSet, raw json.RawMessage) (string, bool) {
	var a struct {
		IDs []string `json:"ids"`
	}
	if err := json.Unmarshal(raw, &a); err != nil || len(a.IDs) == 0 || len(a.IDs) > MaxOpenProposal {
		return marshal(map[string]any{"error": "invalid_arguments", "message": fmt.Sprintf("ids holds 1 to %d ids of items in the open proposal", MaxOpenProposal)}), true
	}
	drop := map[string]bool{}
	for _, id := range a.IDs {
		drop[id] = true
	}
	found := map[string]bool{}
	kept := (*draft)[:0:0]
	for _, c := range *draft {
		if drop[c.EntityID] {
			found[c.EntityID] = true
			continue
		}
		kept = append(kept, c)
	}
	*draft = kept
	out := map[string]any{"dropped": len(found), "status_note": "Removed from the proposal; the user reviews what is left."}
	if n := len(drop) - len(found); n > 0 {
		out["not_in_proposal"] = n
	}
	return marshal(out), false
}
