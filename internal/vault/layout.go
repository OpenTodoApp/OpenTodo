package vault

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/recurrence"
	"github.com/pixari/opentodo/internal/timetrack"
)

// InboxFile holds the tasks without a project.
const InboxFile = "Inbox.md"

// Crypter opens and seals content values of an encrypted account on the
// user's machine (design D10). nil for an account without encryption.
type Crypter interface {
	Open(entity, id, field, value string) (string, error)
	Seal(entity, id, field, plaintext string) (string, error)
}

// view reads a store for printing: decrypted text, the project tree and
// placements. It never writes.
type view struct {
	s   Store
	c   Crypter
	loc *time.Location
	// undecryptable records entity:id:field values that did not open.
	undecryptable map[string]bool
	shared        map[string]bool
}

func newView(s Store, c Crypter, loc *time.Location, shared map[string]bool) *view {
	return &view{s: s, c: c, loc: loc, undecryptable: map[string]bool{}, shared: shared}
}

// text reads a content string, decrypting a ciphertext value.
func (v *view) text(entity, id, field string) string {
	raw := v.s.Get(entity, id).Str(field)
	if !e2ee.IsCiphertext(raw) {
		return raw
	}
	if v.c != nil {
		if pt, err := v.c.Open(entity, id, field, raw); err == nil {
			return pt
		}
	}
	v.undecryptable[entity+":"+id+":"+field] = true
	return e2ee.Placeholder
}

// projectLive reports a project that has a file: live and not archived.
func (v *view) projectLive(id string) bool {
	r := v.s.Get("project", id)
	return r.Live() && !r.Bool("archived")
}

// parentOf is a project's parent in the tree: a live, unarchived parent, else
// none (an orphan shows at the top level), with cycles broken.
func (v *view) parentOf(id string) string {
	seen := map[string]bool{id: true}
	p := v.s.Get("project", id).Str("parent_id")
	if p == "" || !v.projectLive(p) {
		return ""
	}
	for cur := p; cur != ""; cur = v.s.Get("project", cur).Str("parent_id") {
		if seen[cur] {
			return ""
		}
		seen[cur] = true
		if !v.projectLive(cur) {
			break
		}
	}
	return p
}

// sortByPosition orders ids by (position, id), the manual order rule.
func sortByPosition(s Store, entity string, ids []string) {
	sort.SliceStable(ids, func(i, j int) bool {
		a, b := s.Get(entity, ids[i]).Num("position"), s.Get(entity, ids[j]).Num("position")
		if a != b {
			return a < b
		}
		return ids[i] < ids[j]
	})
}

// SafeName turns a project name into a file name (design D3): `/ \ : * ? " < >
// |` and control characters become `-`, trailing dots and spaces are trimmed.
func SafeName(name string) string {
	var b strings.Builder
	for _, r := range name {
		if strings.ContainsRune(`/\:*?"<>|`, r) || unicode.IsControl(r) {
			b.WriteRune('-')
			continue
		}
		b.WriteRune(r)
	}
	s := strings.TrimRight(b.String(), ". ")
	s = strings.TrimLeft(s, " ")
	if s == "" {
		s = "Untitled"
	}
	return s
}

// Layout places every live project in a file (design D3): `<name>.md`, and a
// project with live sub-projects as the folder note `<name>/<name>.md` with
// its children inside. Names clash case-insensitively inside one folder and get
// a numeric suffix in (position, id) order. The Inbox is `Inbox.md`.
func (v *view) Layout() map[string]string {
	out := map[string]string{"": InboxFile}
	children := map[string][]string{}
	for _, id := range v.s.IDs("project") {
		if !v.projectLive(id) {
			continue
		}
		p := v.parentOf(id)
		children[p] = append(children[p], id)
	}
	var place func(parent, dir string, taken map[string]bool)
	place = func(parent, dir string, taken map[string]bool) {
		ids := children[parent]
		sortByPosition(v.s, "project", ids)
		for _, id := range ids {
			base := SafeName(v.text("project", id, "name"))
			name := base
			for n := 2; taken[strings.ToLower(name)]; n++ {
				name = base + " " + strconv.Itoa(n)
			}
			taken[strings.ToLower(name)] = true
			if len(children[id]) > 0 {
				sub := path.Join(dir, name)
				out[id] = path.Join(sub, name+".md")
				place(id, sub, map[string]bool{strings.ToLower(name): true})
			} else {
				out[id] = path.Join(dir, name+".md")
			}
		}
	}
	place("", "", map[string]bool{"inbox": true})
	return out
}

// slug is a label's tag: its name with spaces as `-`, lower case.
func slug(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), "-"))
}

// labelSlugs maps tag slugs to live label ids (the first by position wins).
func (v *view) labelSlugs() map[string]string {
	ids := []string{}
	for _, id := range v.s.IDs("label") {
		if v.s.Get("label", id).Live() {
			ids = append(ids, id)
		}
	}
	sortByPosition(v.s, "label", ids)
	out := map[string]string{}
	for _, id := range ids {
		sl := slug(v.text("label", id, "name"))
		if _, ok := out[sl]; !ok && sl != "" {
			out[sl] = id
		}
	}
	return out
}

// localDate is the machine's calendar date of a Unix ms instant.
func (v *view) localDate(ms float64) string {
	return time.UnixMilli(int64(ms)).In(v.loc).Format("2006-01-02")
}

