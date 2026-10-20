package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Issue connection commands (OpenSpec change issue-import, design D14): list
// the account's connections and run a poll now. list reads (any token scope);
// sync writes, so read-only mode and the token's scope apply and --dry-run
// prints the requests. No token ever reaches the output: the server never
// returns one.

// issueConn is a connection as GET /api/v1/issues/connections returns it.
type issueConn struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Provider      string     `json:"provider"`
	Host          string     `json:"host"`
	State         string     `json:"state"`
	Enabled       bool       `json:"enabled"`
	LastPollAt    *int64     `json:"last_poll_at"`
	LastError     string     `json:"last_error"`
	StoppedReason string     `json:"stopped_reason"`
	TaskCount     int        `json:"task_count"`
	LastRun       *issuesRun `json:"last_run"`
}

// issuesRun are the counts of one poll.
type issuesRun struct {
	Created   int  `json:"created"`
	Completed int  `json:"completed"`
	Reopened  int  `json:"reopened"`
	Renamed   int  `json:"renamed"`
	Unlinked  int  `json:"unlinked"`
	Partial   bool `json:"partial"`
}

func (r issuesRun) String() string {
	s := fmt.Sprintf("created %d, completed %d, reopened %d, renamed %d", r.Created, r.Completed, r.Reopened, r.Renamed)
	if r.Partial {
		s += " (partial: the rest follows on the next poll)"
	}
	return s
}

func cmdIssues(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot issues list|sync [<id>]")
	}
	switch args[0] {
	case "list", "ls":
		return issuesList(a, ctx, g, args[1:])
	case "sync":
		return issuesSync(a, ctx, g, args[1:])
	}
	return usageErr("unknown issues command %q (expected list or sync)", args[0])
}

func (c *client) issueConnections(ctx context.Context) ([]json.RawMessage, error) {
	raw, _, err := c.do(ctx, http.MethodGet, "/issues/connections", nil, nil)
	if err != nil {
		return nil, err
	}
	var page struct {
		Connections []json.RawMessage `json:"connections"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("decode connections: %w", err)
	}
	return page.Connections, nil
}

func issuesList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("issues list", g)
	pos, err := a.parse(g, fs, "issues list", args)
	if err != nil {
		return a.helpOr("issues", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot issues list")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	list, err := c.issueConnections(ctx)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(list)
	}
	if len(list) == 0 {
		fmt.Fprintln(a.Stdout, "No issue connections.")
		return nil
	}
	tbl := newTable("ID", "NAME", "PROVIDER", "HOST", "STATE", "LAST POLL", "TASKS")
	for _, raw := range list {
		var ic issueConn
		_ = json.Unmarshal(raw, &ic)
		state := ic.State
		if reason := firstNonEmpty(ic.StoppedReason, ic.LastError); reason != "" {
			state += " (" + reason + ")"
		}
		last := "never"
		if ic.LastPollAt != nil {
			last = time.UnixMilli(*ic.LastPollAt).In(a.Now().Location()).Format("2006-01-02 15:04")
		}
		style := styleNone
		if ic.State == "failed" || ic.State == "stopped" {
			style = styleRed
		}
		tbl.add(cell{text: shortID(ic.ID), style: styleCyan}, plain(ic.Name), plain(ic.Provider), plain(ic.Host), cell{text: state, style: style},
			plain(last), plain(fmt.Sprint(ic.TaskCount)))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

// resolveIssueConn finds a connection by id or unique id prefix.
func resolveIssueConn(list []issueConn, ref string) (*issueConn, error) {
	var hit *issueConn
	for i := range list {
		if list[i].ID == ref {
			return &list[i], nil
		}
		if strings.HasPrefix(list[i].ID, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one issue connection; use more of its id", ref)
			}
			hit = &list[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no issue connection %q (see `ot issues list`)", ref)
	}
	return hit, nil
}

func issuesSync(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("issues sync", g)
	pos, err := a.parse(g, fs, "issues sync", args)
	if err != nil {
		return a.helpOr("issues", err)
	}
	if len(pos) > 1 {
		return usageErr("usage: ot issues sync [<id>]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raws, err := c.issueConnections(ctx)
	if err != nil {
		return err
	}
	all := make([]issueConn, len(raws))
	for i, raw := range raws {
		_ = json.Unmarshal(raw, &all[i])
	}
	var targets []issueConn
	if len(pos) == 1 {
		ic, err := resolveIssueConn(all, pos[0])
		if err != nil {
			return err
		}
		targets = []issueConn{*ic}
	} else {
		for _, ic := range all {
			if ic.Enabled && ic.StoppedReason == "" {
				targets = append(targets, ic)
			}
		}
		if len(targets) == 0 {
			return usageErr("no enabled issue connection to sync (see `ot issues list`)")
		}
	}
	var results []json.RawMessage
	failed := ""
	for _, ic := range targets {
		a.target(ic.ID, ic.ID, ic.Name, ic.State)
		raw, _, err := c.do(ctx, http.MethodPost, "/issues/connections/"+ic.ID+"/sync", nil, nil)
		if err != nil {
			return err
		}
		results = append(results, raw)
		var res struct {
			OK     bool      `json:"ok"`
			Reason string    `json:"reason"`
			Run    issuesRun `json:"run"`
		}
		_ = json.Unmarshal(raw, &res)
		if a.dryRun() {
			continue
		}
		if !res.OK {
			failed = ic.Name + ": " + res.Reason
			fmt.Fprintf(a.Stdout, "%s  %s: failed (%s)\n", shortID(ic.ID), ic.Name, res.Reason)
			continue
		}
		if len(targets) > 1 {
			fmt.Fprintf(a.Stdout, "%s: ", ic.Name)
		}
		fmt.Fprintf(a.Stdout, "%s\n", res.Run)
	}
	if g.json && !a.dryRun() && failed == "" {
		if err := a.printJSON(results); err != nil {
			return err
		}
	}
	if failed != "" {
		return &exitError{code: ExitServer, jsonCode: "poll_failed", msg: "the poll failed: " + failed}
	}
	return nil
}
