package davroutes

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Partial views (OpenSpec change caldav-verified, "Large-account budgets"): a
// request for a few resources (a GET, a PUT, a multiget, a sync-collection
// after a token) reads only those tasks and what serving them needs, through
// the primary key, instead of the account's whole task list. What it reads is
// put in the same lookups load fills, so every rule of the view (calendars,
// scope, ETags, parents, blockers, series) gives the same answer as on the
// whole view. A request that needs the whole account after all (a split
// series, a move, a recurring task's write) widens the view with load.

// maxNarrow is how many tasks a request reads one by one at most; beyond it
// the whole view is cheaper than the lookups.
const maxNarrow = 1000

// fetchProjects reads the live projects among ids into a partial view, with
// their parents up to the top (which give a calendar's workspace and scope).
// A view that read every project has them.
func (d *davRequest) fetchProjects(v *davView, ids []string) error {
	for i := 0; i < 64 && !v.projectsRead; i++ {
		var want []string
		for _, id := range ids {
			if id != "" && !v.projectsFetched[id] {
				v.projectsFetched[id] = true
				want = append(want, id)
			}
		}
		if len(want) == 0 {
			return nil
		}
		if len(v.projectsFetched) > maxNarrow {
			_, err := d.calendars()
			return err
		}
		projects, err := d.s.sync.ListIDs(d.ctx(), v.uid, "project", false, want)
		if err != nil {
			return err
		}
		ids = nil
		for _, p := range projects {
			v.addProject(p)
			ids = append(ids, idOf(p["parent_id"]))
		}
	}
	return nil
}

// calendarView is the view a request on one calendar starts from: no task,
// and that calendar's project.
func (d *davRequest) calendarView(cal string) (*davView, error) {
	v, err := d.base()
	if err != nil {
		return nil, err
	}
	if !isInboxID(cal) {
		err = d.fetchProjects(v, []string{cal})
	}
	return v, err
}

// fetchRows reads the live tasks among ids not read yet, with their resource
// names, modification times and reminders, and returns them.
func (d *davRequest) fetchRows(v *davView, ids []string) ([]opsync.Entity, error) {
	var want []string
	for _, id := range ids {
		if id != "" && !v.fetched[id] {
			v.fetched[id] = true
			want = append(want, id)
		}
	}
	var got []opsync.Entity
	for len(want) > 0 {
		chunk := want[:min(len(want), opsync.MaxListIDs)]
		want = want[len(chunk):]
		rows, err := d.s.sync.ListIDs(d.ctx(), v.uid, "task", false, chunk)
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			continue
		}
		live := make([]string, 0, len(rows))
		projects := make([]string, 0, len(rows))
		for _, t := range rows {
			v.tasks = append(v.tasks, t)
			v.addTask(t)
			live = append(live, idOf(t["id"]))
			projects = append(projects, idOf(t["project_id"]))
		}
		got = append(got, rows...)
		if err := d.fetchProjects(v, projects); err != nil {
			return nil, err
		}
		res, err := d.s.sync.DB().QueryContext(d.ctx(), `SELECT task_id, name, uid FROM caldav_resources WHERE user_id = ? AND task_id IN (`+marks(len(live))+`)`,
			append([]any{v.uid}, anyStrings(live)...)...)
		if err != nil {
			return nil, err
		}
		if err := v.addResources(res); err != nil {
			return nil, err
		}
		mod, err := d.s.sync.ModifiedIDs(d.ctx(), v.uid, "task", live)
		if err != nil {
			return nil, err
		}
		for id, ts := range mod {
			v.modified[id] = ts
		}
		values := make([]json.RawMessage, len(live))
		for i, id := range live {
			values[i] = mustJSON(id)
		}
		reminders, err := d.s.sync.ListWhere(d.ctx(), v.uid, "reminder", false, &opsync.Match{Field: "task_id", Values: values})
		if err != nil {
			return nil, err
		}
		v.addReminders(reminders)
	}
	return got, nil
}

// taskRefs are the tasks serving t names: its parent, its blockers, its series
// and the series a piece of a split continues.
func taskRefs(t opsync.Entity) []string {
	out := []string{idOf(t["parent_id"]), idOf(t["series_id"])}
	var blockers []string
	_ = json.Unmarshal(t["blocked_by"], &blockers)
	out = append(out, blockers...)
	if s, ok := opsync.DecodeSplitFrom(t["split_from"]); ok {
		out = append(out, s.Series)
	}
	return out
}