// formatMinutes writes a duration as the vault does: 45m, 1h30m, 2h.
func formatMinutes(m int) string {
	switch {
	case m < 60:
		return fmt.Sprintf("%dm", m)
	case m%60 == 0:
		return fmt.Sprintf("%dh", m/60)
	}
	return fmt.Sprintf("%dh%dm", m/60, m%60)
}

// parseMinutes reads a duration of 1 minute to 7 days.
func parseMinutes(s string) (int, bool) {
	m, ok := timetrack.ParseDuration(strings.ReplaceAll(s, " ", ""))
	if !ok || m < 1 || m > 7*24*60 {
		return 0, false
	}
	return m, true
}

// ruleToFile writes a canonical rule with the Obsidian Tasks phrase for
// "after completion".
func ruleToFile(rule string) string {
	return strings.Replace(rule, " after completion", " when done", 1)
}

// ruleFromFile reads either phrase back and canonicalises the rule.
func ruleFromFile(text string) (string, error) {
	t := strings.TrimSpace(text)
	if strings.HasSuffix(t, " when done") {
		t = strings.TrimSuffix(t, " when done") + " after completion"
	}
	return recurrence.Canonicalize(t)
}

// line projects a task row onto its file line (design D4), without nesting.
func (v *view) line(id string, labels map[string]string, extra string) Line {
	r := v.s.Get("task", id)
	l := Line{ID: id, Title: v.text("task", id, "title"), Trailing: extra, ReadOnly: map[string]string{}, Has: map[string]bool{}}
	if r.Set("completed_at") {
		l.Done = true
		l.DoneDate = v.localDate(r.Num("completed_at"))
	}
	if d := r.DueOf(); d != nil {
		l.Due = d.Date
		if d.Time != nil {
			l.Time = *d.Time
			if d.TZ != nil {
				l.TZ = *d.TZ
			}
		}
	}
	l.Start = r.Str("start")
	l.Deadline = r.Str("deadline")
	if m := int(r.Num("estimate_minutes")); m > 0 {
		l.Estimate = formatMinutes(m)
	}
	l.Evening = r.Bool("evening")
	if p := int(r.Num("priority")); p >= 1 && p <= 3 {
		l.Priority = p
	}
	if rule := r.Str("recurrence"); rule != "" {
		l.Recur = ruleToFile(rule)
	}
	byID := map[string]string{}
	for sl, lid := range labels {
		byID[lid] = sl
	}
	for _, lid := range r.Strs("labels") {
		if sl, ok := byID[lid]; ok {
			l.Tags = append(l.Tags, sl)
		}
	}
	l.Blocked = append(l.Blocked, r.Strs("blocked_by")...)
	for k, val := range v.readOnly(id) {
		l.ReadOnly[k] = val
	}
	return l
}

// readOnly are the values the file shows but never pushes (spec "What the file
// does not round-trip"): origin, location, tracked minutes, custom fields.
func (v *view) readOnly(id string) map[string]string {
	out := map[string]string{}
	r := v.s.Get("task", id)
	if r.Set("origin") {
		raw := r.raw("origin")
		var o struct {
			ID  string `json:"id"`
			URL string `json:"url"`
		}
		var s string
		switch {
		case json.Unmarshal(raw, &o) == nil && (o.URL != "" || o.ID != ""):
			out["origin"] = firstNonEmpty(o.URL, o.ID)
		case json.Unmarshal(raw, &s) == nil && s != "":
			out["origin"] = v.text("task", id, "origin")
		}
	}
	if r.Set("location") {
		raw := r.raw("location")
		var loc struct {
			Name    string `json:"name"`
			Address string `json:"address"`
		}
		var s string
		switch {
		case json.Unmarshal(raw, &loc) == nil && (loc.Name != "" || loc.Address != ""):
			out["location"] = firstNonEmpty(loc.Name, loc.Address)
		case json.Unmarshal(raw, &s) == nil && s != "":
			out["location"] = v.text("task", id, "location")
		}
	}
	tracked := 0
	for _, eid := range v.s.IDs("time_entry") {
		e := v.s.Get("time_entry", eid)
		if e.Str("task_id") != id || !e.Live() || !e.Set("ended_at") {
			continue
		}
		tracked += int((e.Num("ended_at") - e.Num("started_at")) / 60000)
	}
	if tracked > 0 {
		out["tracked"] = formatMinutes(tracked)
	}
	if pid := r.Str("project_id"); pid != "" {
		for _, fid := range v.s.IDs("field") {
			f := v.s.Get("field", fid)
			if !f.Live() || f.Str("project_id") != pid {
				continue
			}
			key := "fields." + fid
			if !r.Set(key) {
				continue
			}
			var val any
			_ = json.Unmarshal(r.raw(key), &val)
			s := fmt.Sprint(val)
			if _, ok := val.(string); ok {
				s = v.text("task", id, key)
			}
			name := strings.NewReplacer("]", "", ":", "").Replace(v.text("field", fid, "name"))
			out["field:"+name] = strings.ReplaceAll(s, "]", "")
		}
	}
	return out
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// defaultColor is the colour `ot project add` derives from a name.
func defaultColor(name string) string {
	palette := []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"}
	h := fnv.New32a()
	_, _ = h.Write([]byte(name))
	return palette[int(h.Sum32()%uint32(len(palette)))]
}
