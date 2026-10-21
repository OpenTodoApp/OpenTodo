package vault

import (
	"encoding/json"
	"sort"
	"strings"
)

// Op is one operation of the log, as `POST /api/v1/sync` sends and serves it.
type Op struct {
	ID       string          `json:"id"`
	Entity   string          `json:"entity"`
	EntityID string          `json:"entityId"`
	Field    string          `json:"field"`
	Value    json.RawMessage `json:"value"`
	TS       int64           `json:"ts"`
	Device   string          `json:"device"`
	Seq      int64           `json:"seq,omitempty"`
}

// Field is one stored value and the clock of the op that wrote it.
type Field struct {
	V  json.RawMessage `json:"v"`
	TS int64           `json:"t"`
	D  string          `json:"d"`
}

// Row is the materialised state of one entity.
type Row map[string]Field

// Store holds the entities the vault reads, by entity and id (design D6).
type Store map[string]map[string]Row

// kept are the entities the vault needs: what it prints and what it resolves.
var kept = map[string]bool{"task": true, "project": true, "section": true, "label": true, "field": true, "time_entry": true}

// wins is the winner rule of the log: a greater timestamp wins, ties go to the
// greater device id (internal/sync.Wins).
func wins(ts int64, device string, cur Field) bool {
	return ts > cur.TS || ts == cur.TS && device > cur.D
}

// Apply folds one op into the store under the winner rule and reports whether
// it changed the stored value.
func (s Store) Apply(op Op) bool {
	if !kept[op.Entity] {
		return false
	}
	byID := s[op.Entity]
	if byID == nil {
		byID = map[string]Row{}
		s[op.Entity] = byID
	}
	row := byID[op.EntityID]
	if row == nil {
		row = Row{}
		byID[op.EntityID] = row
	}
	if cur, ok := row[op.Field]; ok && !wins(op.TS, op.Device, cur) {
		return false
	}
	row[op.Field] = Field{V: append(json.RawMessage(nil), op.Value...), TS: op.TS, D: op.Device}
	return true
}

// Purge removes an entity the server purged.
func (s Store) Purge(entity, id string) {
	if byID := s[entity]; byID != nil {
		delete(byID, id)
	}
}

// Clone copies a store (rows and fields; values are never mutated in place).
func (s Store) Clone() Store {
	out := Store{}
	for e, byID := range s {
		m := make(map[string]Row, len(byID))
		for id, row := range byID {
			r := make(Row, len(row))
			for k, v := range row {
				r[k] = v
			}
			m[id] = r
		}
		out[e] = m
	}
	return out
}

// Get returns an entity's row (nil when unknown).
func (s Store) Get(entity, id string) Row { return s[entity][id] }

// IDs lists the ids of an entity, sorted.
func (s Store) IDs(entity string) []string {
	out := make([]string, 0, len(s[entity]))
	for id := range s[entity] {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// ---- typed reads ----

func (r Row) raw(f string) json.RawMessage {
	if r == nil {
		return nil
	}
	return r[f].V
}

func nullish(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s == "" || s == "null"
}

// Str reads a string field ("" when absent or null).
func (r Row) Str(f string) string {
	var s string
	if raw := r.raw(f); !nullish(raw) {
		_ = json.Unmarshal(raw, &s)
	}
	return s
}

// Num reads a number field (0 when absent or null).
func (r Row) Num(f string) float64 {
	var n float64
	if raw := r.raw(f); !nullish(raw) {
		_ = json.Unmarshal(raw, &n)
	}
	return n
}

// Set reports whether a field holds a non-null value.
func (r Row) Set(f string) bool { return !nullish(r.raw(f)) }

// Bool reads a boolean field.
func (r Row) Bool(f string) bool { return string(r.raw(f)) == "true" }

// Strs reads an array of strings.
func (r Row) Strs(f string) []string {
	var out []string
	if raw := r.raw(f); !nullish(raw) {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// Live reports a row that exists and is not deleted.
func (r Row) Live() bool { return r != nil && !r.Set("deleted_at") }

// Due is a task's due value.
type Due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// DueOf reads a task's due (nil when unset).
func (r Row) DueOf() *Due {
	raw := r.raw("due")
	if nullish(raw) {
		return nil
	}
	var d Due
	if json.Unmarshal(raw, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

func jsonOf(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