// fetch reads the tasks ids into a partial view with what serving or changing
// them reads: the tasks they name, the parents up to the top (which place an
// Inbox task in its workspace), their labels and, for an open repeating task,
// its series' records. A full view has them already.
func (d *davRequest) fetch(v *davView, ids []string) error {
	if v.full {
		return nil
	}
	var want []string
	for _, id := range ids {
		if id != "" && !v.served[id] {
			v.served[id] = true
			want = append(want, id)
		}
	}
	if len(want) == 0 {
		return nil
	}
	if len(v.fetched)+len(want) > maxNarrow {
		_, err := d.load()
		return err
	}
	if _, err := d.fetchRows(v, want); err != nil {
		return err
	}
	var refs []string
	for _, id := range want {
		if t := v.byID[id]; t != nil {
			refs = append(refs, taskRefs(t)...)
		}
	}
	more, err := d.fetchRows(v, refs)
	if err != nil {
		return err
	}
	frontier := more
	for _, id := range want {
		if t := v.byID[id]; t != nil {
			frontier = append(frontier, t)
		}
	}
	for i := 0; i < 64 && len(frontier) > 0; i++ {
		parents := make([]string, 0, len(frontier))
		for _, t := range frontier {
			parents = append(parents, idOf(t["parent_id"]))
		}
		if frontier, err = d.fetchRows(v, parents); err != nil {
			return err
		}
	}
	if err := d.fetchLabels(v, want); err != nil {
		return err
	}
	return d.fetchSeries(v, want)
}

// fetchLabels reads the labels the tasks ids carry, unless every label is read.
func (d *davRequest) fetchLabels(v *davView, ids []string) error {
	if v.labelsRead {
		return nil
	}
	var want []string
	for _, id := range ids {
		var labels []string
		_ = json.Unmarshal(v.byID[id]["labels"], &labels)
		for _, l := range labels {
			if _, ok := v.labels[l]; !ok && !slices.Contains(want, l) {
				want = append(want, l)
			}
		}
	}
	if len(want) == 0 {
		return nil
	}
	if len(want) > opsync.MaxListIDs {
		return d.labelsLoaded(v)
	}
	labels, err := d.s.sync.ListIDs(d.ctx(), v.uid, "label", false, want)
	if err != nil {
		return err
	}
	for _, l := range labels {
		v.labels[idOf(l["id"])] = idOf(l["name"])
	}
	return nil
}

// repeats reports a task served with its series' exceptions (seriesParts).
func repeats(t opsync.Entity) bool {
	return t != nil && idOf(t["recurrence"]) != "" && decodeDue(t["due"]) != nil && isNullish(t["completed_at"])
}

// fetchSeries reads the records of the open repeating tasks among ids, which
// their exception dates and UNTIL come from. A split lineage in the account
// makes every task part of the budget (lineageRows): the view is widened.
func (d *davRequest) fetchSeries(v *davView, ids []string) error {
	var series []string
	for _, id := range ids {
		if repeats(v.byID[id]) {
			series = append(series, id)
		}
	}
	if len(series) == 0 {
		return nil
	}
	values, err := d.s.sync.FieldValues(d.ctx(), v.uid, "task", []string{"series_id", "split_from"})
	if err != nil {
		return err
	}
	var split, records []string
	for _, fv := range values {
		switch {
		case fv.Field == "split_from" && !isNullish(fv.Value):
			split = append(split, fv.EntityID)
		case fv.Field == "series_id" && slices.Contains(series, idOf(fv.Value)):
			records = append(records, fv.EntityID)
		}
	}
	if len(v.fetched)+len(split)+len(records) > maxNarrow {
		_, err := d.load()
		return err
	}
	if _, err := d.fetchRows(v, append(split, records...)); err != nil {
		return err
	}
	for _, id := range split {
		if t := v.byID[id]; t != nil {
			if _, ok := opsync.DecodeSplitFrom(t["split_from"]); ok {
				_, err := d.load()
				return err
			}
		}
	}
	var rows []opsync.Entity
	for _, id := range slices.Compact(slices.Sorted(slices.Values(records))) {
		if t := v.byID[id]; t != nil {
			rows = append(rows, t)
		}
	}
	listOrder(rows)
	for _, id := range series {
		v.bySeries[id] = nil
	}
	for _, t := range rows {
		sid := idOf(t["series_id"])
		v.bySeries[sid] = append(v.bySeries[sid], t)
	}
	return nil
}

// listOrder sorts tasks sorted by id as List returns them: by position, then
// creation time.
func listOrder(rows []opsync.Entity) {
	type keyed struct {
		t            opsync.Entity
		pos, created float64
	}
	ks := make([]keyed, len(rows))
	for i, t := range rows {
		ks[i] = keyed{t, numberOf(t["position"]), numberOf(t["created_at"])}
	}
	sort.SliceStable(ks, func(i, j int) bool {
		if ks[i].pos != ks[j].pos {
			return ks[i].pos < ks[j].pos
		}
		return ks[i].created < ks[j].created
	})
	for i := range ks {
		rows[i] = ks[i].t
	}
}

