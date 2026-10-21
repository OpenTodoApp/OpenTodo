package cli

import (
	"context"
	"flag"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/inbox"
)

// Planning fields on `ot add`, `ot edit` and `ot list` (OpenSpec change
// agent-planning-fields, design D6): --deadline, --start, --evening,
// --blocked-by and --location, and the Someday, Anytime and blocked filters.

type planningFlags struct {
	deadline, start, location string
	evening                   bool
	blockedBy                 stringList
}

func (f *planningFlags) bind(fs *flag.FlagSet) {
	fs.StringVar(&f.deadline, "deadline", "", "the day it must be finished by: YYYY-MM-DD, today, tomorrow or a weekday (edit: `none` clears)")
	fs.StringVar(&f.start, "start", "", "someday parks it; a date defers it: YYYY-MM-DD, today, tomorrow or a weekday (edit: `none` clears)")
	fs.BoolVar(&f.evening, "evening", false, "put it in This Evening (edit: --evening=false takes it out)")
	fs.Var(&f.blockedBy, "blocked-by", "a task this one waits for, id or unique id prefix (repeatable; edit replaces the list)")
	fs.StringVar(&f.location, "location", "", "a saved location's name or id, or lat,lon (edit: `none` clears)")
}

// planDate reads a --deadline or --start word like --due.
func planDate(name, word string, now time.Time) (string, error) {
	d, err := resolveDate(word, now)
	if err != nil {
		return "", usageErr("invalid --%s %q: use YYYY-MM-DD, today, tomorrow or a weekday name%s", name, word, map[bool]string{true: ", or someday"}[name == "start"])
	}
	return d, nil
}

// validateLocal checks the words before any request.
func (f *planningFlags) validateLocal(set map[string]bool, now time.Time, edit bool) error {
	none := func(v string) bool { return strings.EqualFold(v, "none") }
	for _, name := range []string{"deadline", "start", "location"} {
		v := map[string]string{"deadline": f.deadline, "start": f.start, "location": f.location}[name]
		if set[name] && none(v) && !edit {
			return usageErr("--%s none only makes sense with `ot edit`", name)
		}
	}
	if set["deadline"] && !none(f.deadline) {
		if _, err := planDate("deadline", f.deadline, now); err != nil {
			return err
		}
	}
	if set["start"] && !none(f.start) && !strings.EqualFold(f.start, "someday") {
		if _, err := planDate("start", f.start, now); err != nil {
			return err
		}
	}
	if set["location"] && !none(f.location) && strings.TrimSpace(f.location) == "" {
		return usageErr("--location needs a saved location's name or id, lat,lon or none")
	}
	if _, ok, err := parseLatLon(f.location); set["location"] && ok && err != nil {
		return err
	}
	return nil
}

func (f *planningFlags) any(set map[string]bool) bool {
	return set["deadline"] || set["start"] || set["evening"] || set["blocked-by"] || set["location"]
}

// parseLatLon reads "lat,lon"; ok is false when v does not look like a pair.
func parseLatLon(v string) (map[string]any, bool, error) {
	a, b, found := strings.Cut(strings.TrimSpace(v), ",")
	if !found {
		return nil, false, nil
	}
	lat, err1 := strconv.ParseFloat(strings.TrimSpace(a), 64)
	lon, err2 := strconv.ParseFloat(strings.TrimSpace(b), 64)
	if err1 != nil || err2 != nil {
		return nil, false, nil
	}
	if lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return nil, true, usageErr("--location %q: latitude must be -90 to 90 and longitude -180 to 180", v)
	}
	return map[string]any{"lat": lat, "lon": lon}, true, nil
}

// fill puts the planning fields into an add body or an edit patch. tasks
// lazily loads the account's tasks for --blocked-by.
func (f *planningFlags) fill(ctx context.Context, a *App, c *client, set map[string]bool, out map[string]any, tasks func() ([]task, error)) error {
	none := func(v string) bool { return strings.EqualFold(v, "none") }
	now := a.Now()
	if set["deadline"] {
		if none(f.deadline) {
			out["deadline"] = nil
		} else {
			out["deadline"], _ = planDate("deadline", f.deadline, now)
		}
	}
	if set["start"] {
		switch {
		case none(f.start):
			out["start"] = nil
		case strings.EqualFold(f.start, "someday"):
			out["start"] = "someday"
		default:
			out["start"], _ = planDate("start", f.start, now)
		}
	}
	if set["evening"] {
		out["evening"] = f.evening
	}
	if set["blocked-by"] {
		all, err := tasks()
		if err != nil {
			return err
		}
		ids := []string{}
		for _, ref := range f.blockedBy {
			if strings.EqualFold(ref, "none") || ref == "" {
				continue
			}
			t, err := resolveTask(all, ref)
			if err != nil {
				return &exitError{code: ExitServer, jsonCode: "not_found", msg: "--blocked-by: " + err.Error()}
			}
			ids = append(ids, t.ID)
		}
		out["blocked_by"] = ids
	}
	if set["location"] {
		loc, err := f.locationValue(ctx, c)
		if err != nil {
			return err
		}
		out["location"] = loc
	}
	return nil
}

