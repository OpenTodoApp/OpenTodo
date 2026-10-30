package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// Calendar slot commands (OpenSpec change calendar-slots, design D9): list the
// account's slots, add one, put tasks in one and delete one through
// /api/v1/slots. Putting tasks dates them to the slot's day in the same batch.

// slotRow is a slot as GET /api/v1/slots returns it.
type slotRow struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Date      string          `json:"date"`
	Start     string          `json:"start"`
	Minutes   int             `json:"minutes"`
	TaskIDs   []string        `json:"task_ids"`
	Encrypted bool            `json:"encrypted"`
	Raw       json.RawMessage `json:"-"`
}

func (r slotRow) name() string {
	switch {
	case r.Encrypted:
		return "(encrypted)"
	case r.Title == "":
		return "Slot"
	}
	return r.Title
}

func cmdSlots(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return slotsList(a, ctx, g, args)
	}
	switch args[0] {
	case "list", "ls":
		return slotsList(a, ctx, g, args[1:])
	case "add", "create":
		return slotsAdd(a, ctx, g, args[1:])
	case "put":
		return slotsPut(a, ctx, g, args[1:])
	case "rm", "delete":
		return slotsRm(a, ctx, g, args[1:])
	}
	return usageErr("unknown slots command %q (expected list, add, put or rm)", args[0])
}

func (c *client) slots(ctx context.Context, from, to string) ([]slotRow, error) {
	q := url.Values{}
	if from != "" {
		q.Set("from", from)
	}
	if to != "" {
		q.Set("to", to)
	}
	path := "/slots"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	raw, _, err := c.do(ctx, http.MethodGet, path, nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Slots []json.RawMessage `json:"slots"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode slots: %w", err)
	}
	rows := make([]slotRow, len(page.Slots))
	for i, r := range page.Slots {
		_ = json.Unmarshal(r, &rows[i])
		rows[i].Raw = r
	}
	return rows, nil
}

// slotEnd is "HH:MM" minutes after start, capped at 23:59.
func slotEnd(start string, minutes int) string {
	var h, m int
	if _, err := fmt.Sscanf(start, "%d:%d", &h, &m); err != nil {
		return ""
	}
	end := min(h*60+m+minutes, 24*60-1)
	return fmt.Sprintf("%02d:%02d", end/60, end%60)
}

func slotsList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("slots list", g)
	from := fs.String("from", "", "first day (YYYY-MM-DD, today, tomorrow or a weekday)")
	to := fs.String("to", "", "last day")
	pos, err := a.parse(g, fs, "slots list", args)
	if err != nil {
		return a.helpOr("slots", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot slots [--from <day>] [--to <day>]")
	}
	f, t := "", ""
	if *from != "" {
		if f, err = resolveDate(*from, a.Now()); err != nil {
			return err
		}
	}
	if *to != "" {
		if t, err = resolveDate(*to, a.Now()); err != nil {
			return err
		}
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.slots(ctx, f, t)
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
		fmt.Fprintln(a.Stdout, "No slots.")
		return nil
	}
	tbl := newTable("ID", "TITLE", "DATE", "TIME", "TASKS")
	for _, r := range rows {
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(r.name()), plain(r.Date), plain(r.Start+"-"+slotEnd(r.Start, r.Minutes)), plain(fmt.Sprint(len(r.TaskIDs))))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func slotsAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("slots add", g)
	date := fs.String("date", "today", "the day (YYYY-MM-DD, today, tomorrow or a weekday)")
	at := fs.String("at", "09:00", "start time HH:MM")
	length := fs.String("for", "30m", "length, 15m to 8h in 15-minute steps")
	color := fs.String("color", "", "colour as #rrggbb")
	pos, err := a.parse(g, fs, "slots add", args)
	if err != nil {
		return a.helpOr("slots", err)
	}
	title := strings.TrimSpace(strings.Join(pos, " "))
	if title == "" {
		return usageErr(`usage: ot slots add <title> [--date <day>] [--at 16:00] [--for 45m] [--color #rrggbb]`)
	}
	day, err := resolveDate(*date, a.Now())
	if err != nil {
		return err
	}
	minutes, ok := timetrack.ParseDuration(*length)
	if !ok {
		return usageErr("--for: %q is not a length such as 45m or 1h30m", *length)
	}
	body := map[string]any{"title": title, "date": day, "start": *at, "minutes": minutes}
	if *color != "" {
		body["color"] = *color
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/slots", body, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var s slotRow
	_ = json.Unmarshal(raw, &s)
	fmt.Fprintln(a.Stdout, s.ID)
	return nil
}

// resolveSlot finds a slot by id, unique id prefix or exact title.
func resolveSlot(rows []slotRow, ref string) (*slotRow, error) {
	var hit *slotRow
	for i := range rows {
		if rows[i].ID == ref {
			return &rows[i], nil
		}
		if strings.HasPrefix(rows[i].ID, ref) || strings.EqualFold(rows[i].Title, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one slot; use more of its id", ref)
			}
			hit = &rows[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no slot %q (see `ot slots`)", ref)
	}
	return hit, nil
}

// slotsPut adds tasks to the end of a slot and dates them to its day, one batch.
func slotsPut(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("slots put", g)
	pos, err := a.parse(g, fs, "slots put", args)
	if err != nil {
		return a.helpOr("slots", err)
	}
	if len(pos) < 2 {
		return usageErr("usage: ot slots put <slot> <task>…")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.slots(ctx, "", "")
	if err != nil {
		return err
	}
	s, err := resolveSlot(rows, pos[0])
	if err != nil {
		return err
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	tasks, _, err := resolveTaskRefs(all, pos[1:])
	if err != nil {
		return err
	}
	list := slices.Clone(s.TaskIDs)
	if list == nil {
		list = []string{}
	}
	for _, t := range tasks {
		if !slices.Contains(list, t.ID) {
			list = append(list, t.ID)
		}
	}
	a.target(pos[0], s.ID, s.name(), "updated")
	raw, _, err := c.do(ctx, http.MethodPatch, "/slots/"+s.ID, map[string]any{"task_ids": list, "move_tasks": true}, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	fmt.Fprintf(a.Stdout, "%s  %s  %d tasks on %s\n", shortID(s.ID), s.name(), len(list), s.Date)
	return nil
}

func slotsRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("slots rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	pos, err := a.parse(g, fs, "slots rm", args)
	if err != nil {
		return a.helpOr("slots", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot slots rm <id> [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.slots(ctx, "", "")
	if err != nil {
		return err
	}
	s, err := resolveSlot(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], s.ID, s.name(), "deleted")
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete slot %q? Its tasks stay on %s without a time.", s.name(), s.Date))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := c.delete(ctx, "/slots/"+s.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(s.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(s.ID), s.name())
	return nil
}