// findNames fills v.find for the resource names of a calendar: the tasks
// stored under a client-chosen name, or under the default <id>.ics.
func (d *davRequest) findNames(v *davView, cal string, names []string) error {
	if v.full || len(names) == 0 {
		return nil
	}
	if len(names) > maxNarrow {
		_, err := d.load()
		return err
	}
	var cand []string
	asked := make(map[string]bool, len(names))
	for _, n := range names {
		asked[n] = true
		if id, ok := strings.CutSuffix(n, ".ics"); ok {
			cand = append(cand, id)
		}
	}
	for chunk := names; len(chunk) > 0; {
		part := chunk[:min(len(chunk), opsync.MaxListIDs)]
		chunk = chunk[len(part):]
		rows, err := d.s.sync.DB().QueryContext(d.ctx(), `SELECT task_id FROM caldav_resources WHERE user_id = ? AND name IN (`+marks(len(part))+`)`,
			append([]any{v.uid}, anyStrings(part)...)...)
		if err != nil {
			return err
		}
		ids, err := scanIDs(rows)
		if err != nil {
			return err
		}
		cand = append(cand, ids...)
	}
	if err := d.fetch(v, cand); err != nil || v.full {
		return err
	}
	var found []opsync.Entity
	for _, id := range slices.Compact(slices.Sorted(slices.Values(cand))) {
		if t := v.byID[id]; t != nil {
			found = append(found, t)
		}
	}
	listOrder(found)
	for _, t := range found {
		name := v.resourceName(idOf(t["id"]))
		if !asked[name] {
			continue // a candidate under another name: that name's other tasks are not read
		}
		key := v.calendarOf(t) + "\x00" + name
		if _, dup := v.byRes[key]; !dup {
			v.byRes[key] = t
		}
	}
	return nil
}

// findUIDs fills v.taskByUID for UIDs: the tasks a client's UID was recorded
// for, and the task whose id is the UID.
func (d *davRequest) findUIDs(v *davView, uids []string) error {
	var want []string
	for _, u := range uids {
		if u != "" && !slices.Contains(want, u) {
			want = append(want, u)
		}
	}
	if v.full || len(want) == 0 {
		return nil
	}
	if len(want) > maxNarrow {
		_, err := d.load()
		return err
	}
	rows, err := d.s.sync.DB().QueryContext(d.ctx(), `SELECT task_id FROM caldav_resources WHERE user_id = ? AND uid IN (`+marks(len(want))+`)`,
		append([]any{v.uid}, anyStrings(want)...)...)
	if err != nil {
		return err
	}
	ids, err := scanIDs(rows)
	if err != nil {
		return err
	}
	if err := d.fetch(v, append(ids, want...)); err != nil || v.full {
		return err
	}
	// Every live task holding one of these UIDs is read now; other UIDs of the
	// view may not have all of theirs, so only these are indexed.
	for id, u := range v.uids {
		if !slices.Contains(want, u) {
			continue
		}
		if prev, dup := v.uidToID[u]; !dup || id < prev {
			v.uidToID[u] = id
		}
	}
	return nil
}

// reminderCandidates adds the tasks of changed reminders to candidates: the
// task a reminder belongs to, deleted reminders included.
func (d *davRequest) reminderCandidates(v *davView, changed map[string]map[string]bool, candidates map[string]bool) error {
	var unknown []string
	for rid := range changed {
		if tid, ok := v.remTask[rid]; ok {
			candidates[tid] = true
		} else {
			unknown = append(unknown, rid)
		}
	}
	for len(unknown) > 0 {
		chunk := unknown[:min(len(unknown), opsync.MaxListIDs)]
		unknown = unknown[len(chunk):]
		rows, err := d.s.sync.ListIDs(d.ctx(), v.uid, "reminder", true, chunk)
		if err != nil {
			return err
		}
		for _, r := range rows {
			candidates[idOf(r["task_id"])] = true
		}
	}
	return nil
}

// labelCandidates are the tasks that may carry a changed label: on a partial
// view every task whose stored labels name one in some scope (the caller
// keeps those whose record carries it, carriesLabel).
func (d *davRequest) labelCandidates(v *davView, changed map[string]map[string]bool) (map[string]bool, error) {
	if len(changed) == 0 {
		return nil, nil
	}
	out := map[string]bool{}
	if v.full {
		for _, t := range v.tasks {
			if carriesLabel(t, changed) {
				out[idOf(t["id"])] = true
			}
		}
		return out, nil
	}
	values, err := d.s.sync.FieldValues(d.ctx(), v.uid, "task", []string{"labels"})
	if err != nil {
		return nil, err
	}
	for _, fv := range values {
		if carriesLabel(opsync.Entity{"labels": fv.Value}, changed) {
			out[fv.EntityID] = true
		}
	}
	return out, nil
}

// carriesLabel reports a live task that carries one of the changed labels.
func carriesLabel(t opsync.Entity, changed map[string]map[string]bool) bool {
	if t == nil {
		return false
	}
	var labels []string
	_ = json.Unmarshal(t["labels"], &labels)
	for _, l := range labels {
		if changed[l] != nil {
			return true
		}
	}
	return false
}

func scanIDs(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close() error
}) ([]string, error) {
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func marks(n int) string { return strings.TrimSuffix(strings.Repeat("?,", n), ",") }

func anyStrings(s []string) []any {
	out := make([]any, len(s))
	for i, v := range s {
		out[i] = v
	}
	return out
}
