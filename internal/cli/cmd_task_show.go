package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// `ot task show <ref>` (OpenSpec change location-reminders, task 1.5): a task's
// details and its reminders, location reminders included ("When I arrive at
// Post office (150 m)"). It only reads: GET /api/v1/tasks, /reminders and,
// for a location linked to a saved place without a name, /places.

type taskReminder struct {
	ID            string   `json:"id"`
	TaskID        string   `json:"task_id"`
	Kind          string   `json:"kind"`
	OffsetMinutes *int     `json:"offset_minutes"`
	FireAt        *float64 `json:"fire_at"`
	RadiusM       *int     `json:"radius_m"`
	DismissedAt   *float64 `json:"dismissed_at"`
	DeletedAt     *float64 `json:"deleted_at"`
}

type taskLocation struct {
	Name    string   `json:"name"`
	Address string   `json:"address"`
	Lat     *float64 `json:"lat"`
	Lon     *float64 `json:"lon"`
	PlaceID string   `json:"place_id"`
}

func taskShow(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("task show", g)
	pos, err := a.parse(g, fs, "task show", args)
	if err != nil {
		return a.helpOr("task", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot task show <ref>")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	t, err := taskOf(ctx, c, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	var out struct {
		Reminders []json.RawMessage `json:"reminders"`
	}
	if err := c.getJSON(ctx, "/reminders", &out); err != nil {
		return err
	}
	raws, rems := []json.RawMessage{}, []taskReminder{}
	for _, raw := range out.Reminders {
		var r taskReminder
		if json.Unmarshal(raw, &r) != nil || r.TaskID != t.ID || r.DeletedAt != nil {
			continue
		}
		raws, rems = append(raws, raw), append(rems, r)
	}
	if g.json {
		return a.printJSON(map[string]any{"task": t.Raw, "reminders": raws})
	}
	place := ""
	var loc taskLocation
	if json.Unmarshal(t.Location, &loc) == nil {
		place = firstNonEmpty(loc.Name, loc.Address)
		if place == "" && loc.PlaceID != "" {
			place = c.placeName(ctx, loc.PlaceID)
		}
	} else if len(t.Location) > 0 && string(t.Location) != "null" {
		place = "(encrypted)"
	}
	fmt.Fprintf(a.Stdout, "%s  %s\n", shortID(t.ID), t.Title)
	if t.Due != nil {
		d := t.Due.Date
		if t.Due.Time != nil {
			d += " " + *t.Due.Time
		}
		fmt.Fprintf(a.Stdout, "Due:       %s\n", d)
	}
	if t.Deadline != nil {
		fmt.Fprintf(a.Stdout, "Deadline:  %s\n", *t.Deadline)
	}
	if place != "" {
		fmt.Fprintf(a.Stdout, "Location:  %s\n", place)
	}
	if len(rems) == 0 {
		return nil
	}
	sort.SliceStable(rems, func(i, j int) bool { return rems[i].ID < rems[j].ID })
	fmt.Fprintln(a.Stdout, "Reminders:")
	for _, r := range rems {
		line := reminderLine(r, place, a.Now().Location())
		if r.DismissedAt != nil && (r.Kind == "arrive" || r.Kind == "leave") {
			line += ", dismissed"
		}
		fmt.Fprintf(a.Stdout, "  %s\n", line)
	}
	return nil
}

// reminderLine describes one reminder in a sentence.
func reminderLine(r taskReminder, place string, loc *time.Location) string {
	switch r.Kind {
	case "arrive", "leave":
		verb := "When I arrive at"
		if r.Kind == "leave" {
			verb = "When I leave"
		}
		if place == "" {
			place = "the task's location"
		}
		radius := 150
		if r.RadiusM != nil {
			radius = *r.RadiusM
		}
		return fmt.Sprintf("%s %s (%d m)", verb, place, radius)
	case "absolute":
		if r.FireAt == nil {
			return "At a time not set"
		}
		return "At " + time.UnixMilli(int64(*r.FireAt)).In(loc).Format("2006-01-02 15:04")
	}
	anchor := "the due time"
	if r.Kind == "deadline" {
		anchor = "09:00 on the deadline"
	}
	off := 0
	if r.OffsetMinutes != nil {
		off = *r.OffsetMinutes
	}
	if off == 0 {
		return "At " + anchor
	}
	dir := "before"
	if off > 0 {
		dir = "after"
	} else {
		off = -off
	}
	return fmt.Sprintf("%s %s %s", minutesText(off), dir, anchor)
}

func minutesText(m int) string {
	switch {
	case m%1440 == 0:
		return plural(m/1440, "day")
	case m%60 == 0:
		return plural(m/60, "hour")
	}
	return plural(m, "minute")
}

func plural(n int, unit string) string {
	if n == 1 {
		return "1 " + unit
	}
	return fmt.Sprintf("%d %ss", n, unit)
}

func firstNonEmpty(s ...string) string {
	for _, v := range s {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// placeName is a saved place's name, "" when it is unknown or unreadable.
func (c *client) placeName(ctx context.Context, id string) string {
	var out struct {
		Places []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"places"`
	}
	if c.getJSON(ctx, "/places", &out) != nil {
		return ""
	}
	for _, p := range out.Places {
		if p.ID == id && !e2ee.IsCiphertext(p.Name) {
			return p.Name
		}
	}
	return ""
}
