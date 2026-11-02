package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/sector"
)

// Objective commands (OpenSpec change plan-objectives, design D7): list the
// current quarter's and week's objectives, add one to the current or next
// quarter or week, mark one done or open again, edit its title and delete it,
// through /api/v1/objectives. Weeks are ISO weeks (Monday weeks).

const objectivesUsage = "ot objectives [--quarter|--week] [--period <p>]\not objectives add <title> --quarter|--week [--next]\not objectives done <id>\not objectives undone <id>\not objectives edit <id> --title <t>\not objectives delete <id> [--yes]"

// objectiveRow is an objective as GET /api/v1/objectives returns it, with the
// title decrypted where this machine can.
type objectiveRow struct {
	ID       string          `json:"id"`
	Title    string          `json:"title"`
	Period   string          `json:"period"`
	Position float64         `json:"position"`
	DoneAt   float64         `json:"done_at"`
	Raw      json.RawMessage `json:"-"`
}

func cmdObjectives(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return objectivesList(a, ctx, g, args)
	}
	switch args[0] {
	case "list", "ls":
		return objectivesList(a, ctx, g, args[1:])
	case "add", "create":
		return objectivesAdd(a, ctx, g, args[1:])
	case "done":
		return objectivesDone(a, ctx, g, args[1:], "done")
	case "undone":
		return objectivesDone(a, ctx, g, args[1:], "undone")
	case "edit":
		return objectivesEdit(a, ctx, g, args[1:])
	case "delete", "rm":
		return objectivesDelete(a, ctx, g, args[1:])
	}
	return usageErr("unknown objectives command %q (expected list, add, done, undone, edit or delete)", args[0])
}

// currentPeriods are this and next quarter and ISO week on the machine's date.
func (a *App) currentPeriods() map[string]string {
	return sector.Current(a.Now().Format(time.DateOnly), 1)
}

