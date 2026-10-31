package sync

import (
	"slices"
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// The pieces of a split series (OpenSpec change series-split, M7, D3, D4): the
// server's port of web/src/lib/lineage.ts and the lineage part of seriesBudget
// in recurring.ts, pinned with them by web/src/lib/series.fixture.json. A piece
// is a series whose split_from names the series it continues and the date it
// starts; the pieces of one lineage, ordered by those dates, each produce
// occurrences up to the day before the next piece's date.

// MaxPieces is the most pieces of one lineage taken into account; older ones
// end at their own until.
const MaxPieces = 50

// PieceID is the id of the piece a split of seriesID from date starts, the same
// on every device (web ids.ts pieceId).
func PieceID(seriesID, date string) string {
	return ids.NameID("series-split", seriesID+":"+date)
}

// piece is one series of a lineage; start is "" for the root.
type piece struct {
	id    string
	row   Entity
	start string
}

func splitOf(t Entity) (SplitFrom, bool) {
	if t == nil {
		return SplitFrom{}, false
	}
	return DecodeSplitFrom(t["split_from"])
}

// isPieceRow reports a live task that is not an occurrence record.
func isPieceRow(t Entity) bool {
	return !t.Deleted() && idValue(t["series_id"]) == ""
}

// lineageOf lists the lineage the series id (stored row row) belongs to among
// tasks: the root first, then the pieces by date, by id on a tie (web lineageOf).
func lineageOf(id string, row Entity, tasks []Entity) []piece {
	var pieces []Entity
	for _, t := range tasks {
		if _, ok := splitOf(t); ok && isPieceRow(t) {
			pieces = append(pieces, t)
		}
	}
	_, own := splitOf(row)
	if len(pieces) == 0 && !own {
		return []piece{{id: id, row: row}}
	}
	named := map[string]bool{}
	for _, p := range append(pieces, row) {
		if s, ok := splitOf(p); ok {
			named[s.Series] = true
		}
	}
	byID := map[string]Entity{}
	for _, t := range tasks {
		tid := idValue(t["id"])
		if _, sp := splitOf(t); (named[tid] || sp) && isPieceRow(t) {
			byID[tid] = t
		}
	}
	byID[id] = row
	if own && !slices.ContainsFunc(pieces, func(p Entity) bool { return idValue(p["id"]) == id }) {
		pieces = append(pieces, Entity{"id": JSONOf(id), "split_from": row["split_from"]})
	}
	// Up the chain to the first series that continues none (a cycle, which
	// derived ids cannot make, stops where it closes).
	rootOf := func(tid string) string {
		cur, seen := tid, map[string]bool{}
		for !seen[cur] {
			seen[cur] = true
			s, ok := splitOf(byID[cur])
			if !ok {
				break
			}
			if _, has := byID[s.Series]; !has {
				break
			}
			cur = s.Series
		}
		return cur
	}
	root := rootOf(id)
	out := []piece{{id: root, row: byID[root]}}
	var later []piece
	for _, p := range pieces {
		pid := idValue(p["id"])
		if pid == root || rootOf(pid) != root {
			continue
		}
		s, _ := splitOf(p)
		later = append(later, piece{id: pid, row: byID[pid], start: s.Date})
	}
	sort.Slice(later, func(i, j int) bool {
		if later[i].start != later[j].start {
			return later[i].start < later[j].start
		}
		return later[i].id < later[j].id
	})
	out = append(out, later...)
	if len(out) <= MaxPieces {
		return out
	}
	kept := out[len(out)-MaxPieces:]
	for _, p := range kept {
		if p.id == id {
			return kept
		}
	}
	return []piece{{id: id, row: row}}
}

// LineageFrom lists the ids and rows of the series id (stored row row) and of
// the pieces that follow it in its lineage, in date order (series-split D8:
// the occurrence list walks on past a split).
func LineageFrom(id string, row Entity, tasks []Entity) (ids []string, rows []Entity) {
	pieces := lineageOf(id, row, tasks)
	on := false
	for _, p := range pieces {
		on = on || p.id == id
		if on && p.row != nil {
			ids, rows = append(ids, p.id), append(rows, p.row)
		}
	}
	return ids, rows
}

// pieceEnd is the last date piece i produces occurrences on: the day before
// the next piece's date, "" when it is the last.
func pieceEnd(pieces []piece, i int) string {
	if i+1 < len(pieces) && pieces[i+1].start != "" {
		return recurrence.AddDays(pieces[i+1].start, -1)
	}
	return ""
}

// lineageBudget is SeriesBudget over the lineage of the series id (web
// seriesBudget given the row): every piece's records count and are exceptions,
// an earlier piece that ended counts its last occurrence, a counted series also
// uses up what earlier pieces still have to come, and End bounds the series.
func lineageBudget(id string, row Entity, tasks []Entity, exceptDate, today string) Budget {
	pieces := lineageOf(id, row, tasks)
	b := Budget{Except: map[string]bool{}, Own: map[string]bool{}}
	open, at := 0, 0
	for i, p := range pieces {
		if p.id == id {
			at = i
		}
		for _, r := range RecordsOf(p.id, tasks) {
			b.Except[r.Date] = true
			if p.id == id {
				b.Own[r.Date] = true
			}
			if r.Date == exceptDate {
				continue
			}
			switch r.State {
			case RecordDone:
				b.Done++
			case RecordOpen:
				open++
			}
		}
	}
	for i := 0; i < at; i++ {
		t, end := pieces[i].row, pieceEnd(pieces, i)
		last := ""
		if d := decodeRecurringDue(t["due"]); d != nil {
			last = d.Date
		}
		if t != nil && !IsNull(t["completed_at"]) && last != "" && !b.Except[last] && (end == "" || last <= end) {
			b.Done++
			b.Except[last] = true
		}
	}
	b.Taken = b.Done + open
	if s, ok := openSeries(id, row); ok && at > 0 && s.rule.Count() > 0 {
		on := today
		if on == "" {
			on = s.dueDate("")
		}
		for i := 0; i < at; i++ {
			b.Taken += remainingOf(pieces[i], pieceEnd(pieces, i), b.Taken, b.Except, on)
		}
	}
	b.End = pieceEnd(pieces, at)
	return b
}

// remainingOf counts what an earlier piece still has to come within its
// range: its current occurrence and the walk to its end.
func remainingOf(p piece, end string, used int, except map[string]bool, today string) int {
	s, ok := openSeries(p.id, p.row)
	cur := decodeRecurringDue(p.row["due"])
	if !ok || s.rule.AfterCompletion() || cur == nil || today == "" {
		return 0
	}
	r := s.rule.Bounded(end)
	date := cur.Date
	if u := r.Until(); u != "" && date > u {
		return 0
	}
	n := 1
	if except[date] {
		n = 0
	}
	for i, k := 0, 0; i < 3700; i++ {
		next, ok, err := r.Following(date, today, today, used+k)
		if err != nil || !ok || next <= date {
			break
		}
		date = next
		if except[next] {
			continue
		}
		k++
		n++
	}
	return n
}
