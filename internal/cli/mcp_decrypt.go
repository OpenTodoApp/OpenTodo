package cli

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/e2ee/crypt"
	"github.com/pixari/opentodo/internal/timetrack"
)

// The decrypting bridge (OpenSpec change mcp-projects, design D5): `ot mcp
// --decrypt` forwards every message to the server's /mcp unchanged in kind and
// transforms it on the user's machine. Write calls get their content arguments
// encrypted for the target entity, id and field (creates get a chosen id);
// results get each placeholder the server put where an encrypted value was
// replaced by that value's plaintext, read from the raw row over the REST API
// and decrypted here. The server keeps seeing ciphertext only, and decrypted
// text stays inside the untrusted_text objects it came in.

// ciphertextOnlyNote is agenttools.CiphertextOnlyNote (kept equal by a test):
// the bridge removes it from tool descriptions, since its assistant writes
// plaintext that the bridge encrypts.
const ciphertextOnlyNote = " This account uses end-to-end encryption: ciphertext only, an enc:v1: envelope made with the account key on the user's machine (ot mcp --decrypt does it); plaintext is refused."

// PlaintextNotice is written to stderr when the decrypting bridge starts (design D8).
const PlaintextNotice = "The assistant will read your encrypted tasks in plain text; your AI provider receives them. The server still receives only ciphertext."

// contentArgs is the attribution table of write calls: for each tool, where its
// items are, which entity they write and which arguments are content. creates
// get a chosen id when the call has none.
var contentArgs = map[string]struct {
	list   string // "" for a single object call
	entity string
	fields []string
	create bool
}{
	"create_tasks":    {list: "items", entity: "task", fields: []string{"title", "description"}, create: true},
	"update_tasks":    {list: "updates", entity: "task", fields: []string{"title", "description"}},
	"create_project":  {entity: "project", fields: []string{"name"}, create: true},
	"update_project":  {entity: "project", fields: []string{"name"}},
	"create_label":    {entity: "label", fields: []string{"name"}, create: true},
	"add_comment":     {entity: "comment", fields: []string{"body"}, create: true},
	"create_sections": {list: "items", entity: "section", fields: []string{"name"}, create: true},
	"update_sections": {list: "updates", entity: "section", fields: []string{"name"}},
}

