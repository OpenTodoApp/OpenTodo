package cli

import (
	"context"
	"encoding/json"
	"fmt"
)

// `ot away <from> <to>` and `ot away --end` (OpenSpec change away-periods,
// design D5): set an away period through POST /api/v1/away, which skips the
// repeating tasks' occurrences in it and pauses reminders unless
// --keep-reminders, or end it through DELETE /api/v1/away.

const awayUsage = "ot away <from> <to> [--project <ref>]... [--label <ref>]... [--keep-reminders]\not away --end"

func cmdAway(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("away", g)
	var projects, labels stringList
	fs.Var(&projects, "project", "only repeating tasks in this project (repeatable)")
	fs.Var(&labels, "label", "only repeating tasks with this label (repeatable)")
	keep := fs.Bool("keep-reminders", false, "keep reminders and the digest during the period")
	end := fs.Bool("end", false, "end the away period now; its skips stay")
	pos, err := a.parse(g, fs, "away", args)
	if err != nil {
		return a.helpOr("away", err)
	}
	if *end {
		if len(pos) > 0 || len(projects) > 0 || len(labels) > 0 || *keep {
			return usageErr("usage: %s", awayUsage)
		}
		c, _, err := a.connect(g)
		if err != nil {
			return err
		}
		a.target("away", "", "", "end")
		if err := c.delete(ctx, "/away"); err != nil {
			return err
		}
		if g.json {
			return a.printJSON(json.RawMessage(`{"away":""}`))
		}
		fmt.Fprintln(a.Stdout, "away ended")
		return nil
	}
	if len(pos) != 2 {
		return usageErr("usage: %s", awayUsage)
	}
	var days [2]string
	for i, s := range pos {
		d, err := dayOf(s, a.Now())
		if err != nil {
			return usageErr("invalid date %q: use YYYY-MM-DD, today, tomorrow or a weekday name", s)
		}
		days[i] = localDate(d)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	body := map[string]any{"from": days[0], "to": days[1], "pauseReminders": !*keep}
	if len(projects) > 0 {
		ps, err := c.projects(ctx)
		if err != nil {
			return err
		}
		var ids []string
		for _, ref := range projects {
			p, err := findProject(ps, ref)
			if err != nil {
				return err
			}
			ids = append(ids, p.ID)
		}
		body["projects"] = ids
	}
	if len(labels) > 0 {
		ls, err := c.labels(ctx)
		if err != nil {
			return err
		}
		var ids []string
		for _, ref := range labels {
			id, ok := findLabel(ls, ref)
			if !ok {
				return usageErr("no label %q", ref)
			}
			ids = append(ids, id)
		}
		body["labels"] = ids
	}
	a.target("away", "", days[0]+".."+days[1], "set")
	var raw json.RawMessage
	if err := c.postJSON(ctx, "/away", body, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var out struct {
		Away    string `json:"away"`
		Skipped int    `json:"skipped"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return fmt.Errorf("read the answer: %w", err)
	}
	fmt.Fprintf(a.Stdout, "away %s to %s, %d occurrences skipped\n", days[0], days[1], out.Skipped)
	return nil
}
