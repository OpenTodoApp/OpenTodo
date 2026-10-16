package demo

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/recurrence"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The demo data, a port of scripts/screenshots.mjs. It is declared as tables of
// constants (static data, not code, to keep the binary small) and turned into
// ops at seed time. Keys name entities for references; due is "<days from
// today>[ HH:MM]" or "" for none.

type labelSpec struct{ key, name, color string }

type projectSpec struct {
	key, name, color, parent string
	position                 int
}

type sectionSpec struct {
	project string
	names   []string
}

type taskSpec struct {
	key, title, desc         string
	project, section, parent string
	labels                   []string
	priority, estimate       int
	due, recur               string
	doneAgo, deletedAgo      time.Duration
	position                 int
}

const h = time.Hour

var labels = []labelSpec{
	{"errand", "errand", "#f59e0b"},
	{"waiting", "waiting", "#64748b"},
	{"deep", "deep-work", "#8b5cf6"},
	{"call", "call", "#0ea5e9"},
}

var projects = []projectSpec{
	{"home", "Home renovation", "#f59e0b", "", 1},
	{"work", "Work", "#38bdf8", "", 2},
	{"launch", "Q4 launch", "#0ea5e9", "work", 1},
	{"side", "Side project", "#a78bfa", "", 3},
	{"garage", "Garage sale", "#ef4444", "", 4},
}

var sections = []sectionSpec{
	{"home", []string{"Planning", "In progress", "Waiting"}},
	{"launch", []string{"Backlog", "This week", "Review"}},
}

var tasks = []taskSpec{
	// Inbox and personal
	{title: "Renew passport", priority: 1, due: "-2", labels: []string{"errand"}},
	{title: "Email the landlord about the heating", labels: []string{"waiting"}},
	{title: "Set up backups for the NAS", priority: 3},
	{title: "Pick up groceries", due: "0 18:00", estimate: 30, labels: []string{"errand"}},
	{title: "Water the plants", due: "0", recur: "every 3 days"},
	{title: "Pay rent", priority: 2, due: "3", recur: "every 1st"},
	{title: "Book dentist appointment", priority: 3, due: "4", labels: []string{"call"}},
	{title: "Buy a birthday present for Sam", doneAgo: h},
	{title: "Run club", due: "-1 18:00", estimate: 60, recur: "every monday"},
	{key: "oldList", title: "Old shopping list", deletedAgo: 30 * time.Minute},

	// Home renovation (shared with the sandbox's demo collaborator)
	{key: "quotes", title: "Get three quotes for the kitchen", priority: 1, due: "0 10:00", estimate: 60, project: "home", section: "In progress", labels: []string{"call"},
		desc: "Ask about **lead times** and the payment schedule. Budget is around 12k."},
	{title: "Call Northside Kitchens", project: "home", section: "In progress", parent: "quotes", position: 1, doneAgo: 24 * h},
	{title: "Email Brightwood for a site visit", project: "home", section: "In progress", parent: "quotes", position: 2},
	{title: "Compare payment schedules", project: "home", section: "In progress", parent: "quotes", position: 3},
	{key: "paint", title: "Pick paint colours", priority: 3, due: "1", project: "home", section: "Planning"},
	{key: "hallway", title: "Measure the hallway", due: "1 08:30", estimate: 15, project: "home", section: "Planning"},
	{key: "taps", title: "Order new taps", priority: 2, project: "home", section: "Planning", labels: []string{"errand"}},
	{title: "Call the plumber about the leak", priority: 2, due: "-1 09:30", project: "home", section: "Waiting", labels: []string{"call", "waiting"}},
	{title: "Electrician sign-off", due: "5", project: "home", section: "Waiting", labels: []string{"waiting"}},
	{title: "Remove old wallpaper", project: "home", section: "In progress", doneAgo: 48 * h},
	{title: "Kitchen site visit (Brightwood)", due: "2 10:00", estimate: 60, project: "home", section: "Planning"},
	{title: "Call Northside (duplicate)", project: "home", deletedAgo: 30 * time.Minute},

	// Work
	{title: "Review pull request #42", priority: 2, due: "0 11:00", estimate: 45, project: "work", labels: []string{"deep"}, desc: "Focus on the sync edge cases."},
	{title: "Write release notes for v1.0", priority: 3, due: "0 14:00", estimate: 90, project: "work", labels: []string{"deep"}},
	{title: "1:1 with Chen", due: "0 16:00", estimate: 30, project: "work", recur: "every week"},
	{title: "Submit expense report", project: "work", doneAgo: 2 * h},
	{title: "Plan the team offsite", priority: 2, due: "2 09:00", estimate: 120, project: "work"},
	{title: "Draft the conference talk", priority: 1, due: "1 13:00", estimate: 120, project: "work", labels: []string{"deep"}},
	{title: "Prepare demo for the board", priority: 2, due: "-1 14:00", estimate: 90, project: "work", doneAgo: 3 * h},

	// Q4 launch board (a sub-project of Work)
	{title: "Pricing page copy", project: "launch", section: "Backlog", priority: 3},
	{title: "Customer interviews summary", project: "launch", section: "Backlog"},
	{title: "Migration guide", project: "launch", section: "Backlog", labels: []string{"deep"}},
	{title: "Landing page hero", project: "launch", section: "This week", priority: 1, due: "1"},
	{key: "launchMail", title: "Launch emails", project: "launch", section: "This week", priority: 3},
	{title: "Press kit", project: "launch", section: "This week", due: "3"},
	{title: "Status page", project: "launch", section: "Review", priority: 2, due: "0"},
	{title: "Analytics dashboard", project: "launch", section: "Review"},

	// Side project
	{title: "Sketch the landing page", priority: 2, due: "2", project: "side"},
	{title: "Plan the weekend hike", due: "6", project: "side"},
	{key: "syncDoc", title: "Read the sync protocol doc", project: "side", labels: []string{"deep"}},
	{key: "readme", title: "Write the README", project: "side"},

	// Garage sale (the project itself goes to the Trash)
	{title: "Price the old bike", project: "garage"},
	{title: "Post flyers", project: "garage"},
}

