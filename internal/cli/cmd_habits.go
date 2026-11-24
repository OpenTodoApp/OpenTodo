package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Habit commands (OpenSpec change habits-assistant, design D3): list habits
// with their numbers, show one habit's last 31 days and log a day, through
// /api/v1/habits. The numbers are the server's, the same as every device's.

const habitsUsage = "ot habits\not habits show <id|title>\not habits log <id|title> [--date D] [--tiny|--skip|--clear] [--note text]"

// habitRow is a habit as the habits route returns it.
type habitRow struct {
	ID        string `json:"id"`
	Untrusted struct {
		Title string `json:"title"`
	} `json:"untrusted_text"`
	Rule        string          `json:"rule"`
	Current     *string         `json:"current_date"`
	Kept        int             `json:"kept"`
	KeptOf      int             `json:"kept_of"`
	Strength    int             `json:"strength"`
	Streak      int             `json:"streak"`
	BestStreak  int             `json:"best_streak"`
	AtRisk      bool            `json:"at_risk"`
	BackOnTrack bool            `json:"back_on_track"`
	Raw         json.RawMessage `json:"-"`
}

func cmdHabits(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return habitsList(a, ctx, g, args)
	}
	switch args[0] {
	case "list", "ls":
		return habitsList(a, ctx, g, args[1:])
	case "show":
		return habitsShow(a, ctx, g, args[1:])
	case "log":
		return habitsLog(a, ctx, g, args[1:])
	}
	return usageErr("unknown habits command %q (expected list, show or log)", args[0])
}

func (a *App) habitQuery(extra url.Values) string {
	if extra == nil {
		extra = url.Values{}
	}
	if z := a.localZone(); z != "" {
		extra.Set("timezone", z)
	}
	if len(extra) == 0 {
		return ""
	}
	return "?" + extra.Encode()
}

func (c *client) habits(ctx context.Context, query string) ([]habitRow, error) {
	raw, _, err := c.do(ctx, http.MethodGet, "/habits"+query, nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Habits []json.RawMessage `json:"habits"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode habits: %w", err)
	}
	rows := make([]habitRow, len(page.Habits))
	for i, r := range page.Habits {
		_ = json.Unmarshal(r, &rows[i])
		rows[i].Raw = r
	}
	return rows, nil
}

// resolveHabit finds a habit by id, unique id prefix or title (case-insensitive).
func resolveHabit(rows []habitRow, ref string) (*habitRow, error) {
	var hit *habitRow
	for i := range rows {
		if rows[i].ID == ref || strings.EqualFold(rows[i].Untrusted.Title, ref) {
			return &rows[i], nil
		}
		if strings.HasPrefix(rows[i].ID, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one habit; use more of its id", ref)
			}
			hit = &rows[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no habit %q (see `ot habits`)", ref)
	}
	return hit, nil
}

func keptLabel(h habitRow) string {
	s := strconv.Itoa(h.Kept) + "/" + strconv.Itoa(h.KeptOf)
	switch {
	case h.AtRisk:
		s += " at risk"
	case h.BackOnTrack:
		s += " back on track"
	}
	return s
}

func habitsList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("habits list", g)
	pos, err := a.parse(g, fs, "habits list", args)
	if err != nil {
		return a.helpOr("habits", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot habits")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.habits(ctx, a.habitQuery(nil))
	if err != nil {
		return err
	}
	if g.json {
		list := make([]json.RawMessage, len(rows))
		for i, r := range rows {
			list[i] = r.Raw
		}
		return a.printJSON(list)
	}
	if len(rows) == 0 {
		fmt.Fprintln(a.Stdout, "No habits.")
		return nil
	}
	tbl := newTable("ID", "HABIT", "KEPT", "STRENGTH", "STREAK")
	for _, r := range rows {
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(r.Untrusted.Title), plain(keptLabel(r)), plain(strconv.Itoa(r.Strength)), plain(strconv.Itoa(r.Streak)))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

// habitDetail is GET /api/v1/habits/{id} decoded.
type habitDetail struct {
	Habit habitRow `json:"habit"`
	Days  []struct {
		Date      string `json:"date"`
		State     string `json:"state"`
		Untrusted *struct {
			Note string `json:"note"`
		} `json:"untrusted_text"`
	} `json:"days"`
}

func (a *App) printHabit(raw []byte, g *globalFlags) error {
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var d habitDetail
	if err := json.Unmarshal(raw, &d); err != nil {
		return fmt.Errorf("decode habit: %w", err)
	}
	h := d.Habit
	fmt.Fprintf(a.Stdout, "%s  %s\nkept %s · strength %d · streak %d (best %d)\n", h.Untrusted.Title, h.Rule, keptLabel(h), h.Strength, h.Streak, h.BestStreak)
	for _, day := range d.Days {
		line := day.Date + "  " + day.State
		if day.Untrusted != nil && day.Untrusted.Note != "" {
			line += "  " + preview(day.Untrusted.Note)
		}
		fmt.Fprintln(a.Stdout, line)
	}
	return nil
}

func habitsShow(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("habits show", g)
	pos, err := a.parse(g, fs, "habits show", args)
	if err != nil {
		return a.helpOr("habits", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot habits show <id|title>")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.habits(ctx, a.habitQuery(url.Values{"graduated": {"true"}}))
	if err != nil {
		return err
	}
	h, err := resolveHabit(rows, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/habits/"+url.PathEscape(h.ID)+a.habitQuery(nil), nil, nil)
	if err != nil {
		return err
	}
	return a.printHabit(raw, g)
}

func habitsLog(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("habits log", g)
	date := fs.String("date", "", "the day to log: YYYY-MM-DD, today or yesterday (default today)")
	tiny := fs.Bool("tiny", false, "log the tiny version")
	skip := fs.Bool("skip", false, "skip the day (keeps the streak)")
	clear := fs.Bool("clear", false, "clear the day (reads as missed)")
	note := fs.String("note", "", "the day's check-in note")
	pos, err := a.parse(g, fs, "habits log", args)
	if err != nil {
		return a.helpOr("habits", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot habits log <id|title> [--date D] [--tiny|--skip|--clear] [--note text]")
	}
	state, n := "done", 0
	for flag, s := range map[*bool]string{tiny: "tiny", skip: "skipped", clear: "clear"} {
		if *flag {
			state, n = s, n+1
		}
	}
	if n > 1 {
		return usageErr("--tiny, --skip and --clear: give at most one")
	}
	body := map[string]any{"state": state}
	switch d := strings.TrimSpace(*date); d {
	case "", "today":
	case "yesterday":
		body["date"] = a.Now().AddDate(0, 0, -1).Format(time.DateOnly)
	default:
		if _, err := time.Parse(time.DateOnly, d); err != nil {
			return usageErr("--date: YYYY-MM-DD, today or yesterday")
		}
		body["date"] = d
	}
	if *note != "" {
		body["note"] = *note
	}
	if z := a.localZone(); z != "" {
		body["timezone"] = z
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.habits(ctx, a.habitQuery(nil))
	if err != nil {
		return err
	}
	h, err := resolveHabit(rows, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/habits/"+url.PathEscape(h.ID)+"/log"+a.habitQuery(nil), body, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var d habitDetail
	_ = json.Unmarshal(raw, &d)
	fmt.Fprintf(a.Stdout, "%s: kept %s · strength %d · streak %d\n", d.Habit.Untrusted.Title, keptLabel(d.Habit), d.Habit.Strength, d.Habit.Streak)
	return nil
}
