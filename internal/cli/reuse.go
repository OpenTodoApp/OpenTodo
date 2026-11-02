package cli

import (
	"context"
	"encoding/json"
	"fmt"
)

// Reusable lists (OpenSpec reusable-lists, design D6): `ot add` asks the server
// to reopen an item already in a reusable list instead of adding a second one,
// and `ot project edit` turns the mode and its aisles on and off.

// markReuse sets reuse on a create body whose project is a reusable list,
// unless off (--new, --done) or the task is a subtask.
func markReuse(ctx context.Context, c *client, body map[string]any, off bool) error {
	pid, _ := body["project_id"].(string)
	if off || pid == "" || body["parent_id"] != nil {
		return nil
	}
	var p project
	if err := c.getJSON(ctx, "/projects/"+pid, &p); err != nil {
		return err
	}
	if p.Reusable {
		body["reuse"] = true
	}
	return nil
}

// reportReused says on stderr when the add reopened an item or found it open.
func (a *App) reportReused(raw json.RawMessage) {
	var r struct {
		Reused string `json:"reused"`
	}
	_ = json.Unmarshal(raw, &r)
	switch r.Reused {
	case "reopened":
		fmt.Fprintln(a.Stderr, "reopened: the item was ticked off and is back on the list (--new adds another)")
	case "open":
		fmt.Fprintln(a.Stderr, "already on the list: nothing was added (--new adds another)")
	}
}

// projectEdit changes a project's reusable-list mode.
func projectEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project edit", g)
	on := fs.Bool("reusable", false, "make it a reusable list")
	off := fs.Bool("no-reusable", false, "make it an ordinary project again")
	aisles := fs.Bool("aisles", false, "sort new items into aisle sections")
	noAisles := fs.Bool("no-aisles", false, "stop sorting new items into aisle sections")
	pos, err := a.parse(g, fs, "project edit", args)
	if err != nil {
		return a.helpOr("project", err)
	}
	const usage = "usage: ot project edit <ref> [--reusable|--no-reusable] [--aisles|--no-aisles]"
	if len(pos) != 1 {
		return usageErr(usage)
	}
	if (*on && *off) || (*aisles && *noAisles) {
		return usageErr("--reusable and --no-reusable (or --aisles and --no-aisles) cannot be combined")
	}
	patch := map[string]any{}
	if *on || *off {
		patch["reusable"] = *on
	}
	if *aisles || *noAisles {
		patch["aisles"] = *aisles
	}
	if len(patch) == 0 {
		return usageErr(usage)
	}
	return projectPatch(a, ctx, g, pos[0], patch, "edited")
}