type viewSpec struct {
	key, name, query, kind, groupBy, sortBy, sortDir, color string
	pinned                                                  bool
	panels                                                  []string
}

var views = []viewSpec{
	{key: "deep", name: "Deep work", query: "@deep-work & open", pinned: true, color: "#8b5cf6", sortBy: "priority", sortDir: "desc"},
	{key: "waiting", name: "Waiting on others", query: "@waiting & open", pinned: true},
	{key: "week", name: "Due this week", query: "due <= 7 days & open", groupBy: "due"},
	{name: "Weekly review", kind: "dashboard", pinned: true, color: "#10b981", panels: []string{"week", "deep", "waiting"}},
}

// seeder writes the demo data through the op log (ApplyStrict), one entity per
// batch, with strictly increasing op timestamps just before now, all from the
// server device. Dates are relative to today (UTC).
type seeder struct {
	ctx   context.Context
	sync  *opsync.Service
	now   time.Time
	today time.Time // midnight UTC
	ts    int64
	ref   map[string]string // spec key -> entity id
}

// seed writes a sandbox's copy of the demo data: me is the visitor's account,
// collab its non-interactive collaborator. Entity ids are fresh per sandbox.
func (s *Service) seed(ctx context.Context, me, collab string) error {
	now := s.now()
	u := now.UTC()
	b := &seeder{ctx: ctx, sync: s.sync, now: now, today: time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC),
		ts: now.Add(-10 * time.Minute).UnixMilli(), ref: map[string]string{}}
	return b.run(me, collab)
}

// due turns "<days>[ HH:MM]" into a floating due value (nil for "").
func (b *seeder) due(spec string) any {
	if spec == "" {
		return nil
	}
	days, at, _ := strings.Cut(spec, " ")
	n, _ := strconv.Atoi(days)
	out := map[string]string{"date": b.today.AddDate(0, 0, n).Format("2006-01-02")}
	if at != "" {
		out["time"] = at
	}
	return out
}

// instant is n days from today at hh:mm UTC, in Unix ms.
func (b *seeder) instant(n, hh, mm int) int64 {
	return b.today.AddDate(0, 0, n).Add(time.Duration(hh)*time.Hour + time.Duration(mm)*time.Minute).UnixMilli()
}

// ago is now minus d, in Unix ms.
func (b *seeder) ago(d time.Duration) int64 { return b.now.Add(-d).UnixMilli() }