type decrypter struct {
	c   *client
	key []byte
	// version is the key version the stored key belongs to.
	version int
	rows    map[string]map[string]map[string]json.RawMessage // entity → id → row
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// before prepares one client message: a tools/call or resources/read first
// checks that the stored key still matches the account (stale when the key
// version changed), and a tools/call gets its content arguments encrypted.
func (d *decrypter) before(ctx context.Context, message []byte) ([]byte, string, string, bool, error) {
	var m map[string]any
	if json.Unmarshal(message, &m) != nil {
		return message, "", "", false, nil
	}
	method, _ := m["method"].(string)
	if method != "tools/call" && method != "resources/read" {
		return message, method, "", false, nil
	}
	st, err := d.c.encryptionStatus(ctx)
	if err != nil {
		return nil, "", "", false, err
	}
	if !st.Enabled || st.KeyVersion != d.version {
		return message, method, "", true, nil
	}
	if method != "tools/call" {
		return message, method, "", false, nil
	}
	params, _ := m["params"].(map[string]any)
	if params == nil {
		return message, method, "", false, nil
	}
	tool, _ := params["name"].(string)
	if err := d.encryptCall(params); err != nil {
		return nil, "", "", false, err
	}
	out, err := json.Marshal(m)
	if err != nil {
		return nil, "", "", false, err
	}
	return out, method, tool, false, nil
}

// after transforms one server response: tool definitions lose their
// ciphertext-only wording, tool results and resources get plaintext where the
// server put the placeholder. Anything it cannot parse passes unchanged.
func (d *decrypter) after(ctx context.Context, response []byte, method, _ string) []byte {
	var m map[string]any
	if json.Unmarshal(response, &m) != nil {
		return response
	}
	result, _ := m["result"].(map[string]any)
	if result == nil {
		return response
	}
	switch method {
	case "tools/list":
		rewriteToolsList(result)
	case "tools/call":
		if result["isError"] == true {
			return response
		}
		sc, ok := result["structuredContent"]
		if !ok {
			return response
		}
		d.decryptResult(ctx, sc)
		text, err := json.Marshal(sc)
		if err != nil {
			return response
		}
		result["content"] = []any{map[string]any{"type": "text", "text": string(text)}}
	case "resources/read":
		contents, _ := result["contents"].([]any)
		for _, c := range contents {
			cm, _ := c.(map[string]any)
			s, _ := cm["text"].(string)
			var doc any
			if cm == nil || json.Unmarshal([]byte(s), &doc) != nil {
				continue
			}
			d.decryptResult(ctx, doc)
			if text, err := json.Marshal(doc); err == nil {
				cm["text"] = string(text)
			}
		}
	default:
		return response
	}
	out, err := json.Marshal(m)
	if err != nil {
		return response
	}
	return out
}

// encryptCall rewrites a tools/call request's content arguments as envelopes.
func (d *decrypter) encryptCall(params map[string]any) error {
	name, _ := params["name"].(string)
	spec, ok := contentArgs[name]
	if !ok {
		return nil
	}
	args, _ := params["arguments"].(map[string]any)
	if args == nil {
		return nil
	}
	items := []map[string]any{args}
	if spec.list != "" {
		items = nil
		list, _ := args[spec.list].([]any)
		for _, it := range list {
			if m, ok := it.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	for _, it := range items {
		id, _ := it["id"].(string)
		if spec.create && id == "" {
			// A plaintext-free create needs the id before the server sees the call.
			has := false
			for _, f := range spec.fields {
				if _, ok := it[f]; ok {
					has = true
				}
			}
			if !has {
				continue
			}
			id = newUUID()
			it["id"] = id
		}
		if id == "" {
			continue
		}
		for _, f := range spec.fields {
			s, ok := it[f].(string)
			if !ok {
				continue
			}
			v, err := crypt.Seal(d.key, spec.entity, id, f, s)
			if err != nil {
				return err
			}
			it[f] = v
		}
	}
	return nil
}

// rewriteToolsList removes the ciphertext-only wording from tool definitions.
func rewriteToolsList(result map[string]any) {
	tools, _ := result["tools"].([]any)
	var walk func(v any)
	walk = func(v any) {
		switch t := v.(type) {
		case map[string]any:
			for k, x := range t {
				if s, ok := x.(string); ok && k == "description" {
					t[k] = strings.TrimSuffix(s, ciphertextOnlyNote)
					continue
				}
				walk(x)
			}
		case []any:
			for _, x := range t {
				walk(x)
			}
		}
	}
	walk(tools)
}

// row returns the raw row of entity id, loading the entity's collection once
// per message; nil when it is unknown.
func (d *decrypter) row(ctx context.Context, entity, id string) map[string]json.RawMessage {
	if id == "" {
		return nil
	}
	if d.rows == nil {
		d.rows = map[string]map[string]map[string]json.RawMessage{}
	}
	m, ok := d.rows[entity]
	if !ok {
		m = map[string]map[string]json.RawMessage{}
		d.rows[entity] = m
		var list []map[string]json.RawMessage
		switch entity {
		case "task", "project", "label", "section", "field":
			var out map[string][]map[string]json.RawMessage
			if d.c.getJSON(ctx, "/"+entity+"s", &out) == nil {
				list = out[entity+"s"]
			}
		case "time_entry":
			cursor := ""
			for page := 0; page < 50; page++ {
				var out struct {
					Entries    []map[string]json.RawMessage `json:"entries"`
					NextCursor string                       `json:"nextCursor"`
				}
				path := "/time-entries?limit=200"
				if cursor != "" {
					path += "&cursor=" + url.QueryEscape(cursor)
				}
				if d.c.getJSON(ctx, path, &out) != nil {
					break
				}
				list = append(list, out.Entries...)
				if cursor = out.NextCursor; cursor == "" {
					break
				}
			}
		}
		for _, r := range list {
			m[rawString(r["id"])] = r
		}
	}
	return m[id]
}

// commentsOf loads one task's comments into the comment cache.
func (d *decrypter) commentsOf(ctx context.Context, taskID string) {
	if d.rows == nil {
		d.rows = map[string]map[string]map[string]json.RawMessage{}
	}
	if d.rows["comment"] == nil {
		d.rows["comment"] = map[string]map[string]json.RawMessage{}
	}
	var out struct {
		Comments []map[string]json.RawMessage `json:"comments"`
	}
	if d.c.getJSON(ctx, "/tasks/"+url.PathEscape(taskID)+"/comments", &out) == nil {
		for _, r := range out.Comments {
			d.rows["comment"][rawString(r["id"])] = r
		}
	}
}

func rawString(r json.RawMessage) string {
	var s string
	_ = json.Unmarshal(r, &s)
	return s
}

// open decrypts entity.id.field from its raw row; ok is false when the stored
// value is not ciphertext or does not open with this key.
func (d *decrypter) open(ctx context.Context, entity, id, field string) (string, bool) {
	r := d.row(ctx, entity, id)
	if r == nil {
		return "", false
	}
	v := rawString(r[field])
	if fid, ok := strings.CutPrefix(field, "fields."); ok {
		// REST folds a task's fields.<id> values into one fields object.
		var values map[string]json.RawMessage
		_ = json.Unmarshal(r["fields"], &values)
		v = rawString(values[fid])
	}
	if !e2ee.IsCiphertext(v) {
		return "", false
	}
	pt, err := crypt.Open(d.key, entity, id, field, v)
	return pt, err == nil
}

// isPlaceholder reports whether the server put a placeholder where an
// encrypted value was: e2ee.Placeholder, or timetrack.Encrypted for notes.
func isPlaceholder(v any) bool {
	s, ok := v.(string)
	return ok && (s == e2ee.Placeholder || s == timetrack.Encrypted)
}

// replace sets m[k] to the decrypted value when it is a placeholder.
func (d *decrypter) replace(ctx context.Context, m map[string]any, k, entity, id, field string) bool {
	if !isPlaceholder(m[k]) {
		return true
	}
	if pt, ok := d.open(ctx, entity, id, field); ok {
		m[k] = pt
		return true
	}
	return false
}

// decryptResult walks a tool result or resource and replaces placeholders
// (the attribution table of results: tasks, projects and project counts,
// custom field definitions, comments, time entries).
func (d *decrypter) decryptResult(ctx context.Context, v any) {
	d.rows = nil
	taskID := ""
	if top, ok := v.(map[string]any); ok {
		if t, ok := top["task"].(map[string]any); ok {
			taskID, _ = t["id"].(string)
			if _, ok := top["comments"]; ok && taskID != "" {
				d.commentsOf(ctx, taskID)
			}
		}
	}
	d.walk(ctx, v, "")
}

// walk visits every object; key is the name of the list or field holding it.
func (d *decrypter) walk(ctx context.Context, v any, key string) {
	switch t := v.(type) {
	case map[string]any:
		if u, ok := t["untrusted_text"].(map[string]any); ok {
			d.fix(ctx, t, u, key)
		}
		for k, x := range t {
			d.walk(ctx, x, k)
		}
	case []any:
		for _, x := range t {
			d.walk(ctx, x, key)
		}
	}
}

func (d *decrypter) fix(ctx context.Context, obj, u map[string]any, key string) {
	id, _ := obj["id"].(string)
	all := true
	switch {
	case key == "sections": // a project resource's sections
		all = d.replace(ctx, u, "name", "section", id, "name") && all
	case u["title"] != nil || obj["label_ids"] != nil: // a task
		all = d.replace(ctx, u, "title", "task", id, "title") && all
		if _, ok := u["description"]; ok {
			all = d.replace(ctx, u, "description", "task", id, "description") && all
		}
		pid, _ := obj["project_id"].(string)
		all = d.replace(ctx, u, "project", "project", pid, "name") && all
		sid, _ := obj["section_id"].(string)
		all = d.replace(ctx, u, "section", "section", sid, "name") && all
		names, _ := u["labels"].([]any)
		ids, _ := obj["label_ids"].([]any)
		for i := range names {
			if i < len(ids) {
				lid, _ := ids[i].(string)
				if isPlaceholder(names[i]) {
					if pt, ok := d.open(ctx, "label", lid, "name"); ok {
						names[i] = pt
					} else {
						all = false
					}
				}
			}
		}
		if fields, ok := u["fields"].(map[string]any); ok {
			for fid := range fields {
				all = d.replace(ctx, fields, fid, "task", id, "fields."+fid) && all
			}
		}
		if obj["origin"] == nil {
			if pt, ok := d.open(ctx, "task", id, "origin"); ok {
				var o struct {
					Kind     string `json:"kind"`
					Provider string `json:"provider,omitempty"`
					ID       string `json:"id,omitempty"`
					URL      string `json:"url,omitempty"`
					Title    string `json:"title,omitempty"`
				}
				if json.Unmarshal([]byte(pt), &o) == nil && o.Kind != "" {
					obj["origin"] = map[string]any{"kind": o.Kind, "provider": o.Provider, "id": o.ID}
					if o.URL != "" || o.Title != "" {
						u["origin"] = map[string]any{"title": o.Title, "url": o.URL}
					}
				}
			}
		}
	case u["body"] != nil: // a comment
		all = d.replace(ctx, u, "body", "comment", id, "body") && all
	case u["note"] != nil: // a time entry
		all = d.replace(ctx, u, "note", "time_entry", id, "note") && all
		tid, _ := obj["task_id"].(string)
		all = d.replace(ctx, u, "task", "task", tid, "title") && all
	case obj["type"] != nil && u["name"] != nil: // a custom field definition
		all = d.replace(ctx, u, "name", "field", id, "name") && all
		if opts, ok := u["options"].([]any); ok && len(opts) == 1 && isPlaceholder(opts[0]) {
			if pt, ok := d.open(ctx, "field", id, "options"); ok {
				var list []any
				for _, l := range strings.Split(pt, "\n") {
					if l = strings.TrimSpace(l); l != "" {
						list = append(list, l)
					}
				}
				u["options"] = list
			} else {
				all = false
			}
		}
	case u["name"] != nil: // a project (list_projects, today_summary counts, resources)
		all = d.replace(ctx, u, "name", "project", id, "name") && all
		if _, ok := u["description"]; ok {
			all = d.replace(ctx, u, "description", "project", id, "description") && all
		}
	}
	if all {
		if _, ok := obj["encrypted"]; ok {
			obj["encrypted"] = false
		}
	}
}
