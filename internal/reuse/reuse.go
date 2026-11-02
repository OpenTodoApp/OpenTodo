// Package reuse is the matching of reusable lists (OpenSpec reusable-lists,
// design D2 and D4), the Go port of web/src/lib/reusable.ts: the title
// normalization, the item an add matches, and the duplicates a device collapses.
// REST (POST /api/v1/tasks with reuse) and the agent tools use FindMatch; the
// collapse runs on devices only, and DuplicateLosers is here so both languages
// are pinned by the same vectors (web/src/lib/reusable.vectors.json).
//
// Known difference: decomposition covers the blocks of notesearch's fold table
// (Latin, Greek, Cyrillic, punctuation, ligatures, fullwidth forms); the web
// client uses full NFKD.
package reuse

import (
	"encoding/json"
	"sort"
	"strings"
	"unicode"

	"github.com/OpenTodoApp/opentodo/internal/notesearch"
)

// Aisles are the aisle keys a section may carry, in store order.
var Aisles = []string{"produce", "bakery", "dairy", "meat", "frozen", "pantry", "drinks", "household", "personal"}

// ValidAisle reports whether key is one of Aisles.
func ValidAisle(key string) bool {
	for _, a := range Aisles {
		if a == key {
			return true
		}
	}
	return false
}

func isSpace(r rune) bool { return unicode.IsSpace(r) || r == 0xFEFF }

// NormalizeTitle is a title for comparison: decomposed, combining marks dropped,
// lower-cased with the root locale ("ς" written "σ"), trimmed, runs of white
// space collapsed to one space, and one trailing full stop dropped. "" never
// matches anything.
func NormalizeTitle(s string) string {
	t := strings.Join(strings.FieldsFunc(notesearch.Normalize(s), isSpace), " ")
	if strings.HasSuffix(t, ".") {
		t = strings.TrimRightFunc(t[:len(t)-1], isSpace)
	}
	return t
}

// Task is what the rules read of a task row.
type Task struct {
	ID          string
	Title       string
	ProjectID   string
	ParentID    string
	CompletedAt int64 // 0 while open
	Deleted     bool
	Description string
	Recurring   bool
	SeriesID    string
	Skipped     bool
}

// State says what a match is: Open is left alone, Completed is reopened.
type State string

const (
	Open      State = "open"
	Completed State = "completed"
)

// Match is the item an add matched.
type Match struct {
	Task  Task
	State State
}

// candidate is a live top-level item of the project; occurrence records and
// skips are history, not items.
func candidate(t Task, projectID string) bool {
	return t.ProjectID == projectID && !t.Deleted && t.ParentID == "" && t.SeriesID == "" && !t.Skipped
}

// FindMatch is the item an add of title to the project matches: the open match
// with the smallest id, else the most recently completed match (ties to the
// smaller id).
func FindMatch(projectID, title string, tasks []Task) (Match, bool) {
	key := NormalizeTitle(title)
	if key == "" {
		return Match{}, false
	}
	var open, done *Task
	for i := range tasks {
		t := &tasks[i]
		if !candidate(*t, projectID) || NormalizeTitle(t.Title) != key {
			continue
		}
		if t.CompletedAt == 0 {
			if open == nil || t.ID < open.ID {
				open = t
			}
		} else if done == nil || t.CompletedAt > done.CompletedAt || (t.CompletedAt == done.CompletedAt && t.ID < done.ID) {
			done = t
		}
	}
	switch {
	case open != nil:
		return Match{Task: *open, State: Open}, true
	case done != nil:
		return Match{Task: *done, State: Completed}, true
	}
	return Match{}, false
}

// DuplicateLosers are the ids a device tombstones to collapse duplicates: among
// the project's live, open, top-level items, every group of two or more with
// the same normalized title where none has notes, subtasks, a recurrence rule
// or an id in attached (comments, attachments, reminders, time entries) loses
// every item but the one with the smallest id. Sorted.
func DuplicateLosers(projectID string, tasks []Task, attached map[string]bool) []string {
	parents := map[string]bool{}
	for _, t := range tasks {
		if t.ParentID != "" && !t.Deleted {
			parents[t.ParentID] = true
		}
	}
	groups := map[string][]Task{}
	for _, t := range tasks {
		if !candidate(t, projectID) || t.CompletedAt != 0 {
			continue
		}
		if key := NormalizeTitle(t.Title); key != "" {
			groups[key] = append(groups[key], t)
		}
	}
	losers := []string{}
	for _, g := range groups {
		if len(g) < 2 {
			continue
		}
		plain := true
		for _, t := range g {
			if strings.TrimSpace(t.Description) != "" || t.Recurring || parents[t.ID] || attached[t.ID] {
				plain = false
				break
			}
		}
		if !plain {
			continue
		}
		sort.Slice(g, func(i, j int) bool { return g[i].ID < g[j].ID })
		for _, t := range g[1:] {
			losers = append(losers, t.ID)
		}
	}
	sort.Strings(losers)
	return losers
}

// FromRow reads a materialized task row (a sync Entity) into a Task.
func FromRow(row map[string]json.RawMessage) Task {
	str := func(f string) string {
		var s string
		_ = json.Unmarshal(row[f], &s)
		return s
	}
	set := func(f string) bool { v := string(row[f]); return v != "" && v != "null" }
	var completed float64
	_ = json.Unmarshal(row["completed_at"], &completed)
	return Task{
		ID: str("id"), Title: str("title"), ProjectID: str("project_id"), ParentID: str("parent_id"),
		CompletedAt: int64(completed), Deleted: set("deleted_at"), Description: str("description"),
		Recurring: set("recurrence"), SeriesID: str("series_id"), Skipped: string(row["skipped"]) == "true",
	}
}

// FromRows reads every row with FromRow.
func FromRows[R ~map[string]json.RawMessage](rows []R) []Task {
	out := make([]Task, len(rows))
	for i, r := range rows {
		out[i] = FromRow(r)
	}
	return out
}
