package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// `ot task occurrence <ref> <date> complete|skip|edit` (OpenSpec change
// series-exceptions, design D11): act on one occurrence of a recurring task
// through POST /api/v1/tasks/{id}/occurrences/{date}/complete and /skip and
// PATCH /api/v1/tasks/{id}/occurrences/{date}. The answer is the occurrence's
// record (the series when no record was written), as a task.

func taskOccurrence(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("task occurrence", g)
	due := fs.String("due", "", "edit: move the occurrence to this day (YYYY-MM-DD, today, tomorrow or a weekday)")
	at := fs.String("time", "", "edit: the occurrence's time HH:MM (none: no time)")
	title := fs.String("title", "", "edit: the occurrence's title")
	pos, err := a.parse(g, fs, "task occurrence", args)
	if err != nil {
		return a.helpOr("task", err)
	}
	usage := usageErr("usage: ot task occurrence <ref> <date> complete|skip|edit [--due <day>] [--time HH:MM] [--title <text>]")
	if len(pos) < 3 {
		return usage
	}
	action, day, ref := pos[len(pos)-1], pos[len(pos)-2], strings.Join(pos[:len(pos)-2], " ")
	d, err := dayOf(day, a.Now())
	if err != nil {
		return usageErr("invalid date %q: use YYYY-MM-DD, today, tomorrow or a weekday name", day)
	}
	date := localDate(d)
	set := visited(fs)
	body := map[string]any{}
	method, suffix := "POST", "/"+action
	switch action {
	case "complete", "skip":
		if set["due"] || set["time"] || set["title"] {
			return usageErr("--due, --time and --title belong to edit")
		}
	case "edit":
		method, suffix = "PATCH", ""
		if set["title"] {
			if strings.TrimSpace(*title) == "" {
				return usageErr("--title cannot be empty")
			}
			body["title"] = *title
		}
		if set["due"] || set["time"] {
			moved := map[string]any{"date": date}
			if set["due"] {
				nd, err := dayOf(*due, a.Now())
				if err != nil {
					return usageErr("invalid --due %q", *due)
				}
				moved["date"] = localDate(nd)
			}
			if set["time"] && !strings.EqualFold(*at, "none") && *at != "" {
				if err := validClock(*at); err != nil {
					return err
				}
				moved["time"] = *at
			}
			body["due"] = moved
		}
		if len(body) == 0 {
			return usageErr("nothing to change; pass --due, --time or --title")
		}
	default:
		return usage
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	t, err := taskOf(ctx, c, ref)
	if err != nil {
		return err
	}
	// A new day without --time keeps the series' time and zone.
	if moved, ok := body["due"].(map[string]any); ok && !set["time"] && t.Due != nil && t.Due.Time != nil {
		moved["time"] = *t.Due.Time
		if t.Due.TZ != nil {
			moved["tz"] = *t.Due.TZ
		}
	}
	a.target(ref, t.ID, t.Title, action)
	path := "/tasks/" + url.PathEscape(t.ID) + "/occurrences/" + date + suffix
	var raw json.RawMessage
	if method == "PATCH" {
		err = c.patchJSON(ctx, path, body, &raw)
	} else {
		err = c.postJSON(ctx, path, body, &raw)
	}
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var rec task
	if err := json.Unmarshal(raw, &rec); err != nil {
		return fmt.Errorf("read the occurrence: %w", err)
	}
	verb := map[string]string{"complete": "completed", "skip": "skipped", "edit": "updated"}[action]
	fmt.Fprintf(a.Stdout, "%s  %s  %s (%s)\n", verb, shortID(rec.ID), rec.Title, date)
	return nil
}
