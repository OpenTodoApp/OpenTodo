package vault

// Time entries of task notes (OpenSpec change vault-tasknotes, design D5).

import (
	"sort"
	"strconv"
	"strings"
	"time"
)

// noteEntry is one time entry of a note.
type noteEntry struct {
	start, end int64 // end is -1 while the entry runs
	desc       string
	raw        fmMap
}

const tnTimeLayout = "2006-01-02T15:04:05.000Z"

func parseNoteTime(s string) (int64, bool) {
	t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(s))
	if err != nil {
		return 0, false
	}
	return t.UnixMilli(), true
}

// noteEntries reads a note's time entries; ok is false when the key is in a
// form the vault does not read.
func (e *engine) noteEntries(f *Front) ([]noteEntry, bool) {
	k := f.get(e.tn.set.key("timeEntries"))
	if k == nil || k.Kind == kindNull || k.Kind == kindList && len(k.List) == 0 {
		return nil, true
	}
	if k.Kind != kindMaps {
		return nil, false
	}
	var out []noteEntry
	for _, mp := range k.Maps {
		st, _ := mp.get("startTime")
		s, ok := parseNoteTime(st)
		if !ok {
			return nil, false
		}
		ne := noteEntry{start: s, end: -1, raw: mp}
		if et, has := mp.get("endTime"); has && strings.TrimSpace(et) != "" {
			en, ok := parseNoteTime(et)
			if !ok {
				return nil, false
			}
			ne.end = en
		}
		ne.desc, _ = mp.get("description")
		out = append(out, ne)
	}
	return out, true
}

// appEntries lists the live time entries of a task in a store, by start.
func appEntries(s Store, task string) map[int64]string {
	out := map[int64]string{}
	for _, eid := range s.IDs("time_entry") {
		r := s.Get("time_entry", eid)
		if r.Live() && r.Str("task_id") == task {
			out[int64(r.Num("started_at"))] = eid
		}
	}
	return out
}

func entryEnd(r Row) int64 {
	if !r.Set("ended_at") {
		return -1
	}
	return int64(r.Num("ended_at"))
}

// mergeTimeEntries merges a note's time entries (design D5): identity is the
// start time; the vault user's entries merge end time and description per
// field, other members' entries are read-only; an entry removed from the note
// is deleted when the app did not change it.
func (e *engine) mergeTimeEntries(m *mergeRun, n *noteFile, task string) error {
	list, ok := e.noteEntries(n.f)
	disp := e.notePath(n.path)
	if !ok {
		e.rep.warn("%s: %s is in a form the vault does not read; the time entries are read-only for this note", disp, e.tn.set.key("timeEntries"))
		return nil
	}
	appBy, baseBy := appEntries(e.app, task), appEntries(e.base, task)
	inNote := map[int64]bool{}
	for _, ne := range list {
		inNote[ne.start] = true
		aid, bid := appBy[ne.start], baseBy[ne.start]
		switch {
		case aid == "" && bid == "":
			eid := e.newID("time_entry", task, strconv.FormatInt(ne.start, 10))
			b := e.body("time_entry", eid)
			b["task_id"], b["user_id"], b["started_at"], b["device_id"] = task, e.o.UserID, ne.start, e.st.Device
			b["ended_at"], b["note"], b["created_at"], b["deleted_at"] = nil, ne.desc, e.nowMS(), nil
			if ne.end >= 0 {
				b["ended_at"] = ne.end
			}
			e.fresh["time_entry:"+eid] = true
			e.rep.event("time", disp, task, "added a time entry to %q", m.av.text("task", task, "title"))
		case aid == "":
			// Deleted in the app since the last sync: the app wins.
		default:
			ar := e.app.Get("time_entry", aid)
			br := e.base.Get("time_entry", aid)
			appEnd, appDesc := entryEnd(ar), m.av.text("time_entry", aid, "note")
			baseEnd, baseDesc := appEnd, appDesc
			if br != nil {
				baseEnd, baseDesc = entryEnd(br), m.bv.text("time_entry", aid, "note")
			}
			if ne.end == baseEnd && ne.desc == baseDesc || ne.end == appEnd && ne.desc == appDesc {
				continue
			}
			if ar.Str("user_id") != e.o.UserID {
				e.rep.warn("%s: a time entry of another member is read-only; the app's entry is written back", disp)
				continue
			}
			b := e.body("time_entry", aid)
			if ne.end != baseEnd && appEnd == baseEnd {
				if ne.end < 0 {
					b["ended_at"] = nil
				} else {
					b["ended_at"] = ne.end
				}
			}
			if ne.desc != baseDesc && appDesc == baseDesc && !m.av.undecryptable["time_entry:"+aid+":note"] {
				b["note"] = ne.desc
			}
		}
	}
	for start, aid := range appBy {
		if inNote[start] || baseBy[start] == "" {
			continue
		}
		ar, br := e.app.Get("time_entry", aid), e.base.Get("time_entry", aid)
		if ar.Str("user_id") != e.o.UserID || br == nil || !rowEqual(ar, br) {
			continue
		}
		e.body("time_entry", aid)["deleted_at"] = e.nowMS()
		e.rep.event("time", disp, task, "deleted a time entry of %q", m.av.text("task", task, "title"))
	}
	return nil
}

// timeEntryEdits writes the task's time entries in start order when they
// differ from the note's, keeping each matched entry's own text.
func (e *engine) timeEntryEdits(v *view, f *Front, task string, edit func(string, []string)) {
	list, ok := e.noteEntries(f)
	if !ok {
		return
	}
	k := e.tn.set.key("timeEntries")
	byStart := map[int64]noteEntry{}
	for _, ne := range list {
		byStart[ne.start] = ne
	}
	app := appEntries(v.s, task)
	starts := make([]int64, 0, len(app))
	for s := range app {
		starts = append(starts, s)
	}
	sort.Slice(starts, func(i, j int) bool { return starts[i] < starts[j] })
	var maps []fmMap
	same := len(starts) == len(list)
	for i, s := range starts {
		r := v.s.Get("time_entry", app[s])
		end, desc := entryEnd(r), v.text("time_entry", app[s], "note")
		if ne, ok := byStart[s]; ok && ne.end == end && ne.desc == desc {
			maps = append(maps, ne.raw)
			if same && list[i].start != s {
				same = false
			}
			continue
		}
		same = false
		mp := fmMap{Keys: []string{"startTime"}, Vals: map[string]string{"startTime": time.UnixMilli(s).UTC().Format(tnTimeLayout)}}
		if ne, ok := byStart[s]; ok {
			mp = fmMap{Keys: []string{"startTime"}, Vals: map[string]string{"startTime": ne.raw.Vals["startTime"]}}
		}
		if end >= 0 {
			mp.Keys = append(mp.Keys, "endTime")
			mp.Vals["endTime"] = time.UnixMilli(end).UTC().Format(tnTimeLayout)
		}
		if desc != "" {
			mp.Keys = append(mp.Keys, "description")
			mp.Vals["description"] = desc
		}
		maps = append(maps, mp)
	}
	if same {
		return
	}
	if len(maps) == 0 {
		if f.get(k) != nil {
			edit(k, nil)
		}
		return
	}
	edit(k, fmMapsLines(k, maps))
}
