package cli

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/quickadd"
	"github.com/pixari/opentodo/internal/timetrack"
)

// Time commands (OpenSpec change `time-tracking`, design D11): start, stop,
// log, list and export time entries through /api/v1/time-entries. start, stop
// and log write (read-only mode and token scope apply, --dry-run prints the
// request); list and export read and work with a read token.

// timeEntry is an entry as the REST API returns it.
type timeEntry struct {
	ID          string  `json:"id"`
	TaskID      string  `json:"taskId"`
	UserID      string  `json:"userId"`
	StartedAt   int64   `json:"startedAt"`
	EndedAt     *int64  `json:"endedAt"`
	Minutes     int     `json:"minutes"`
	Note        string  `json:"note"`
	TaskTitle   string  `json:"taskTitle"`
	ProjectName string  `json:"projectName"`
	ProjectID   *string `json:"projectId"`
}

// durationForms names the accepted durations in usage errors.
const durationForms = "use a duration such as 45m, 1h30 or 90 (minutes)"

func cmdTime(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot time start|stop|log|list|export ...")
	}
	sub, rest := args[0], args[1:]
	switch sub {
	case "start":
		return timeStart(a, ctx, g, rest)
	case "stop":
		return timeStop(a, ctx, g, rest)
	case "log":
		return timeLog(a, ctx, g, rest)
	case "list", "ls":
		return timeList(a, ctx, g, rest)
	case "export":
		return timeExport(a, ctx, g, rest)
	}
	return usageErr("unknown time command %q (expected start, stop, log, list or export)", sub)
}

// taskOf resolves a task reference through the task list.
func taskOf(ctx context.Context, c *client, ref string) (*task, error) {
	all, err := c.tasks(ctx)
	if err != nil {
		return nil, err
	}
	return resolveTask(all, ref)
}

func (a *App) printEntry(g *globalFlags, raw []byte, verb string) error {
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var e timeEntry
	_ = json.Unmarshal(raw, &e)
	fmt.Fprintf(a.Stdout, "%s %s  %s  %s\n", verb, shortID(e.ID), formatMinutes(e.Minutes), timetrack.Display(e.TaskTitle))
	return nil
}