// write applies fields of one entity as user, in one batch.
func (b *seeder) write(user, entity, id string, fields map[string]any) error {
	b.ts++
	ops := make([]opsync.Op, 0, len(fields))
	for f, v := range fields {
		raw, err := json.Marshal(v)
		if err != nil {
			return err
		}
		ops = append(ops, opsync.Op{ID: ids.New(), Entity: entity, EntityID: id, Field: f, Value: raw, TS: b.ts, Device: opsync.ServerDevice})
	}
	if _, err := b.sync.ApplyStrict(b.ctx, user, ops); err != nil {
		return fmt.Errorf("%s %s: %w", entity, id, err)
	}
	return nil
}

// create writes a new entity with created_at (two days ago unless given),
// remembers it under key and returns its id.
func (b *seeder) create(user, entity, key string, fields map[string]any) (string, error) {
	id := ids.New()
	if _, ok := fields["created_at"]; !ok {
		fields["created_at"] = b.ago(48 * h)
	}
	if key != "" {
		b.ref[key] = id
	}
	return id, b.write(user, entity, id, fields)
}

// refs maps spec keys to ids.
func (b *seeder) refs(keys []string) []string {
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, b.ref[k])
	}
	return out
}

// orNil returns the id of key, or nil for "".
func (b *seeder) orNil(key string) any {
	if key == "" {
		return nil
	}
	return b.ref[key]
}

