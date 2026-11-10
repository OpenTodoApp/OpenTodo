package perfseed

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/notelinks"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The notes fixture (OpenSpec change performance-10k, design D7): on top of the
// 10,000-task account, notes saved about 300 times each over twelve months, with
// real mergeable documents (scripts/perf/notes-seed.mjs writes them from a fixed
// seed with the web app's own document code). Half are standalone notes, half
// task notes. Each note's saves fall on NoteDays days; a tenth of the notes were
// edited in the last 30 days (their last RecentSaves saves), the rest earlier.
const (
	NoteDays    = 20
	RecentSaves = 30
	// RecentEvery: every RecentEvery-th note has saves inside the 30-day window.
	RecentEvery = 10
)

// NotesSummary is what SeedNotes writes into the summary.
type NotesSummary struct {
	Notes       int   `json:"notes"`
	Standalone  int   `json:"standalone"`
	TaskNotes   int   `json:"taskNotes"`
	Saves       int   `json:"saves"`
	Recent      int   `json:"recent"`
	RecentSaves int   `json:"recentSaves"`
	DocBytes    int64 `json:"docBytes"`
	// Links counts the internal links in the notes' last texts (note-links D5);
	// LinkedNote is a standalone note other notes link to (the note-references metric).
	Links      int    `json:"links"`
	LinkedNote string `json:"linkedNote"`
}

// save is one line of the documents file.
type save struct {
	Note int    `json:"note"`
	Save int    `json:"save"`
	Doc  string `json:"doc"`
	Text string `json:"text"`
}

// SeedNotes writes the documents file's saves into the account Run built in
// dataDir, through the op log, with the sync service's clock stepped to each
// save's day so receipt times spread over the year. o must be the Options Run
// used (the seed names the tasks the task notes belong to).
func SeedNotes(ctx context.Context, dataDir, docs string, owner string, o Options) (NotesSummary, error) {
	if o.Seed == 0 {
		o.Seed = DefaultSeed
	}
	if o.Now.IsZero() {
		o.Now = time.Now()
	}
	db, err := store.Open(dataDir)
	if err != nil {
		return NotesSummary{}, err
	}
	defer db.Close()
	f, err := os.Open(docs)
	if err != nil {
		return NotesSummary{}, err
	}
	defer f.Close()
	svc := opsync.NewService(db)
	g := &gen{o: o}
	rng := rand.New(rand.NewPCG(o.Seed^0x5eed, o.Seed)) // #nosec G404 -- test data from a fixed seed, never a secret
	sum := NotesSummary{LinkedNote: g.id("note", 0)}
	var clock time.Time
	svc.SetClock(func() time.Time { return clock })

	// The saves of one note, read in order, written day by day.
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 1<<20), 64<<20)
	var note []save
	flush := func() error {
		if len(note) == 0 {
			return nil
		}
		n := note[0].Note
		entity, id := "note", g.id("note", n)
		standalone := n%2 == 0
		if !standalone {
			// Open tasks outside the big project: 2,000 … (task notes until notes-overview's own notes, now both).
			entity, id = "task", g.id("task", BigOpen+n)
		}
		days := noteDays(rng, o.Now, n%RecentEvery == 0)
		perDay := (len(note) + len(days) - 1) / len(days)
		recent := n%RecentEvery == 0
		for d, day := range days {
			from, to := d*perDay, min((d+1)*perDay, len(note))
			if recent {
				// The last RecentSaves saves on the last two days, inside the window.
				older := len(note) - RecentSaves
				olderDays := len(days) - 2
				switch {
				case d < olderDays:
					per := (older + olderDays - 1) / olderDays
					from, to = d*per, min((d+1)*per, older)
				default:
					half := RecentSaves / 2
					from = older + (d-olderDays)*half
					to = min(from+half, len(note))
				}
			}
			if from >= to {
				continue
			}
			var ops []opsync.Op
			for i, s := range note[from:to] {
				at := day.Add(time.Duration(i) * time.Minute)
				ts := at.UnixMilli()
				g.opSeq++
				docV, _ := json.Marshal(s.Doc)
				textV, _ := json.Marshal(s.Text)
				ops = append(ops,
					opsync.Op{ID: g.id("noteop", g.opSeq*2), Entity: entity, EntityID: id, Field: "notes_doc", Value: docV, TS: ts, Device: Device},
					opsync.Op{ID: g.id("noteop", g.opSeq*2+1), Entity: entity, EntityID: id, Field: "description", Value: textV, TS: ts, Device: Device})
				sum.DocBytes += int64(len(s.Doc))
				if recent && from >= len(note)-RecentSaves {
					sum.RecentSaves++
				}
			}
			if d == 0 && standalone {
				title, _ := json.Marshal(fmt.Sprintf("Note %d", n+1))
				created, _ := json.Marshal(day.UnixMilli())
				ops = append(ops,
					opsync.Op{ID: g.id("notetitle", n), Entity: "note", EntityID: id, Field: "title", Value: title, TS: day.UnixMilli() - 1, Device: Device},
					opsync.Op{ID: g.id("notecreated", n), Entity: "note", EntityID: id, Field: "created_at", Value: created, TS: day.UnixMilli() - 1, Device: Device})
			}
			clock = day.Add(time.Duration(to-from) * time.Minute)
			if _, err := svc.ApplyStrict(ctx, owner, ops); err != nil {
				return fmt.Errorf("perfseed: note %d: %w", n, err)
			}
			sum.Saves += to - from
		}
		sum.Notes++
		sum.Links += len(notelinks.LinksIn(note[len(note)-1].Text))
		if standalone {
			sum.Standalone++
		} else {
			sum.TaskNotes++
		}
		if recent {
			sum.Recent++
		}
		note = note[:0]
		return nil
	}
	for sc.Scan() {
		var s save
		if err := json.Unmarshal(sc.Bytes(), &s); err != nil {
			return sum, fmt.Errorf("perfseed: %s: %w", docs, err)
		}
		if len(note) > 0 && note[0].Note != s.Note {
			if err := flush(); err != nil {
				return sum, err
			}
		}
		note = append(note, s)
	}
	if err := sc.Err(); err != nil {
		return sum, err
	}
	return sum, flush()
}

// noteDays are a note's NoteDays editing days, oldest first, at noon UTC: over
// the year before the 30-day window, and for a recent note its last two days
// inside the window.
func noteDays(rng *rand.Rand, now time.Time, recent bool) []time.Time {
	u := now.UTC()
	today := time.Date(u.Year(), u.Month(), u.Day(), 12, 0, 0, 0, time.UTC)
	picked := map[int]bool{}
	var out []int
	older := NoteDays
	if recent {
		older = NoteDays - 2
	}
	for len(out) < older {
		d := 31 + rng.IntN(334) // 31 … 364 days ago
		if !picked[d] {
			picked[d] = true
			out = append(out, d)
		}
	}
	if recent {
		a, b := 2+rng.IntN(12), 15+rng.IntN(13)
		out = append(out, a, b)
	}
	// Oldest first.
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j] > out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	days := make([]time.Time, len(out))
	for i, d := range out {
		days[i] = today.AddDate(0, 0, -d)
	}
	return days
}
