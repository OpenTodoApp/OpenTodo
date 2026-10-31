package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// `ot task split <ref> --from <date> [--time] [--rule] [--title]` (OpenSpec
// change series-split, design D8): change a recurring task from one of its
// later occurrences on through POST /api/v1/tasks/{id}/split. The series ends
// the day before; the answer is the new series that continues it, as a task.

func taskSplit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("task split", g)
	from := fs.String("from", "", "the first occurrence to change: YYYY-MM-DD, today, tomorrow or a weekday")
	at := fs.String("time", "", "the new time HH:MM from that day on (none: no time)")
	rule := fs.String("rule", "", "the new recurrence rule from that day on")
	title := fs.String("title", "", "the new title from that day on")
	pos, err := a.parse(g, fs, "task split", args)
	if err != nil {
		return a.helpOr("task", err)
	}
	if len(pos) == 0 || *from == "" {
		return usageErr("usage: ot task split <ref> --from <date> [--time HH:MM] [--rule <rule>] [--title <text>]")
	}
	d, err := dayOf(*from, a.Now())
	if err != nil {
		return usageErr("invalid --from %q: use YYYY-MM-DD, today, tomorrow or a weekday name", *from)
	}
	date := localDate(d)
	set := visited(fs)
	changes := map[string]any{}
	if set["title"] {
		if strings.TrimSpace(*title) == "" {
			return usageErr("--title cannot be empty")
		}
		changes["title"] = *title
	}
	if set["rule"] {
		if strings.TrimSpace(*rule) == "" {
			return usageErr("--rule cannot be empty")
		}
		changes["recurrence"] = *rule
	}
	if set["time"] {
		due := map[string]any{"date": date}
		if !strings.EqualFold(*at, "none") && *at != "" {
			if err := validClock(*at); err != nil {
				return err
			}
			due["time"] = *at
		}
		changes["due"] = due
	}
	if len(changes) == 0 {
		return usageErr("nothing to change; pass --time, --rule or --title")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	ref := strings.Join(pos, " ")
	t, err := taskOf(ctx, c, ref)
	if err != nil {
		return err
	}
	a.target(ref, t.ID, t.Title, "split")
	var raw json.RawMessage
	if err := c.postJSON(ctx, "/tasks/"+url.PathEscape(t.ID)+"/split", map[string]any{"from": date, "changes": changes}, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var piece struct {
		ID         string `json:"id"`
		Title      string `json:"title"`
		Recurrence string `json:"recurrence"`
	}
	if err := json.Unmarshal(raw, &piece); err != nil {
		return fmt.Errorf("read the new series: %w", err)
	}
	fmt.Fprintf(a.Stdout, "split  %s  %s from %s, %s\n", shortID(piece.ID), piece.Title, date, piece.Recurrence)
	return nil
}
