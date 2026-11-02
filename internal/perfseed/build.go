package perfseed

import (
	"encoding/base64"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// viewQuery is the 8-clause saved view the benchmark evaluates.
const viewQuery = `open & (p1 | p2 | p3) & @ctx-00 & !#Archive & due <= 30 days & !subtask & !no date`

const day = 24 * time.Hour

// task is the plan of one task before it is written.
type task struct {
	id, project, section, parent string
	state                        int // 0 open, 1 completed, 2 trashed
	position                     int
}

func (g *gen) run() error {
	if err := g.labelsAndProjects(); err != nil {
		return err
	}
	tasks := g.planTasks()
	if err := g.writeTasks(tasks); err != nil {
		return err
	}
	if err := g.extras(tasks); err != nil {
		return err
	}
	return g.flush()
}

func (g *gen) labelsAndProjects() error {
	for i := range Labels {
		id := g.id("label", i)
		g.labels = append(g.labels, id)
		if err := g.put(g.owner, "label", id, map[string]any{"name": fmt.Sprintf("ctx-%02d", i), "color": "#64748b", "position": i + 1,
			"created_at": g.ago(400 * day)}); err != nil {
			return err
		}
	}
	g.isShared, g.sharedTask, g.sections = map[string]bool{}, map[string]bool{}, map[string][]string{}
	for i := 1; i <= SharedCount; i++ {
		g.isShared[g.id("project", i)] = true
	}
	for i := range Projects {
		id := g.id("project", i)
		g.projects = append(g.projects, id)
		name := fmt.Sprintf("%s %02d", g.words(2), i)
		switch {
		case i == 0:
			name = "Big backlog"
			g.big, g.bigName = id, name
		case i == Projects-1:
			name = "Archive"
		}
		f := map[string]any{"name": name, "color": "#38bdf8", "position": i + 1, "created_at": g.ago(400 * day), "parent_id": nil}
		// The last ten are sub-projects of the ten after the shared ones.
		if i >= Projects-11 && i < Projects-1 {
			f["parent_id"] = g.id("project", i-(Projects-11)+SharedCount+1)
		}
		if err := g.put(g.owner, "project", id, f); err != nil {
			return err
		}
	}
	if err := g.flush(); err != nil {
		return err
	}
	// Projects 1–3 are shared with the second member. Membership is
	// authorization data, never an op: only the server adds it.
	for i := 1; i <= SharedCount; i++ {
		p := g.projects[i]
		if _, err := g.sync.AddMember(g.ctx, g.owner, p, g.member, opsync.RoleEditor); err != nil {
			return fmt.Errorf("perfseed: share: %w", err)
		}
		g.shared = append(g.shared, p)
	}
	// 150 sections: ten in the big project, the rest over the others.
	for i := range Sections {
		p := g.big
		if i >= 10 {
			p = g.projects[1+g.rng.IntN(Projects-1)]
		}
		id := g.id("section", i)
		g.sections[p] = append(g.sections[p], id)
		if err := g.put(g.owner, "section", id, map[string]any{"name": g.words(2), "project_id": p, "position": len(g.sections[p]),
			"created_at": g.ago(300 * day)}); err != nil {
			return err
		}
	}
	return g.flush()
}

// planTasks decides every task's project, section, parent and state.
func (g *gen) planTasks() []task {
	n := Tasks * g.o.Scale
	open, done := OpenTasks*g.o.Scale, DoneTasks*g.o.Scale
	out := make([]task, n)
	positions := map[string]int{}
	// anchor is the first open top-level task of each project: the parent of
	// that project's subtasks.
	anchor := map[string]int{}
	for i := range out {
		t := &out[i]
		t.id = g.id("task", i)
		switch {
		case i < open:
		case i < open+done:
			t.state = 1
		default:
			t.state = 2
		}
		switch {
		case i < BigOpen:
			t.project = g.big
		case g.rng.IntN(10) == 0:
			t.project = "" // Inbox
		default:
			t.project = g.projects[1+g.rng.IntN(Projects-1)]
		}
		if secs := g.sections[t.project]; len(secs) > 0 && g.rng.IntN(10) < 7 {
			t.section = secs[g.rng.IntN(len(secs))]
		}
		positions[t.project]++
		t.position = positions[t.project]
		if _, ok := anchor[t.project]; !ok && t.state == 0 && t.project != "" {
			anchor[t.project] = i
		}
		if g.isShared[t.project] {
			g.sharedTask[t.id] = true
		}
	}
	subs := 0
	for _, i := range g.rng.Perm(n) {
		if subs == Subtasks*g.o.Scale {
			break
		}
		t := &out[i]
		a, ok := anchor[t.project]
		if !ok || a == i {
			continue
		}
		t.parent = out[a].id
		t.section = out[a].section
		subs++
	}
	return out
}

func (g *gen) writeTasks(tasks []task) error {
	n := len(tasks)
	open := OpenTasks * g.o.Scale
	notes := setOf(g.pick(n, WithNotes*g.o.Scale))
	// Dates go to open and completed tasks; recurrence and reminders to open
	// dated ones; the search term to open ones.
	dated := setOf(g.pick(n-TrashedTasks*g.o.Scale, Dated*g.o.Scale))
	var openDated []int
	for i := range open {
		if dated[i] {
			openDated = append(openDated, i)
		}
	}
	recurring := map[int]bool{}
	for _, k := range g.pick(len(openDated), Recurring*g.o.Scale) {
		recurring[openDated[k]] = true
	}
	hits := setOf(g.pick(open, SearchHits))
	parents := map[string]bool{}
	for _, t := range tasks {
		if t.parent != "" {
			parents[t.parent] = true
		}
	}
	rules := []string{"every day", "every week", "every month", "every weekday", "every 2 weeks"}
	for i, t := range tasks {
		title := g.words(2 + g.rng.IntN(5))
		if hits[i] {
			title += " " + SearchTerm
			g.hits++
		}
		f := map[string]any{"title": title, "project_id": nilIf(t.project), "parent_id": nilIf(t.parent), "section_id": nilIf(t.section),
			"position": t.position, "priority": 1 + g.rng.IntN(4), "created_at": g.ago(time.Duration(30+g.rng.IntN(370)) * day)}
		if g.rng.IntN(3) == 0 {
			f["labels"] = []string{g.labels[g.rng.IntN(Labels)]}
		}
		if notes[i] {
			f["description"] = g.text(100 + g.rng.IntN(601))
		}
		if dated[i] {
			off := -20 + g.rng.IntN(81)
			if t.state == 1 {
				off = -g.rng.IntN(365)
			}
			due := map[string]string{"date": g.day(off)}
			if g.rng.IntN(4) == 0 {
				due["time"] = fmt.Sprintf("%02d:%02d", 8+g.rng.IntN(10), 15*g.rng.IntN(4))
			}
			f["due"] = due
			if t.state == 0 && off <= 0 {
				g.todayTasks++
			}
		}
		if recurring[i] {
			c, err := recurrence.Canonicalize(rules[g.rng.IntN(len(rules))])
			if err != nil {
				return err
			}
			f["recurrence"] = c
		}
		switch t.state {
		case 1:
			f["completed_at"] = g.ago(time.Duration(1+g.rng.IntN(365*24)) * time.Hour)
		case 2:
			// Inside the Trash's 30-day retention, so the purge leaves them.
			f["deleted_at"] = g.ago(time.Duration(1+g.rng.IntN(20*24)) * time.Hour)
		}
		g.tally(t, f)
		if g.sample == "" && t.project == g.big && t.state == 0 && t.parent == "" {
			g.sample = t.id
		}
		// Tasks a benchmark can complete with one click: no series, no subtasks.
		if t.project == g.big && t.state == 0 && t.parent == "" && !recurring[i] && !parents[t.id] && len(g.plain) < 200 {
			g.plain = append(g.plain, t.id)
		}
		if err := g.put(g.owner, "task", t.id, f); err != nil {
			return err
		}
	}
	return g.flush()
}

// extras writes reminders, comments, time entries and saved views.
func (g *gen) extras(tasks []task) error {
	var open, live []int
	for i, t := range tasks {
		if t.state != 2 {
			live = append(live, i)
		}
		if t.state == 0 {
			open = append(open, i)
		}
	}
	// Absolute reminders in the coming weeks, on open tasks.
	for n, k := range g.pick(len(open), Reminders*g.o.Scale) {
		t := tasks[open[k]]
		at := g.today.AddDate(0, 0, 1+g.rng.IntN(30)).Add(9 * time.Hour).UnixMilli()
		if err := g.put(g.owner, "reminder", g.id("reminder", n), map[string]any{"task_id": t.id, "kind": "absolute", "fire_at": at,
			"created_at": g.ago(10 * day)}); err != nil {
			return err
		}
	}
	for n := range Comments * g.o.Scale {
		t := tasks[live[g.rng.IntN(len(live))]]
		if err := g.put(g.owner, "comment", g.id("comment", n), map[string]any{"task_id": t.id, "parent_id": nil, "author_id": g.owner,
			"mentions": []string{}, "body": g.text(40 + g.rng.IntN(200)), "created_at": g.ago(time.Duration(1+g.rng.IntN(200)) * day)}); err != nil {
			return err
		}
	}
	for n := range TimeEntries * g.o.Scale {
		t := tasks[live[g.rng.IntN(len(live))]]
		start := g.ago(time.Duration(1+g.rng.IntN(200*24)) * time.Hour)
		if err := g.put(g.owner, "time_entry", g.id("time", n), map[string]any{"task_id": t.id, "user_id": g.owner, "started_at": start,
			"ended_at": start + int64(5+g.rng.IntN(120))*60_000, "device_id": Device, "note": g.words(3), "created_at": start}); err != nil {
			return err
		}
	}
	queries := []string{viewQuery, "@ctx-01 & open", "p1 & open", "due <= 7 days & open", "#Archive", "search: plan", "completed & completed >= 30 days ago", "no date & open"}
	for i, q := range queries[:Views] {
		id := g.id("view", i)
		if i == 0 {
			g.view = id
		}
		if err := g.put(g.owner, "view", id, map[string]any{"name": fmt.Sprintf("View %d", i+1), "query": q, "kind": "list", "group_by": "project",
			"sort_by": "due", "sort_dir": "asc", "pinned": i < 3, "position": i + 1, "created_at": g.ago(50 * day)}); err != nil {
			return err
		}
	}
	return nil
}

// encryption turns end-to-end encryption on: a fixed account key from the
// seed, wrapped under Passphrase and a recovery key, stored as the account's
// key record. Content is sealed with it as it is written.
func (g *gen) encryption(store *e2ee.Store) error {
	key := g.bytes(crypt.KeyBytes)
	salt := g.bytes(e2ee.SaltBytes)
	kek, err := crypt.PassphraseKEK(Passphrase, salt, e2ee.MinIterations)
	if err != nil {
		return err
	}
	byPass, err := crypt.Wrap(kek, key)
	if err != nil {
		return err
	}
	rkek, err := crypt.RecoveryKEK(g.bytes(32))
	if err != nil {
		return err
	}
	byRecovery, err := crypt.Wrap(rkek, key)
	if err != nil {
		return err
	}
	rec := e2ee.KeyRecord{Version: 1, KDF: e2ee.KDFPBKDF2SHA256, Salt: b64(salt), Iterations: e2ee.MinIterations,
		WrappedByPassphrase: b64(byPass), WrappedByRecovery: b64(byRecovery)}
	if _, _, err := store.Put(g.ctx, g.owner, rec, g.o.Now.UnixMilli()); err != nil {
		return fmt.Errorf("perfseed: key record: %w", err)
	}
	g.key = key
	return nil
}

func (g *gen) seal(entity, id, field, plaintext string) (string, error) {
	return crypt.SealWithNonce(g.key, g.bytes(12), entity, id, field, plaintext)
}

func (g *gen) bytes(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(g.rng.Uint32())
	}
	return b
}

// tally counts the composition the summary reports.
func (g *gen) tally(t task, f map[string]any) {
	g.counts[[]string{"task:open", "task:completed", "task:trashed"}[t.state]]++
	for k, name := range map[string]string{"parent_id": "task:subtask", "description": "task:notes", "due": "task:dated", "recurrence": "task:recurring"} {
		if v, ok := f[k]; ok && v != nil {
			g.counts[name]++
		}
	}
	if g.sharedTask[t.id] {
		g.counts["task:shared"]++
	}
	if t.project == g.big && t.state == 0 {
		g.counts["task:big-open"]++
	}
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func setOf(xs []int) map[int]bool {
	m := make(map[int]bool, len(xs))
	for _, x := range xs {
		m[x] = true
	}
	return m
}

func nilIf(s string) any {
	if s == "" {
		return nil
	}
	return s
}