// locationValue is --location as sent: nil, coordinates, or a link to a saved
// location with its current values.
func (f *planningFlags) locationValue(ctx context.Context, c *client) (any, error) {
	if strings.EqualFold(f.location, "none") {
		return nil, nil
	}
	if v, ok, err := parseLatLon(f.location); ok {
		return v, err
	}
	var out struct {
		Places []struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Address string `json:"address"`
			Geo     *struct {
				Lat float64 `json:"lat"`
				Lon float64 `json:"lon"`
			} `json:"geo"`
		} `json:"places"`
	}
	if err := c.getJSON(ctx, "/places", &out); err != nil {
		return nil, err
	}
	ref := strings.TrimSpace(f.location)
	var match []int
	for i, p := range out.Places {
		if p.ID == ref {
			match = []int{i}
			break
		}
		if strings.EqualFold(p.Name, ref) {
			match = append(match, i)
		}
	}
	switch len(match) {
	case 0:
		return nil, &exitError{code: ExitServer, jsonCode: "not_found", msg: fmt.Sprintf("--location: no saved location %q", ref)}
	case 1:
	default:
		return nil, &exitError{code: ExitServer, jsonCode: "ambiguous", msg: fmt.Sprintf("--location: %d saved locations are named %q; use the id", len(match), ref)}
	}
	p := out.Places[match[0]]
	v := map[string]any{"place_id": p.ID}
	if p.Name != "" {
		v["name"] = p.Name
	}
	if p.Address != "" {
		v["address"] = p.Address
	}
	if p.Geo != nil {
		v["lat"], v["lon"] = p.Geo.Lat, p.Geo.Lon
	}
	return v, nil
}

// ---- list ----

// planningView reports the --someday, --anytime and --blocked filter chosen ("" for none).
func (o *listOptions) planningView() (string, error) {
	var on []string
	for name, set := range map[string]bool{"someday": o.someday, "anytime": o.anytime, "blocked": o.blocked} {
		if set {
			on = append(on, name)
		}
	}
	switch len(on) {
	case 0:
		return "", nil
	case 1:
		if o.inbox || o.today || o.upcoming || o.completed || o.all || o.ranged() {
			return "", usageErr("--%s combines only with --project and --limit", on[0])
		}
		return on[0], nil
	}
	return "", usageErr("choose one of --someday, --anytime, --blocked")
}

func plannedOf(t task) inbox.Planned {
	p := inbox.Planned{HasDue: t.Due != nil, HasDeadline: t.Deadline != nil && *t.Deadline != "",
		Completed: t.CompletedAt != nil, Deleted: t.DeletedAt != nil}
	if t.Start != nil {
		p.Start = *t.Start
	}
	return p
}

// blockedRule reports whether a task waits for an open, live task.
func blockedRule(all []task) func(task) bool {
	open := make(map[string]bool, len(all))
	for _, t := range all {
		open[t.ID] = t.CompletedAt == nil && t.DeletedAt == nil
	}
	return func(t task) bool {
		for _, id := range t.BlockedBy {
			if open[id] {
				return true
			}
		}
		return false
	}
}

// filterPlanning keeps the tasks of one planning filter.
func filterPlanning(tasks, all []task, which string) []task {
	blocked := blockedRule(all)
	out := tasks[:0]
	for _, t := range tasks {
		keep := false
		switch which {
		case "someday":
			keep = inbox.Someday(plannedOf(t))
		case "anytime":
			keep = inbox.Anytime(plannedOf(t))
		case "blocked":
			keep = t.CompletedAt == nil && blocked(t)
		}
		if keep {
			out = append(out, t)
		}
	}
	return out
}

// deadlineCell is the BY column: the deadline, marked overdue once it has passed.
func deadlineCell(t task, today string) cell {
	if t.Deadline == nil || *t.Deadline == "" {
		return plain("")
	}
	if *t.Deadline < today && t.CompletedAt == nil {
		return cell{text: *t.Deadline + " overdue", style: styleRed}
	}
	return plain(*t.Deadline)
}

// planningSuffix is what the DUE cell adds: (someday), starts <date>, evening, waiting.
func planningSuffix(t task, today string, blocked bool) string {
	var parts []string
	if t.Start != nil {
		switch s := *t.Start; {
		case s == "someday":
			parts = append(parts, "(someday)")
		case s > today:
			parts = append(parts, "starts "+s)
		}
	}
	if t.Evening {
		parts = append(parts, "evening")
	}
	if blocked {
		parts = append(parts, "waiting")
	}
	return strings.Join(parts, " ")
}
