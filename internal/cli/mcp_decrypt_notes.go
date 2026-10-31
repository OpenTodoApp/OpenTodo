package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/notesearch"
)

// The note tools through the decrypting bridge (OpenSpec change
// notes-overview, design D13): create_note and update_note are in the
// attribution table (contentArgs); append_to_note seals its text for the field
// appends.<append_id> of the note or task, with an append id chosen here;
// list_notes, get_note and the note resources get their titles, texts and
// appends decrypted; search_notes is answered here from list_notes and the
// decrypted rows, so the server never receives the query; note_to_task is
// refused, since only `ot notes to-task` can reseal a note for a new task.

// searchPages bounds the list_notes pages one local search reads (200 each).
const searchPages = 25

// encryptAppend seals append_to_note's text for its target and append id.
func (d *decrypter) encryptAppend(args map[string]any) error {
	text, _ := args["text"].(string)
	entity, id := "note", ""
	if v, ok := args["note_id"].(string); ok && v != "" {
		id = v
	} else if v, ok := args["task_id"].(string); ok && v != "" {
		entity, id = "task", v
	}
	if text == "" || id == "" || e2ee.IsCiphertext(text) {
		return nil
	}
	aid, _ := args["append_id"].(string)
	if aid == "" {
		aid = ids.New()
		args["append_id"] = aid
	}
	sealed, err := crypt.Seal(d.key, entity, id, "appends."+aid, text)
	if err != nil {
		return err
	}
	args["text"] = sealed
	return nil
}

// appendValue is one pending append of a REST row (rows carry them as an
// "appends" list instead of appends.<id> fields).
func appendValue(r map[string]json.RawMessage, aid string) string {
	var list []pendingAppend
	_ = json.Unmarshal(r["appends"], &list)
	for _, ap := range list {
		if ap.ID == aid {
			return ap.Text
		}
	}
	return ""
}

// plain returns a field's plaintext from its REST row, decrypting ciphertext;
// ok is false when the row is unknown or the value does not open.
func (d *decrypter) plain(ctx context.Context, entity, id, field string) (string, bool) {
	r := d.row(ctx, entity, id)
	if r == nil {
		return "", false
	}
	v := rawString(r[field])
	if e2ee.IsCiphertext(v) {
		return d.open(ctx, entity, id, field)
	}
	return v, true
}

// noteText is a note's whole text decrypted: the description, then each
// pending append.
func (d *decrypter) noteText(ctx context.Context, kind, id string) (string, bool) {
	desc, ok := d.plain(ctx, kind, id, "description")
	if !ok {
		return "", false
	}
	var list []pendingAppend
	_ = json.Unmarshal(d.row(ctx, kind, id)["appends"], &list)
	for i, ap := range list {
		if !e2ee.IsCiphertext(ap.Text) {
			continue
		}
		pt, ok := d.open(ctx, kind, id, "appends."+ap.ID)
		if !ok {
			return "", false
		}
		list[i].Text = pt
	}
	return plainText(desc, list), true
}

func noteTitleField(kind string) string {
	if kind == "project" {
		return "name"
	}
	return "title"
}

// isNoteObject reports whether obj is a note of list_notes, search_notes,
// get_note or the note resources (they carry kind and sit under notes/note).
func isNoteObject(obj map[string]any, key string) bool {
	if key != "notes" && key != "note" {
		return false
	}
	switch obj["kind"] {
	case "note", "task", "project":
		return true
	}
	return false
}

// fixNote puts a note's plaintext where the server put placeholders: the
// title, get_note's text and appended list, and a preview or snippet
// recomputed from the decrypted text.
func (d *decrypter) fixNote(ctx context.Context, obj, u map[string]any) {
	kind, _ := obj["kind"].(string)
	id, _ := obj["id"].(string)
	all := d.replace(ctx, u, "title", kind, id, noteTitleField(kind))
	if _, ok := u["text"]; ok {
		all = d.replace(ctx, u, "text", kind, id, "description") && all
	}
	if list, ok := u["appended"].([]any); ok {
		for _, x := range list {
			m, _ := x.(map[string]any)
			aid, _ := m["id"].(string)
			if m != nil && isPlaceholder(m["text"]) {
				all = d.replace(ctx, m, "text", kind, id, "appends."+aid) && all
			}
		}
	}
	if obj["encrypted"] == true {
		_, hasPreview := u["preview"]
		_, hasSnippet := u["snippet"]
		if hasPreview || hasSnippet {
			if text, ok := d.noteText(ctx, kind, id); ok {
				if hasPreview {
					u["preview"] = joinSegments(notesearch.Snippet(text, nil, notesearch.DefaultSnippet))
				}
				if hasSnippet {
					u["snippet"] = notesearch.Snippet(text, nil, notesearch.DefaultSnippet)
				}
			} else {
				all = false
			}
		}
	}
	if all {
		if _, ok := obj["encrypted"]; ok {
			obj["encrypted"] = false
		}
	}
}

func joinSegments(segs []notesearch.Segment) string {
	var b strings.Builder
	for _, s := range segs {
		b.WriteString(s.Text)
	}
	return b.String()
}

// answerLocally answers the tools the bridge does not forward: search_notes
// (matched here, so the query never reaches the server) and note_to_task.
func (d *decrypter) answerLocally(ctx context.Context, message []byte, tool string) ([]byte, bool) {
	if tool != "search_notes" && tool != "note_to_task" {
		return nil, false
	}
	var m struct {
		ID     json.RawMessage `json:"id"`
		Params struct {
			Arguments map[string]any `json:"arguments"`
		} `json:"params"`
	}
	if json.Unmarshal(message, &m) != nil || len(m.ID) == 0 {
		return nil, false
	}
	var result map[string]any
	if tool == "note_to_task" {
		result = toolError("encryption_enabled", "ot mcp --decrypt does not turn notes into tasks: the note's text must be sealed again for the new task on this machine. Ask the user to run `ot notes to-task <note id>` in a terminal, or to use the app.")
	} else {
		result = d.searchNotes(ctx, m.Params.Arguments)
	}
	out, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.ID, "result": result})
	if err != nil {
		return nil, false
	}
	return out, true
}