func (s *noteSession) objectives(ctx context.Context, query string) ([]objectiveRow, error) {
	raw, _, err := s.c.do(ctx, http.MethodGet, "/objectives"+query, nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Objectives []json.RawMessage `json:"objectives"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode objectives: %w", err)
	}
	rows := make([]objectiveRow, len(page.Objectives))
	for i, r := range page.Objectives {
		rows[i] = s.objectiveFrom(r)
	}
	return rows, nil
}

// objectiveFrom reads one objective, its title decrypted or "[encrypted]".
func (s *noteSession) objectiveFrom(raw json.RawMessage) objectiveRow {
	var o objectiveRow
	_ = json.Unmarshal(raw, &o)
	o.Raw = raw
	if pt, ok := s.open("objective", o.ID, "title", o.Title); ok {
		o.Title = pt
	} else {
		o.Title = "[encrypted]"
	}
	if pt := o.Title; pt != "" && s.encrypted {
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			m["title"] = pt
			o.Raw, _ = json.Marshal(m)
		}
	}
	return o
}

func objectivesList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("objectives list", g)
	quarter := fs.Bool("quarter", false, "only the current quarter's")
	week := fs.Bool("week", false, "only the current week's")
	period := fs.String("period", "", "only this period: YYYY-Qn or YYYY-Www")
	pos, err := a.parse(g, fs, "objectives list", args)
	if err != nil {
		return a.helpOr("objectives", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot objectives [--quarter|--week] [--period <p>]")
	}
	cur := a.currentPeriods()
	periods := []string{cur["this-quarter"], cur["this-week"]}
	switch {
	case *period != "":
		if p, ok := sector.Parse(*period); !ok || p.Kind == sector.Month {
			return usageErr("--period: a quarter YYYY-Qn or an ISO week YYYY-Www")
		}
		periods = []string{*period}
	case *quarter && !*week:
		periods = periods[:1]
	case *week && !*quarter:
		periods = periods[1:]
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	var rows []objectiveRow
	for _, p := range periods {
		list, err := s.objectives(ctx, "?period="+url.QueryEscape(p))
		if err != nil {
			return err
		}
		sort.SliceStable(list, func(i, j int) bool { return list[i].Position < list[j].Position })
		rows = append(rows, list...)
	}
	if g.json {
		out := make([]json.RawMessage, len(rows))
		for i, r := range rows {
			out[i] = r.Raw
		}
		return a.printJSON(out)
	}
	if len(rows) == 0 {
		fmt.Fprintf(a.Stdout, "No objectives for %s.\n", strings.Join(periods, " or "))
		return nil
	}
	tbl := newTable("ID", "PERIOD", "DONE", "TITLE")
	for _, r := range rows {
		done := ""
		if r.DoneAt != 0 {
			done = "done"
		}
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(r.Period), plain(done), plain(r.Title))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func objectivesAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("objectives add", g)
	quarter := fs.Bool("quarter", false, "a quarterly objective")
	week := fs.Bool("week", false, "a weekly objective")
	next := fs.Bool("next", false, "for next quarter or next week")
	pos, err := a.parse(g, fs, "objectives add", args)
	if err != nil {
		return a.helpOr("objectives", err)
	}
	title := strings.TrimSpace(strings.Join(pos, " "))
	if title == "" || *quarter == *week {
		return usageErr(`usage: ot objectives add <title> --quarter|--week [--next]`)
	}
	word := "this-"
	if *next {
		word = "next-"
	}
	if *quarter {
		word += "quarter"
	} else {
		word += "week"
	}
	period := a.currentPeriods()[word]
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if err := s.requireKey(); err != nil {
		return err
	}
	sendTitle := title
	if s.encrypted {
		// The server chooses a created objective's id, and a sealed value names
		// its id: create it with a title sealed for no id, then seal it again.
		if sendTitle, err = s.seal("objective", "new", "title", title); err != nil {
			return err
		}
	}
	raw, _, err := s.c.do(ctx, http.MethodPost, "/objectives", map[string]any{"title": sendTitle, "period": period}, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	o := s.objectiveFrom(raw)
	if s.encrypted {
		sealed, err := s.seal("objective", o.ID, "title", title)
		if err != nil {
			return err
		}
		if raw, _, err = s.c.do(ctx, http.MethodPatch, "/objectives/"+url.PathEscape(o.ID), map[string]any{"title": sealed}, nil); err != nil {
			return err
		}
		o = s.objectiveFrom(raw)
	}
	if g.json {
		return a.printJSON(o.Raw)
	}
	fmt.Fprintln(a.Stdout, o.ID)
	return nil
}

// resolveObjective finds an objective by id or unique id prefix.
func (s *noteSession) resolveObjective(ctx context.Context, ref string) (*objectiveRow, error) {
	rows, err := s.objectives(ctx, "")
	if err != nil {
		return nil, err
	}
	var hit *objectiveRow
	for i := range rows {
		if rows[i].ID == ref {
			return &rows[i], nil
		}
		if strings.HasPrefix(rows[i].ID, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one objective; use more of its id", ref)
			}
			hit = &rows[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no objective %q (see `ot objectives`)", ref)
	}
	return hit, nil
}

func (a *App) objectivePatch(ctx context.Context, g *globalFlags, s *noteSession, o *objectiveRow, patch map[string]any, verb string) error {
	a.target(o.ID, o.ID, o.Title, verb)
	raw, _, err := s.c.do(ctx, http.MethodPatch, "/objectives/"+url.PathEscape(o.ID), patch, nil)
	if err != nil || a.dryRun() {
		return err
	}
	out := s.objectiveFrom(raw)
	if g.json {
		return a.printJSON(out.Raw)
	}
	fmt.Fprintf(a.Stdout, "%s  %s  %s\n", verb, shortID(out.ID), out.Title)
	return nil
}

func objectivesDone(a *App, ctx context.Context, g *globalFlags, args []string, verb string) error {
	fs := a.flagSet("objectives "+verb, g)
	pos, err := a.parse(g, fs, "objectives "+verb, args)
	if err != nil {
		return a.helpOr("objectives", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot objectives %s <id>", verb)
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	o, err := s.resolveObjective(ctx, pos[0])
	if err != nil {
		return err
	}
	at := int64(0)
	if verb == "done" {
		at = a.Now().UnixMilli()
	}
	return a.objectivePatch(ctx, g, s, o, map[string]any{"done_at": at}, verb)
}

func objectivesEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("objectives edit", g)
	title := fs.String("title", "", "the new title")
	pos, err := a.parse(g, fs, "objectives edit", args)
	if err != nil {
		return a.helpOr("objectives", err)
	}
	if len(pos) != 1 || strings.TrimSpace(*title) == "" {
		return usageErr("usage: ot objectives edit <id> --title <t>")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	o, err := s.resolveObjective(ctx, pos[0])
	if err != nil {
		return err
	}
	sealed, err := s.seal("objective", o.ID, "title", strings.TrimSpace(*title))
	if err != nil {
		return err
	}
	return a.objectivePatch(ctx, g, s, o, map[string]any{"title": sealed}, "edited")
}

func objectivesDelete(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("objectives delete", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	pos, err := a.parse(g, fs, "objectives delete", args)
	if err != nil {
		return a.helpOr("objectives", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot objectives delete <id> [--yes]")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	o, err := s.resolveObjective(ctx, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], o.ID, o.Title, "deleted")
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete objective %q?", o.Title))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := s.c.delete(ctx, "/objectives/"+o.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(o.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(o.ID), o.Title)
	return nil
}