func (b *seeder) run(me, sam string) error {
	for i, l := range labels {
		if _, err := b.create(me, "label", "label:"+l.key, map[string]any{"name": l.name, "color": l.color, "position": i + 1}); err != nil {
			return err
		}
	}
	for _, p := range projects {
		if _, err := b.create(me, "project", p.key, map[string]any{"name": p.name, "color": p.color, "position": p.position, "parent_id": b.orNil(p.parent)}); err != nil {
			return err
		}
	}
	// Home renovation is shared with the sandbox's own collaborator; membership
	// is authorization data, not an op, and only the server ever adds it.
	if _, err := b.sync.AddMember(b.ctx, me, b.ref["home"], sam, opsync.RoleEditor); err != nil {
		return fmt.Errorf("share: %w", err)
	}
	for _, sec := range sections {
		for i, name := range sec.names {
			if _, err := b.create(me, "section", sec.project+"/"+name, map[string]any{"name": name, "project_id": b.ref[sec.project], "position": i + 1}); err != nil {
				return err
			}
		}
	}
	for i, t := range tasks {
		labelKeys := make([]string, 0, len(t.labels))
		for _, l := range t.labels {
			labelKeys = append(labelKeys, "label:"+l)
		}
		f := map[string]any{"title": t.title, "description": t.desc, "priority": t.priority, "labels": b.refs(labelKeys),
			"project_id": b.orNil(t.project), "parent_id": b.orNil(t.parent), "due": b.due(t.due), "position": i + 1}
		if t.priority == 0 {
			f["priority"] = 4
		}
		if t.position > 0 {
			f["position"] = t.position
		}
		if t.section != "" {
			f["section_id"] = b.ref[t.project+"/"+t.section]
		}
		if t.estimate > 0 {
			f["estimate_minutes"] = t.estimate
		}
		if t.recur != "" {
			c, err := recurrence.Canonicalize(t.recur)
			if err != nil {
				return err
			}
			f["recurrence"] = c
		}
		if t.doneAgo > 0 {
			f["completed_at"] = b.ago(t.doneAgo)
		}
		if t.deletedAgo > 0 {
			f["deleted_at"] = b.ago(t.deletedAgo)
		}
		if _, err := b.create(me, "task", t.key, f); err != nil {
			return err
		}
	}
	// Custom fields on the Side project (custom-fields), with values on its
	// undated tasks so the everyday screens keep their look.
	for i, f := range []struct{ key, name, typ, options string }{
		{"effort", "Effort", "number", ""}, {"stage", "Stage", "choice", "Idea\nDraft\nReview\nDone"}, {"link", "Link", "link", ""},
	} {
		if _, err := b.create(me, "field", "field:"+f.key, map[string]any{"name": f.name, "project_id": b.ref["side"], "type": f.typ, "options": f.options, "position": i + 1}); err != nil {
			return err
		}
	}
	for _, v := range []struct {
		task   string
		values map[string]any
	}{
		{"syncDoc", map[string]any{"effort": 2, "stage": "Draft", "link": "https://example.com/docs/sync"}},
		{"readme", map[string]any{"effort": 3, "stage": "Idea"}},
	} {
		f := map[string]any{}
		for k, val := range v.values {
			f[opsync.FieldValuePrefix+b.ref["field:"+k]] = val
		}
		if err := b.write(me, "task", b.ref[v.task], f); err != nil {
			return err
		}
	}
	r := b.ref
	steps := []struct {
		user, entity, id string
		fields           map[string]any
	}{
		// History: a few edits on one task, by both accounts, and an assignment each way.
		{me, "task", r["paint"], map[string]any{"title": "Pick paint colours for the hallway"}},
		{me, "task", r["paint"], map[string]any{"priority": 2, "description": "Warm white or sage? Samples are in the drawer."}},
		{sam, "task", r["paint"], map[string]any{"assignee_id": me, "title": "Pick paint colours"}},
		{me, "task", r["taps"], map[string]any{"assignee_id": sam}},
		{sam, "task", r["taps"], map[string]any{"description": "Brushed steel, single lever."}},
		{me, "task", r["launchMail"], map[string]any{"title": "Launch email sequence", "due": b.due("1")}},
		{me, "task", r["launchMail"], map[string]any{"description": "Three emails: announcement, migration tips, one-week check-in.", "estimate_minutes": 90}},
		{sam, "task", r["hallway"], map[string]any{"completed_at": b.ago(10 * time.Minute)}},
		{sam, "task", r["hallway"], map[string]any{"completed_at": nil}},
		// The Garage sale project goes to the Trash.
		{me, "project", r["garage"], map[string]any{"deleted_at": b.ago(30 * time.Minute)}},
	}
	for _, s := range steps {
		if err := b.write(s.user, s.entity, s.id, s.fields); err != nil {
			return err
		}
	}
	// Comments: a mention, a reply and an update from the second account.
	c1, err := b.create(sam, "comment", "", map[string]any{"task_id": r["quotes"], "parent_id": nil, "author_id": sam, "mentions": []string{me},
		"body": "Brightwood can come **Thursday at 10**. @" + Name + " does that work for you?", "created_at": b.ago(5 * h)})
	if err != nil {
		return err
	}
	for _, c := range []struct {
		user, parent, body string
		ago                time.Duration
	}{
		{me, c1, "Thursday works. I will ask them about the worktop too.", 4 * h},
		{sam, "", "Northside quoted 11.4k, lead time 6 weeks. PDF is in the shared folder.", 2 * h},
	} {
		if _, err := b.create(c.user, "comment", "", map[string]any{"task_id": r["quotes"], "parent_id": b.orNilID(c.parent), "author_id": c.user,
			"mentions": []string{}, "body": c.body, "created_at": b.ago(c.ago)}); err != nil {
			return err
		}
	}
	// Reminders: 30 minutes before the 10:00 due time, and tomorrow morning.
	if _, err := b.create(me, "reminder", "", map[string]any{"task_id": r["quotes"], "kind": "relative", "offset_minutes": -30, "fire_at": b.instant(0, 9, 30)}); err != nil {
		return err
	}
	if _, err := b.create(me, "reminder", "", map[string]any{"task_id": r["quotes"], "kind": "absolute", "fire_at": b.instant(1, 8, 0)}); err != nil {
		return err
	}
	// Saved views and a dashboard of three of them.
	for i, v := range views {
		f := map[string]any{"name": v.name, "query": v.query, "kind": or(v.kind, "list"), "group_by": or(v.groupBy, "project"),
			"sort_by": or(v.sortBy, "due"), "sort_dir": or(v.sortDir, "asc"), "pinned": v.pinned, "color": or(v.color, "#64748b"),
			"panels": b.refs(v.panels), "position": i + 1}
		if _, err := b.create(me, "view", v.key, f); err != nil {
			return err
		}
	}
	return nil
}

// orNilID is orNil for an id that is already resolved.
func (b *seeder) orNilID(id string) any {
	if id == "" {
		return nil
	}
	return id
}

func or(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
