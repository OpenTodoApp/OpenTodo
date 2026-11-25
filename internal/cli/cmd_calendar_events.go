package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Calendar event commands (OpenSpec change calendar-event-edits, design D8):
// list the events the calendar view shows, and move, rename or delete one of
// a connected calendar through the event routes. Changing needs a full token;
// the write gate refuses read and agent tokens before anything is sent.

const calendarUsage = "ot calendar [events] [--from <day>] [--to <day>]\not calendar event edit <id> [--title <text>] [--start DATE[THH:MM]] [--end DATE[THH:MM]] [--all-day] [--on <day>]\not calendar event delete <id> [--on <day>] [--yes]"

type eventTime struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

type eventRow struct {
	ID             string    `json:"id"`
	SubscriptionID string    `json:"subscriptionId"`
	Summary        string    `json:"summary"`
	Start          eventTime `json:"start"`
	End            eventTime `json:"end"`
	AllDay         bool      `json:"allDay"`
	Rev            string    `json:"rev"`
	Access         *struct {
		Update bool   `json:"update"`
		Delete bool   `json:"delete"`
		Reason string `json:"reason"`
	} `json:"access"`
	Raw json.RawMessage `json:"-"`
}

type eventPage struct {
	Events        []eventRow
	Subscriptions []struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		ConnectionID string `json:"connectionId"`
	}
}

func cmdCalendar(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return calendarEvents(a, ctx, g, args)
	}
	switch args[0] {
	case "events":
		return calendarEvents(a, ctx, g, args[1:])
	case "event":
		if len(args) > 1 && args[1] == "edit" {
			return calendarEventEdit(a, ctx, g, args[2:])
		}
		if len(args) > 1 && (args[1] == "delete" || args[1] == "rm") {
			return calendarEventDelete(a, ctx, g, args[2:])
		}
		return usageErr("usage: ot calendar event edit|delete <id>")
	}
	return usageErr("unknown calendar command %q (expected events or event)", args[0])
}

