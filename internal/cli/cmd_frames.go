package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
)

// Calendar frame commands (OpenSpec change calendar-frames, design D7): list
// the account's frames, add one and delete one through /api/v1/frames.

// frameRow is a frame as GET /api/v1/frames returns it.
type frameRow struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Weekdays  string          `json:"weekdays"`
	Start     string          `json:"start"`
	End       string          `json:"end"`
	Source    string          `json:"source"`
	FromDate  *string         `json:"from_date"`
	UntilDate *string         `json:"until_date"`
	Encrypted bool            `json:"encrypted"`
	Raw       json.RawMessage `json:"-"`
}

func cmdFrames(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return framesList(a, ctx, g, args)
	}
	switch args[0] {
	case "list", "ls":
		return framesList(a, ctx, g, args[1:])
	case "add", "create":
		return framesAdd(a, ctx, g, args[1:])
	case "rm", "delete":
		return framesRm(a, ctx, g, args[1:])
	}
	return usageErr("unknown frames command %q (expected list, add or rm)", args[0])
}

func (c *client) frames(ctx context.Context) ([]frameRow, error) {
	raw, _, err := c.do(ctx, http.MethodGet, "/frames", nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Frames []json.RawMessage `json:"frames"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode frames: %w", err)
	}
	rows := make([]frameRow, len(page.Frames))
	for i, r := range page.Frames {
		_ = json.Unmarshal(r, &rows[i])
		rows[i].Raw = r
	}
	return rows, nil
}

var weekdayNames = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

// parseDays reads --days: mon-fri, mon,wed,fri, weekdays, weekend, daily or
// ISO digits (1 Monday … 7 Sunday), into a sorted ISO list "1,2,3,4,5".
func parseDays(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "weekdays":
		return "1,2,3,4,5", nil
	case "weekend":
		return "6,7", nil
	case "daily", "every day", "all":
		return "1,2,3,4,5,6,7", nil
	}
	day := func(p string) (int, bool) {
		p = strings.TrimSpace(p)
		if n, err := strconv.Atoi(p); err == nil && n >= 1 && n <= 7 {
			return n, true
		}
		for i, name := range weekdayNames {
			if len(p) >= 3 && strings.HasPrefix(name, p[:3]) {
				return i + 1, true
			}
		}
		return 0, false
	}
	var days []int
	for _, part := range strings.Split(s, ",") {
		lo, hi, isRange := strings.Cut(part, "-")
		a, ok := day(lo)
		if !ok {
			return "", usageErr("--days: unknown day %q (use mon-fri, mon,wed,fri, weekdays, weekend, daily or 1-7)", lo)
		}
		b := a
		if isRange {
			if b, ok = day(hi); !ok {
				return "", usageErr("--days: unknown day %q", hi)
			}
		}
		for d := a; ; d = d%7 + 1 {
			if !slices.Contains(days, d) {
				days = append(days, d)
			}
			if d == b {
				break
			}
		}
	}
	slices.Sort(days)
	out := make([]string, len(days))
	for i, d := range days {
		out[i] = strconv.Itoa(d)
	}
	return strings.Join(out, ","), nil
}

// daysLabel prints an ISO weekday list as names, "mon-fri" for a run.
func daysLabel(list string) string {
	if list == "" {
		return "never"
	}
	var names []string
	for _, p := range strings.Split(list, ",") {
		if n, err := strconv.Atoi(p); err == nil && n >= 1 && n <= 7 {
			names = append(names, weekdayNames[n-1])
		}
	}
	switch list {
	case "1,2,3,4,5":
		return "mon-fri"
	case "1,2,3,4,5,6,7":
		return "daily"
	}
	return strings.Join(names, ",")
}

func framesList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("frames list", g)
	pos, err := a.parse(g, fs, "frames list", args)
	if err != nil {
		return a.helpOr("frames", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot frames list")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.frames(ctx)
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
		fmt.Fprintln(a.Stdout, "No frames.")
		return nil
	}
	tbl := newTable("ID", "TITLE", "DAYS", "TIME", "SOURCE")
	for _, r := range rows {
		title := r.Title
		if r.Encrypted {
			title = "(encrypted)"
		}
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(title), plain(daysLabel(r.Weekdays)), plain(r.Start+"-"+r.End), plain(r.Source))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func framesAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("frames add", g)
	days := fs.String("days", "weekdays", "days it repeats on")
	from := fs.String("from", "09:00", "start time HH:MM")
	to := fs.String("to", "10:00", "end time HH:MM")
	color := fs.String("color", "", "colour as #rrggbb")
	source := fs.String("source", "", "planning source")
	pos, err := a.parse(g, fs, "frames add", args)
	if err != nil {
		return a.helpOr("frames", err)
	}
	title := strings.TrimSpace(strings.Join(pos, " "))
	if title == "" {
		return usageErr(`usage: ot frames add <title> [--days mon-fri] [--from 09:00] [--to 10:00] [--color #rrggbb] [--source label:<id>]`)
	}
	weekdays, err := parseDays(*days)
	if err != nil {
		return err
	}
	body := map[string]any{"title": title, "weekdays": weekdays, "start": *from, "end": *to}
	if *color != "" {
		body["color"] = *color
	}
	if *source != "" {
		body["source"] = *source
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/frames", body, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var f frameRow
	_ = json.Unmarshal(raw, &f)
	fmt.Fprintln(a.Stdout, f.ID)
	return nil
}

// resolveFrame finds a frame by id, unique id prefix or exact title.
func resolveFrame(rows []frameRow, ref string) (*frameRow, error) {
	var hit *frameRow
	for i := range rows {
		if rows[i].ID == ref || strings.EqualFold(rows[i].Title, ref) {
			return &rows[i], nil
		}
		if strings.HasPrefix(rows[i].ID, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one frame; use more of its id", ref)
			}
			hit = &rows[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no frame %q (see `ot frames`)", ref)
	}
	return hit, nil
}

func framesRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("frames rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	pos, err := a.parse(g, fs, "frames rm", args)
	if err != nil {
		return a.helpOr("frames", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot frames rm <id> [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	rows, err := c.frames(ctx)
	if err != nil {
		return err
	}
	f, err := resolveFrame(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], f.ID, f.Title, "deleted")
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete frame %q?", f.Title))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := c.delete(ctx, "/frames/"+f.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(f.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(f.ID), f.Title)
	return nil
}
