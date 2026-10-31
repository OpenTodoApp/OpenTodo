package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// `ot task occurrences <ref>` (OpenSpec change series-occurrences, design D7):
// a recurring task's current and projected occurrence dates in a range, from
// GET /api/v1/tasks/{id}/occurrences, as a table (date, time, state) or with
// --json as the route answers it. It only reads.

type occurrenceList struct {
	SeriesID    string `json:"series_id"`
	Rule        string `json:"rule"`
	Capped      bool   `json:"capped"`
	Occurrences []struct {
		Date  string `json:"date"`
		Time  string `json:"time"`
		TZ    string `json:"tz"`
		State string `json:"state"`
	} `json:"occurrences"`
}

func taskOccurrences(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("task occurrences", g)
	from := fs.String("from", "", "first day: YYYY-MM-DD, today, yesterday or a weekday (default today)")
	to := fs.String("to", "", "last day (default 30 days after --from)")
	pos, err := a.parse(g, fs, "task occurrences", args)
	if err != nil {
		return a.helpOr("task", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot task occurrences <ref> [--from <day>] [--to <day>]")
	}
	q, err := a.rangeQuery(*from, *to)
	if err != nil {
		return err
	}
	q.Del("tz") // the route answers in floating dates
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	t, err := taskOf(ctx, c, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	path := "/tasks/" + url.PathEscape(t.ID) + "/occurrences"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var raw json.RawMessage
	if err := c.getJSON(ctx, path, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var list occurrenceList
	if err := json.Unmarshal(raw, &list); err != nil {
		return fmt.Errorf("read occurrences: %w", err)
	}
	if len(list.Occurrences) == 0 {
		fmt.Fprintf(a.Stdout, "No occurrences of %q in the range.\n", list.Rule)
		return nil
	}
	tbl := newTable("DATE", "TIME", "STATE")
	for _, o := range list.Occurrences {
		at := o.Time
		if at != "" && o.TZ != "" {
			at += " " + o.TZ
		}
		style := styleNone
		if o.State == "current" {
			style = styleBold
		}
		tbl.add(cell{text: o.Date, style: style}, plain(at), plain(o.State))
	}
	tbl.render(a.Stdout, a.color())
	if list.Capped {
		fmt.Fprintln(a.Stdout, "Showing the first 31 projected occurrences; narrow the range for the rest.")
	}
	return nil
}