func (c *client) events(ctx context.Context, from, to string) (*eventPage, error) {
	raw, _, err := c.do(ctx, http.MethodGet, "/calendar-feeds/events?from="+url.QueryEscape(from)+"&to="+url.QueryEscape(to), nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Events        []json.RawMessage `json:"events"`
		Subscriptions json.RawMessage   `json:"subscriptions"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode events: %w", err)
	}
	out := &eventPage{Events: make([]eventRow, len(page.Events))}
	for i, r := range page.Events {
		_ = json.Unmarshal(r, &out.Events[i])
		out.Events[i].Raw = r
	}
	_ = json.Unmarshal(page.Subscriptions, &out.Subscriptions)
	return out, nil
}

func (p *eventPage) calendar(subID string) (name, conn string) {
	for _, s := range p.Subscriptions {
		if s.ID == subID {
			return s.Name, s.ConnectionID
		}
	}
	return "", ""
}

func calendarEvents(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("calendar events", g)
	fromFlag := fs.String("from", "today", "first day")
	toFlag := fs.String("to", "", "last day (default: six days after --from)")
	pos, err := a.parse(g, fs, "calendar events", args)
	if err != nil {
		return a.helpOr("calendar", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: %s", strings.Split(calendarUsage, "\n")[0])
	}
	from, err := resolveDate(*fromFlag, a.Now())
	if err != nil {
		return err
	}
	to := addDays(from, 6)
	if *toFlag != "" {
		if to, err = resolveDate(*toFlag, a.Now()); err != nil {
			return err
		}
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	page, err := c.events(ctx, from, to)
	if err != nil {
		return err
	}
	if g.json {
		list := make([]json.RawMessage, len(page.Events))
		for i, e := range page.Events {
			list[i] = e.Raw
		}
		return a.printJSON(list)
	}
	if len(page.Events) == 0 {
		fmt.Fprintln(a.Stdout, "No events.")
		return nil
	}
	tbl := newTable("ID", "DATE", "TIME", "TITLE", "CALENDAR", "ACCESS")
	for _, e := range page.Events {
		name, _ := page.calendar(e.SubscriptionID)
		tbl.add(cell{text: shortID(e.ID), style: styleCyan}, plain(e.Start.Date), plain(eventClock(e)), plain(e.Summary), plain(name), plain(accessLabel(e)))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func eventClock(e eventRow) string {
	if e.AllDay || e.Start.Time == nil {
		return "all day"
	}
	s := *e.Start.Time
	if e.End.Time != nil {
		s += "-" + *e.End.Time
	}
	if e.Start.TZ != nil {
		s += " " + zoneCity(*e.Start.TZ)
	}
	return s
}

func accessLabel(e eventRow) string {
	switch {
	case e.Access == nil:
		return "read-only"
	case e.Access.Update:
		return "editable"
	}
	return e.Access.Reason
}

func addDays(day string, n int) string {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return day
	}
	return t.AddDate(0, 0, n).Format(time.DateOnly)
}

// findEvent finds an event by id or unique id prefix within 45 days of on.
func (a *App) findEvent(ctx context.Context, c *client, on, ref string) (*eventRow, string, error) {
	day, err := resolveDate(on, a.Now())
	if err != nil {
		return nil, "", err
	}
	page, err := c.events(ctx, addDays(day, -45), addDays(day, 45))
	if err != nil {
		return nil, "", err
	}
	var hit *eventRow
	for i := range page.Events {
		e := &page.Events[i]
		if e.ID == ref || strings.HasPrefix(e.ID, ref) {
			if hit != nil && hit.ID != e.ID {
				return nil, "", usageErr("%q matches more than one event; use more of its id", ref)
			}
			hit = e
		}
	}
	if hit == nil {
		return nil, "", usageErr("no event %q within 45 days of %s (see `ot calendar`, or pass --on <day>)", ref, day)
	}
	_, conn := page.calendar(hit.SubscriptionID)
	if conn == "" || hit.Access == nil {
		return nil, "", &exitError{code: ExitNotPermitted, jsonCode: "event_not_editable", msg: "this event is in a subscribed calendar, which cannot be changed"}
	}
	return hit, conn, nil
}

// pointArg reads DATE or DATETHH:MM; ok is false for an empty value.
func pointArg(name, v string, now time.Time) (date string, clock *string, err error) {
	if v == "" {
		return "", nil, nil
	}
	d, t, hasTime := strings.Cut(v, "T")
	if date, err = resolveDate(d, now); err != nil {
		return "", nil, usageErr("--%s: %v", name, err)
	}
	if hasTime {
		if err := validClock(t); err != nil {
			return "", nil, usageErr("--%s: %v", name, err)
		}
		clock = &t
	}
	return date, clock, nil
}

// wall is a point as a wall time in its own zone (UTC for floating ones).
func wall(p eventTime) time.Time {
	clock := "00:00"
	if p.Time != nil {
		clock = *p.Time
	}
	t, _ := time.Parse("2006-01-02 15:04", p.Date+" "+clock)
	return t
}

func calendarEventEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("calendar event edit", g)
	title := fs.String("title", "", "new title")
	startFlag := fs.String("start", "", "new start: DATE or DATETHH:MM")
	endFlag := fs.String("end", "", "new end: DATE or DATETHH:MM")
	allDay := fs.Bool("all-day", false, "make it an all-day event")
	on := fs.String("on", "today", "a day near the event")
	pos, err := a.parse(g, fs, "calendar event edit", args)
	if err != nil {
		return a.helpOr("calendar", err)
	}
	if len(pos) != 1 || (*title == "" && *startFlag == "" && *endFlag == "" && !*allDay) {
		return usageErr("usage: %s", strings.Split(calendarUsage, "\n")[1])
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	ev, conn, err := a.findEvent(ctx, c, *on, pos[0])
	if err != nil {
		return err
	}
	body := map[string]any{"rev": ev.Rev}
	if *title != "" {
		body["summary"] = *title
	}
	if *startFlag != "" || *endFlag != "" || *allDay {
		start, end, err := a.newTimes(ev, *startFlag, *endFlag, *allDay)
		if err != nil {
			return err
		}
		body["start"], body["end"], body["allDay"] = start, end, *allDay || (ev.AllDay && start.Time == nil)
	}
	raw, _, err := c.do(ctx, http.MethodPatch, "/calendar-sync/connections/"+conn+"/events/"+ev.ID, body, nil)
	if err != nil || a.dryRun() {
		return err
	}
	var out struct {
		Event json.RawMessage `json:"event"`
	}
	_ = json.Unmarshal(raw, &out)
	if g.json {
		return a.printJSON(out.Event)
	}
	var moved eventRow
	_ = json.Unmarshal(out.Event, &moved)
	fmt.Fprintf(a.Stdout, "changed  %s  %s  %s %s\n", shortID(moved.ID), moved.Summary, moved.Start.Date, eventClock(moved))
	return nil
}

// newTimes is the new start and end: a start alone keeps the length, a date
// alone keeps the clock time, and a timed event keeps its zone.
func (a *App) newTimes(ev *eventRow, startArg, endArg string, allDay bool) (eventTime, eventTime, error) {
	sd, sc, err := pointArg("start", startArg, a.Now())
	if err != nil {
		return eventTime{}, eventTime{}, err
	}
	ed, ec, err := pointArg("end", endArg, a.Now())
	if err != nil {
		return eventTime{}, eventTime{}, err
	}
	start, end := ev.Start, ev.End
	length := wall(ev.End).Sub(wall(ev.Start))
	if sd != "" {
		start.Date = sd
		if sc != nil {
			start.Time = sc
		}
	}
	if ed != "" {
		end.Date = ed
		if ec != nil {
			end.Time = ec
		}
	} else {
		w := wall(start).Add(length)
		end.Date = w.Format(time.DateOnly)
		if start.Time != nil {
			c := w.Format("15:04")
			end.Time = &c
		}
	}
	if allDay {
		start, end = eventTime{Date: start.Date}, eventTime{Date: end.Date}
		if end.Date <= start.Date {
			end.Date = addDays(start.Date, 1)
		}
	} else if start.Time != nil && start.TZ == nil {
		end.TZ = nil
	}
	return start, end, nil
}

func calendarEventDelete(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("calendar event delete", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	on := fs.String("on", "today", "a day near the event")
	pos, err := a.parse(g, fs, "calendar event delete", args)
	if err != nil {
		return a.helpOr("calendar", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: %s", strings.Split(calendarUsage, "\n")[2])
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	ev, conn, err := a.findEvent(ctx, c, *on, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], ev.ID, ev.Summary, "deleted")
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete %q from your calendar?", ev.Summary))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := c.delete(ctx, "/calendar-sync/connections/"+conn+"/events/"+ev.ID+"?rev="+url.QueryEscape(ev.Rev)); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(ev.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(ev.ID), ev.Summary)
	return nil
}
