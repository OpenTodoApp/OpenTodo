package cli

import (
	"context"
	"encoding/json"
	"fmt"
)

// ---- done / reopen / rm ----

func cmdDone(a *App, ctx context.Context, g *globalFlags, args []string) error {
	return setCompleted(a, ctx, g, args, "done", true)
}

func cmdReopen(a *App, ctx context.Context, g *globalFlags, args []string) error {
	return setCompleted(a, ctx, g, args, "reopen", false)
}

func setCompleted(a *App, ctx context.Context, g *globalFlags, args []string, name string, complete bool) error {
	fs := a.flagSet(name, g)
	subtasks := false
	if complete {
		fs.BoolVar(&subtasks, "subtasks", false, "also complete the task's open subtasks, at every depth (the default unless Settings keeps open subtasks; --subtasks=false completes only the task)")
	}
	refs, err := a.parse(g, fs, name, args)
	if err != nil {
		return a.helpOr(name, err)
	}
	if len(refs) == 0 {
		return usageErr("usage: ot %s <ref>...", name)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	targets, refOf, err := resolveTaskRefs(all, refs)
	if err != nil {
		return err
	}
	if complete && !visited(fs)["subtasks"] {
		// Like the app: a completion completes the open subtasks unless the user keeps them (keep-open-subtasks D4).
		keep, err := c.keepsOpenSubtasks(ctx)
		if err != nil {
			return err
		}
		subtasks = !keep
	}
	if subtasks {
		targets = withSubtasks(all, targets, refOf, func(t task) bool { return t.CompletedAt == nil })
	}
	var value any
	status := "reopened"
	if complete {
		value = a.Now().UnixMilli()
		status = "completed"
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, t := range targets {
		// Already in the requested state: report it, send nothing (design D5).
		if (t.CompletedAt != nil) == complete {
			a.target(refOf[t.ID], t.ID, t.Title, "unchanged")
			results = append(results, withStatus(t.Raw, refOf[t.ID], "unchanged"))
			if !g.json {
				fmt.Fprintf(a.Stdout, "%-8s %s  %s\n", "unchanged", shortID(t.ID), t.Title)
			}
			continue
		}
		a.target(refOf[t.ID], t.ID, t.Title, status)
		var raw json.RawMessage
		if err := c.patchJSON(ctx, "/tasks/"+t.ID, map[string]any{"completed_at": value}, &raw); err != nil {
			return err
		}
		results = append(results, withStatus(raw, refOf[t.ID], status))
		if !g.json {
			fmt.Fprintf(a.Stdout, "%-8s %s  %s\n", name, shortID(t.ID), t.Title)
		}
	}
	if g.json {
		if len(results) == 1 {
			return a.printJSON(results[0])
		}
		return a.printRawList(results)
	}
	return nil
}

func cmdRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	subtasks := fs.Bool("subtasks", false, "also delete the task's subtasks, at every depth")
	refs, err := a.parse(g, fs, "rm", args)
	if err != nil {
		return a.helpOr("rm", err)
	}
	if len(refs) == 0 {
		return usageErr("usage: ot rm <ref>... [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	targets, refOf, err := resolveTaskRefs(all, refs)
	if err != nil {
		return err
	}
	if *subtasks {
		targets = withSubtasks(all, targets, refOf, func(task) bool { return true })
	}
	// Off a terminal or with --json, a.parse already refused without --yes.
	if !*yes && !a.dryRun() {
		for _, t := range targets {
			fmt.Fprintf(a.Stderr, "  %s  %s\n", shortID(t.ID), t.Title)
		}
		ok, err := a.confirm(fmt.Sprintf("Delete %d task(s)?", len(targets)))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, t := range targets {
		a.target(refOf[t.ID], t.ID, t.Title, "deleted")
		if err := c.delete(ctx, "/tasks/"+t.ID); err != nil {
			return err
		}
		results = append(results, withStatus(t.Raw, refOf[t.ID], "deleted"))
		if !g.json {
			fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(t.ID), t.Title)
		}
	}
	if g.json {
		if len(results) == 1 {
			return a.printJSON(results[0])
		}
		return a.printRawList(results)
	}
	return nil
}