func toolError(code, msg string) map[string]any {
	payload := map[string]any{"error": code, "message": msg}
	text, _ := json.Marshal(payload)
	return map[string]any{"content": []any{map[string]any{"type": "text", "text": string(text)}}, "structuredContent": payload, "isError": true}
}

func toolOK(payload map[string]any) map[string]any {
	text, _ := json.Marshal(payload)
	return map[string]any{"content": []any{map[string]any{"type": "text", "text": string(text)}}, "structuredContent": payload}
}

// listAllNotes reads every page of list_notes with the search's filters; a
// tool error is returned as the result to pass on.
func (d *decrypter) listAllNotes(ctx context.Context, filters map[string]any) ([]map[string]any, any, map[string]any) {
	var notes []map[string]any
	var serverTime any
	cursor := ""
	for page := 0; page < searchPages; page++ {
		args := map[string]any{"limit": 200}
		for k, v := range filters {
			args[k] = v
		}
		if cursor != "" {
			args["cursor"] = cursor
		}
		msg, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": "ot-search-" + strconv.Itoa(page), "method": "tools/call",
			"params": map[string]any{"name": "list_notes", "arguments": args}})
		raw, _, err := d.c.mcp(ctx, msg)
		if err != nil {
			return nil, nil, toolError("internal", fmt.Sprintf("could not list notes: %v", err))
		}
		var resp struct {
			Result map[string]any `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &resp) != nil || resp.Error != nil || resp.Result == nil {
			msg := "could not list notes"
			if resp.Error != nil {
				msg += ": " + resp.Error.Message
			}
			return nil, nil, toolError("internal", msg)
		}
		if resp.Result["isError"] == true {
			return nil, nil, resp.Result
		}
		sc, _ := resp.Result["structuredContent"].(map[string]any)
		list, _ := sc["notes"].([]any)
		for _, x := range list {
			if n, ok := x.(map[string]any); ok {
				notes = append(notes, n)
			}
		}
		serverTime = sc["server_time"]
		if cursor, _ = sc["next_cursor"].(string); cursor == "" {
			break
		}
	}
	return notes, serverTime, nil
}

// searchNotes is search_notes on this machine: the rows list_notes returns
// (the server applies the filters and visibility), their text decrypted from
// the REST rows, matched and ranked with internal/notesearch.
func (d *decrypter) searchNotes(ctx context.Context, args map[string]any) map[string]any {
	d.rows = nil
	query, _ := args["query"].(string)
	if strings.TrimSpace(query) == "" {
		return toolError("invalid_input", "query: words to look for are required")
	}
	limit := 50
	if n, ok := args["limit"].(float64); ok && n >= 1 {
		limit = min(int(n), 200)
	}
	offset := 0
	if c, ok := args["cursor"].(string); ok && c != "" {
		n, err := strconv.Atoi(strings.TrimPrefix(c, "local:"))
		if err != nil || n < 0 || !strings.HasPrefix(c, "local:") {
			return toolError("invalid_input", "cursor: pass next_cursor of the previous search_notes result")
		}
		offset = n
	}
	filters := map[string]any{}
	for _, k := range []string{"source", "project_id", "label_id"} {
		if v, ok := args[k]; ok {
			filters[k] = v
		}
	}
	rows, serverTime, failed := d.listAllNotes(ctx, filters)
	if failed != nil {
		return failed
	}
	byKey := map[string]map[string]any{}
	texts := map[string]string{}
	notes := make([]notesearch.Note, 0, len(rows))
	for _, n := range rows {
		kind, _ := n["kind"].(string)
		id, _ := n["id"].(string)
		key := kind + ":" + id
		title, _ := d.plain(ctx, kind, id, noteTitleField(kind))
		text, _ := d.noteText(ctx, kind, id)
		u, _ := n["untrusted_text"].(map[string]any)
		if u == nil {
			u = map[string]any{}
			n["untrusted_text"] = u
		}
		if title != "" || isPlaceholder(u["title"]) {
			u["title"] = title
			if title == "" && kind == "note" {
				u["title"] = untitledNote
			}
		}
		delete(u, "preview")
		byKey[key], texts[key] = n, text
		notes = append(notes, notesearch.Note{Key: key, Title: title, Text: text, Updated: updatedOf(n)})
	}
	terms := notesearch.ParseQuery(query)
	hits := notesearch.Rank(notes, query)
	out := []any{}
	for i := offset; i < len(hits) && len(out) < limit; i++ {
		n := byKey[hits[i].Note.Key]
		n["untrusted_text"].(map[string]any)["snippet"] = notesearch.Snippet(texts[hits[i].Note.Key], terms, notesearch.DefaultSnippet)
		if _, ok := n["encrypted"]; ok {
			n["encrypted"] = false
		}
		out = append(out, n)
	}
	var next any
	if offset+len(out) < len(hits) {
		next = "local:" + strconv.Itoa(offset+len(out))
	}
	return toolOK(map[string]any{"notes": out, "next_cursor": next, "server_time": serverTime})
}

// updatedOf reads a list_notes row's updated_at (RFC 3339) for the ranking's
// tie-break; rows without one sort last.
func updatedOf(n map[string]any) int64 {
	s, _ := n["updated_at"].(string)
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}
