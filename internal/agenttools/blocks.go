package agenttools

import (
	"context"
	"sort"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The rows of an MCP block (OpenSpec change mcp-blocks, design D3): the host
// draws a display tool's result in its frame, and cannot read the device's
// rows, so the result carries them. They are read through the same snapshot as
// the read tools: projects kept away from AI assistants and everything in them
// are already gone, and an encrypted value is e2ee.Placeholder, which
// `ot mcp --decrypt` replaces on the user's machine (its result walk sees a
// task by untrusted_text.title).

// BlockRow is one task of a block.
type BlockRow struct {
	ID        string       `json:"id"`
	Untrusted blockRowText `json:"untrusted_text"`
	ProjectID *string      `json:"project_id"`
	Due       *dueOut      `json:"due"`
	// Date and Time are the due date and time in the user's time zone (a
	// floating due reads as written).
	Date     string  `json:"date,omitempty"`
	Time     string  `json:"time,omitempty"`
	Deadline *string `json:"deadline"`
	// DaysLeft is the days from today to the deadline (negative once missed).
	DaysLeft  *int `json:"days_left,omitempty"`
	Overdue   bool `json:"overdue,omitempty"`
	Completed bool `json:"completed"`
	Estimate  *int `json:"estimate_minutes,omitempty"`
	Encrypted bool `json:"encrypted,omitempty"`
}

type blockRowText struct {
	Title   string `json:"title"`
	Project string `json:"project"`
}

func (snap *snapshot) blockRow(t opsync.Entity, loc *time.Location, today string) BlockRow {
	full := snap.render(t, loc, today, false)
	row := BlockRow{ID: full.ID, Untrusted: blockRowText{Title: full.Untrusted.Title, Project: full.Untrusted.Project},
		ProjectID: full.ProjectID, Due: full.Due, Deadline: full.Deadline, Overdue: full.Overdue, Completed: full.Completed,
		Estimate: full.EstimateMinutes, Encrypted: full.Encrypted}
	if d := taskDue(t); d != nil {
		row.Date, row.Time = localDue(d, loc)
	}
	if row.Deadline != nil {
		if dl, err := time.Parse(time.DateOnly, *row.Deadline); err == nil {
			if td, err := time.Parse(time.DateOnly, today); err == nil {
				n := int(dl.Sub(td).Hours() / 24)
				row.DaysLeft = &n
			}
		}
	}
	return row
}

// BlockTasks returns the tasks a show_tasks block names, in the order given
// and without repeats: exactly the ids Shown keeps for ShownTask. Every other
// id is left out, so an unknown id and an excluded one look the same.
func (r *Registry) BlockTasks(ctx context.Context, userID string, ids []string) ([]BlockRow, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	loc := r.zone(ctx, userID)
	today := r.today(loc)
	byID := map[string]opsync.Entity{}
	for _, t := range snap.tasks {
		if snap.visible(t, true) {
			byID[rawStr(t, "id")] = t
		}
	}
	out := []BlockRow{}
	seen := map[string]bool{}
	for _, id := range ids {
		if t, ok := byID[id]; ok && !seen[id] {
			seen[id] = true
			out = append(out, snap.blockRow(t, loc, today))
		}
	}
	return out, nil
}

// BlockCalendar returns the dated tasks of the days (consecutive YYYY-MM-DD),
// done ones included, by day, time (untimed first) and title; at most limit,
// with how many more there are.
func (r *Registry) BlockCalendar(ctx context.Context, userID string, days []string, limit int) ([]BlockRow, int, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	loc := r.zone(ctx, userID)
	today := r.today(loc)
	want := map[string]bool{}
	for _, d := range days {
		want[d] = true
	}
	rows := []BlockRow{}
	for _, t := range snap.tasks {
		if !snap.visible(t, false) {
			continue
		}
		d := taskDue(t)
		if d == nil {
			continue
		}
		if date, _ := localDue(d, loc); want[date] {
			rows = append(rows, snap.blockRow(t, loc, today))
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.Time != b.Time {
			return a.Time < b.Time
		}
		if a.Untrusted.Title != b.Untrusted.Title {
			return a.Untrusted.Title < b.Untrusted.Title
		}
		return a.ID < b.ID
	})
	return capRows(rows, limit)
}

// BlockDeadlines returns the open tasks with a deadline on from..to, by
// deadline and title; at most limit, with how many more there are.
func (r *Registry) BlockDeadlines(ctx context.Context, userID, from, to string, limit int) ([]BlockRow, int, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	loc := r.zone(ctx, userID)
	today := r.today(loc)
	rows := []BlockRow{}
	for _, t := range snap.tasks {
		dl := str(t, "deadline")
		if !snap.visible(t, false) || !isOpen(t) || dl == "" || dl < from || dl > to {
			continue
		}
		rows = append(rows, snap.blockRow(t, loc, today))
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if *a.Deadline != *b.Deadline {
			return *a.Deadline < *b.Deadline
		}
		if a.Untrusted.Title != b.Untrusted.Title {
			return a.Untrusted.Title < b.Untrusted.Title
		}
		return a.ID < b.ID
	})
	return capRows(rows, limit)
}

func capRows(rows []BlockRow, limit int) ([]BlockRow, int, error) {
	if limit > 0 && len(rows) > limit {
		return rows[:limit], len(rows) - limit, nil
	}
	return rows, 0, nil
}
