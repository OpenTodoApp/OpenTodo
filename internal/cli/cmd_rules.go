package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Automation rule commands (OpenSpec change automation-rules, task 3.3): list
// the account's rules, turn one on or off, and print its run log. Rules are
// built in the app; the CLI does not edit triggers, conditions or actions.

// ruleRow is a rule as GET /api/v1/rules returns it.
type ruleRow struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Enabled bool            `json:"enabled"`
	Trigger json.RawMessage `json:"trigger"`
}

func cmdRules(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot rules list|enable|disable|runs [<id>]")
	}
	switch args[0] {
	case "list", "ls":
		return rulesList(a, ctx, g, args[1:])
	case "enable", "disable":
		return rulesSwitch(a, ctx, g, args[0], args[1:])
	case "runs":
		return rulesRuns(a, ctx, g, args[1:])
	}
	return usageErr("unknown rules command %q (expected list, enable, disable or runs)", args[0])
}

func (c *client) rules(ctx context.Context) ([]json.RawMessage, []ruleRow, error) {
	raw, _, err := c.do(ctx, http.MethodGet, "/rules", nil, nil)
	if err != nil {
		return nil, nil, err
	}
	var page struct {
		Rules []json.RawMessage `json:"rules"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, nil, fmt.Errorf("decode rules: %w", err)
	}
	list := page.Rules
	if list == nil {
		list = []json.RawMessage{}
	}
	rows := make([]ruleRow, len(list))
	for i, r := range list {
		_ = json.Unmarshal(r, &rows[i])
	}
	return list, rows, nil
}

func rulesList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("rules list", g)
	pos, err := a.parse(g, fs, "rules list", args)
	if err != nil {
		return a.helpOr("rules", err)
	}
	if len(pos) != 0 {
		return usageErr("usage: ot rules list")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	list, rows, err := c.rules(ctx)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(list)
	}
	if len(rows) == 0 {
		fmt.Fprintln(a.Stdout, "No rules.")
		return nil
	}
	tbl := newTable("ID", "NAME", "ON", "TRIGGER")
	for _, r := range rows {
		var tr struct {
			Kind string `json:"kind"`
		}
		_ = json.Unmarshal(r.Trigger, &tr)
		on := "off"
		if r.Enabled {
			on = "on"
		}
		tbl.add(cell{text: shortID(r.ID), style: styleCyan}, plain(r.Name), plain(on), plain(tr.Kind))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

// resolveRule finds a rule by id, unique id prefix or exact name.
func resolveRule(rows []ruleRow, ref string) (*ruleRow, error) {
	var hit *ruleRow
	for i := range rows {
		if rows[i].ID == ref || strings.EqualFold(rows[i].Name, ref) {
			return &rows[i], nil
		}
		if strings.HasPrefix(rows[i].ID, ref) {
			if hit != nil {
				return nil, usageErr("%q matches more than one rule; use more of its id", ref)
			}
			hit = &rows[i]
		}
	}
	if hit == nil {
		return nil, usageErr("no rule %q (see `ot rules list`)", ref)
	}
	return hit, nil
}

func rulesSwitch(a *App, ctx context.Context, g *globalFlags, verb string, args []string) error {
	fs := a.flagSet("rules "+verb, g)
	pos, err := a.parse(g, fs, "rules "+verb, args)
	if err != nil {
		return a.helpOr("rules", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot rules %s <id>", verb)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	_, rows, err := c.rules(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRule(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], r.ID, r.Name, "")
	raw, _, err := c.do(ctx, http.MethodPatch, "/rules/"+r.ID, map[string]any{"enabled": verb == "enable"}, nil)
	if err != nil {
		return err
	}
	if a.dryRun() {
		return nil
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	fmt.Fprintf(a.Stdout, "%s: %sd\n", r.Name, verb)
	return nil
}

func rulesRuns(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("rules runs", g)
	pos, err := a.parse(g, fs, "rules runs", args)
	if err != nil {
		return a.helpOr("rules", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot rules runs <id>")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	_, rows, err := c.rules(ctx)
	if err != nil {
		return err
	}
	r, err := resolveRule(rows, pos[0])
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, http.MethodGet, "/rules/"+r.ID+"/runs", nil, nil)
	if err != nil {
		return err
	}
	var page struct {
		Runs []json.RawMessage `json:"runs"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return fmt.Errorf("decode runs: %w", err)
	}
	if g.json {
		return a.printJSON(page.Runs)
	}
	if len(page.Runs) == 0 {
		fmt.Fprintln(a.Stdout, "No runs.")
		return nil
	}
	tbl := newTable("TIME", "OUTCOME", "TASK", "REASON")
	for _, rr := range page.Runs {
		var run struct {
			At      int64  `json:"at"`
			Outcome string `json:"outcome"`
			TaskID  string `json:"task_id"`
			Reason  string `json:"reason"`
		}
		_ = json.Unmarshal(rr, &run)
		style := styleNone
		if run.Outcome == "failed" || run.Outcome == "stopped" {
			style = styleRed
		}
		tbl.add(plain(time.UnixMilli(run.At).In(a.Now().Location()).Format("2006-01-02 15:04")), cell{text: run.Outcome, style: style},
			plain(shortID(run.TaskID)), plain(run.Reason))
	}
	tbl.render(a.Stdout, a.color())
	return nil
}