func timeStart(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("time start", g)
	note := fs.String("note", "", "note on the entry")
	pos, err := a.parse(g, fs, "time start", args)
	if err != nil {
		return a.helpOr("time", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot time start <ref> [--note <text>]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	t, err := taskOf(ctx, c, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], t.ID, t.Title, "")
	body := map[string]any{"taskId": t.ID}
	if *note != "" {
		body["note"] = *note
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/time-entries", body, nil)
	if err != nil {
		return err
	}
	return a.printEntry(g, raw, "Started")
}

func timeStop(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("time stop", g)
	pos, err := a.parse(g, fs, "time stop", args)
	if err != nil {
		return a.helpOr("time", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot time stop")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/time-entries/stop", nil, nil)
	if err != nil {
		return err
	}
	return a.printEntry(g, raw, "Stopped")
}

// dayOf reads --on: today, yesterday, a weekday (the latest one, today
// included) or YYYY-MM-DD; the result is midnight of that local day.
func dayOf(word string, now time.Time) (time.Time, error) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	w := strings.ToLower(strings.TrimSpace(word))
	switch w {
	case "", "today":
		return today, nil
	case "yesterday":
		return today.AddDate(0, 0, -1), nil
	}
	if wd, ok := weekdays[w]; ok {
		return today.AddDate(0, 0, -((int(today.Weekday()) - int(wd) + 7) % 7)), nil
	}
	if t, err := time.ParseInLocation("2006-01-02", w, now.Location()); err == nil && localDate(t) == w {
		return t, nil
	}
	return time.Time{}, usageErr("invalid --on %q: use YYYY-MM-DD, today, yesterday or a weekday name", word)
}

// clockOn is HH:MM on a local day.
func clockOn(day time.Time, flagName, s string) (time.Time, error) {
	var h, m int
	if len(s) != 5 || s[2] != ':' {
		return time.Time{}, usageErr("invalid --%s %q: use HH:MM (24-hour)", flagName, s)
	}
	if _, err := fmt.Sscanf(s, "%02d:%02d", &h, &m); err != nil || h > 23 || m > 59 {
		return time.Time{}, usageErr("invalid --%s %q: use HH:MM (24-hour)", flagName, s)
	}
	return time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, day.Location()), nil
}

// logRange is the start and end `ot time log` sends: --from/--to on the day,
// or a duration ending now (today) or at 17:00 on another day.
func logRange(pos []string, on, from, to string, now time.Time) (time.Time, time.Time, error) {
	day, err := dayOf(on, now)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if from != "" || to != "" {
		if len(pos) != 1 || from == "" || to == "" {
			return time.Time{}, time.Time{}, usageErr("usage: ot time log <ref> --from HH:MM --to HH:MM [--on <day>], or ot time log <ref> <duration>")
		}
		start, err := clockOn(day, "from", from)
		if err != nil {
			return start, start, err
		}
		end, err := clockOn(day, "to", to)
		if err != nil {
			return start, end, err
		}
		if end.Before(start) {
			return start, end, usageErr("--to %s is before --from %s; nothing was sent", to, from)
		}
		return start, end, nil
	}
	if len(pos) != 2 {
		return time.Time{}, time.Time{}, usageErr("usage: ot time log <ref> <duration> [--on <day>] [--note <text>]; %s", durationForms)
	}
	mins, ok := timetrack.ParseDuration(pos[1])
	if !ok || mins < 1 {
		return time.Time{}, time.Time{}, usageErr("invalid duration %q: %s", pos[1], durationForms)
	}
	end := now
	if localDate(day) != localDate(now) {
		// Every duration-only entry on another day ends at 17:00 local time.
		end = time.Date(day.Year(), day.Month(), day.Day(), 17, 0, 0, 0, day.Location())
	}
	return end.Add(-time.Duration(mins) * time.Minute), end, nil
}

func timeLog(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("time log", g)
	on := fs.String("on", "", "the day: YYYY-MM-DD, today, yesterday or a weekday (default today)")
	from := fs.String("from", "", "start time HH:MM")
	to := fs.String("to", "", "end time HH:MM")
	note := fs.String("note", "", "note on the entry")
	pos, err := a.parse(g, fs, "time log", args)
	if err != nil {
		return a.helpOr("time", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot time log <ref> <duration> [--on <day>] [--note <text>]; %s", durationForms)
	}
	start, end, err := logRange(pos, *on, *from, *to, a.Now())
	if err != nil {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	t, err := taskOf(ctx, c, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], t.ID, t.Title, "")
	body := map[string]any{"taskId": t.ID, "startedAt": start.UnixMilli(), "endedAt": end.UnixMilli()}
	if *note != "" {
		body["note"] = *note
	}
	raw, _, err := c.do(ctx, http.MethodPost, "/time-entries", body, nil)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var e timeEntry
	_ = json.Unmarshal(raw, &e)
	fmt.Fprintln(a.Stdout, e.ID)
	return nil
}

// localZone is the IANA name of the local time zone for the server's tz
// parameter: the clock's zone, TZ, or /etc/localtime; UTC when unknown.
func (a *App) localZone() string {
	if n := a.Now().Location().String(); n != "" && n != "Local" {
		return n
	}
	if tz := strings.TrimPrefix(a.Getenv("TZ"), ":"); tz != "" {
		if _, err := time.LoadLocation(tz); err == nil {
			return tz
		}
	}
	if p, err := filepath.EvalSymlinks("/etc/localtime"); err == nil {
		if _, name, ok := strings.Cut(p, "zoneinfo/"); ok {
			return name
		}
	}
	return "UTC"
}

// rangeQuery builds the query of list and export from --from and --to.
func (a *App) rangeQuery(from, to string) (url.Values, error) {
	q := url.Values{"tz": {a.localZone()}}
	for name, v := range map[string]string{"from": from, "to": to} {
		if v == "" {
			continue
		}
		d, err := dayOf(v, a.Now())
		if err != nil {
			return nil, usageErr("invalid --%s %q: use YYYY-MM-DD, today, yesterday or a weekday name", name, v)
		}
		q.Set(name, localDate(d))
	}
	return q, nil
}

func timeList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("time list", g)
	ref := fs.String("task", "", "entries of one task (id or prefix)")
	from := fs.String("from", "", "first local day")
	to := fs.String("to", "", "last local day")
	running := fs.Bool("running", false, "only the running entry")
	limit := fs.Int("limit", 0, "print at most n entries")
	if _, err := a.parse(g, fs, "time list", args); err != nil {
		return a.helpOr("time", err)
	}
	q, err := a.rangeQuery(*from, *to)
	if err != nil {
		return err
	}
	if *running {
		q.Set("running", "true")
	}
	if *limit > 0 {
		q.Set("limit", fmt.Sprint(min(*limit, 500)))
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	if *ref != "" {
		t, err := taskOf(ctx, c, *ref)
		if err != nil {
			return err
		}
		q.Set("task", t.ID)
	}
	var page struct {
		Entries []json.RawMessage `json:"entries"`
	}
	if err := c.getJSON(ctx, "/time-entries?"+q.Encode(), &page); err != nil {
		return err
	}
	if g.json {
		return a.printRawList(page.Entries)
	}
	if len(page.Entries) == 0 {
		fmt.Fprintln(a.Stdout, "No time entries.")
		return nil
	}
	loc := a.Now().Location()
	tbl := newTable("ID", "DAY", "TIME", "DURATION", "TASK", "PROJECT")
	for _, raw := range page.Entries {
		var e timeEntry
		_ = json.Unmarshal(raw, &e)
		start := time.UnixMilli(e.StartedAt).In(loc)
		span := start.Format("15:04") + "–"
		if e.EndedAt != nil {
			span += time.UnixMilli(*e.EndedAt).In(loc).Format("15:04")
		}
		tbl.add(cell{text: shortID(e.ID), style: styleCyan}, plain(localDate(start)), plain(span), plain(formatMinutes(e.Minutes)),
			plain(timetrack.Display(e.TaskTitle)), plain(timetrack.Display(e.ProjectName)))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func timeExport(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("time export", g)
	from := fs.String("from", "", "first local day")
	to := fs.String("to", "", "last local day")
	out := fs.String("out", "", "write to this file instead of stdout")
	fs.StringVar(out, "o", "", "write to this file instead of stdout")
	if _, err := a.parse(g, fs, "time export", args); err != nil {
		return a.helpOr("time", err)
	}
	q, err := a.rangeQuery(*from, *to)
	if err != nil {
		return err
	}
	q.Set("format", "csv")
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/time-entries?"+q.Encode(), nil, nil)
	if err != nil {
		return err
	}
	if *out == "" {
		_, err := a.Stdout.Write(raw)
		return err
	}
	if err := os.WriteFile(*out, raw, 0o600); err != nil {
		return usageErr("write %s: %v", *out, err)
	}
	rows := 0
	if recs, err := csv.NewReader(bytes.NewReader(raw)).ReadAll(); err == nil && len(recs) > 0 {
		rows = len(recs) - 1
	}
	if g.json {
		return a.printJSON(map[string]any{"file": *out, "bytes": len(raw), "rows": rows, "exportedAt": time.Now().UTC().Format(time.RFC3339)})
	}
	fmt.Fprintf(a.Stdout, "Wrote %d entries to %s\n", rows, *out)
	return nil
}

// formatMinutes is 25m, 1h or 1h 30m.
func formatMinutes(m int) string {
	switch {
	case m < 60:
		return fmt.Sprintf("%dm", m)
	case m%60 == 0:
		return fmt.Sprintf("%dh", m/60)
	}
	return fmt.Sprintf("%dh %dm", m/60, m%60)
}

// applyNatural reads a quick-add line into the task body (quick-add-recurrence
// D6); explicit flags win over what the line says. It returns the label
// references, the reminder phrases and the minutes already spent (`30m/2h`).
func (a *App) applyNatural(ctx context.Context, c *client, title string, langs []string, body map[string]any, set map[string]bool, f *taskFlags, phrases []quickadd.Reminder) ([]string, []quickadd.Reminder, int, error) {
	labelRefs := []string(f.labels)
	var projects []project
	if strings.Contains(title, "#") {
		var err error
		if projects, err = c.projects(ctx); err != nil {
			return nil, nil, 0, err
		}
	}
	r := quickadd.Parse(title, a.quickContext(langs, projects))
	if r.Title == "" {
		return nil, nil, 0, usageErr("--natural: the line has no title left after its attributes")
	}
	body["title"] = r.Title
	if r.Due != nil && body["due"] == nil {
		d := due{Date: r.Due.Date}
		if r.Due.Time != "" {
			d.Time = &r.Due.Time
		}
		body["due"] = d
	}
	if r.ProjectID != "" && f.project == "" {
		body["project_id"] = r.ProjectID
	}
	if len(labelRefs) == 0 {
		labelRefs = r.Labels
	}
	if r.Priority > 0 && !set["priority"] {
		body["priority"] = r.Priority
	}
	if r.EstimateMinutes > 0 {
		body["estimate_minutes"] = r.EstimateMinutes
	}
	if r.Recurrence != "" && !set["repeat"] {
		body["recurrence"] = r.Recurrence
	}
	if r.Deadline != "" {
		body["deadline"] = r.Deadline
	}
	if r.Someday {
		body["start"] = "someday"
	}
	if r.Evening {
		body["evening"] = true
	}
	return labelRefs, append(r.Reminders, phrases...), r.SpentMinutes, nil
}

// logSpent posts the closed entry of a `30m/2h` line after the task, ending
// now (time-tracking D10). With an idempotency key K it sends K.t, so a retry
// converges to one entry.
func (a *App) logSpent(ctx context.Context, c *client, taskID string, minutes int, keyed bool, key string) error {
	if minutes <= 0 {
		return nil
	}
	end := a.Now()
	body := map[string]any{"taskId": taskID, "startedAt": end.Add(-time.Duration(minutes) * time.Minute).UnixMilli(), "endedAt": end.UnixMilli()}
	var headers map[string]string
	if keyed {
		headers = map[string]string{"Idempotency-Key": key + ".t"}
	}
	if _, _, err := c.do(ctx, http.MethodPost, "/time-entries", body, headers); err != nil {
		var ee *exitError
		if errors.As(err, &ee) {
			return &exitError{code: ee.code, jsonCode: ee.jsonCode, envelope: ee.envelope,
				msg: fmt.Sprintf("%s (the task was created: %s; log the time with ot time log)", ee.msg, taskID)}
		}
		return fmt.Errorf("%w (the task was created: %s)", err, taskID)
	}
	return nil
}
