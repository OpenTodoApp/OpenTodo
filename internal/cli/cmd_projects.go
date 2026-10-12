package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"strings"
)

// palette matches the colours the web app offers for new projects.
var palette = []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"}

func defaultColor(name string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(strings.ToLower(name)))
	return palette[int(h.Sum32()%uint32(len(palette)))]
}

func cmdProject(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot project list|add|rename|archive|rm ...")
	}
	sub, rest := args[0], args[1:]
	switch sub {
	case "list", "ls":
		return projectList(a, ctx, g, rest)
	case "add", "create":
		return projectAdd(a, ctx, g, rest)
	case "rename":
		return projectRename(a, ctx, g, rest)
	case "archive":
		return projectArchive(a, ctx, g, rest)
	case "rm", "delete":
		return projectRm(a, ctx, g, rest)
	}
	return usageErr("unknown project command %q (expected list, add, rename, archive or rm)", sub)
}

func projectList(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project list", g)
	all := fs.Bool("all", false, "include archived projects")
	if _, err := a.parse(g, fs, "project list", args); err != nil {
		return a.helpOr("project", err)
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	projects, err := c.projects(ctx)
	if err != nil {
		return err
	}
	shown := make([]project, 0, len(projects))
	for _, p := range projects {
		if p.DeletedAt != nil || (p.Archived && !*all) {
			continue
		}
		shown = append(shown, p)
	}
	if g.json {
		raws := make([]json.RawMessage, 0, len(shown))
		for _, p := range shown {
			raws = append(raws, p.Raw)
		}
		return a.printRawList(raws)
	}
	if len(shown) == 0 {
		fmt.Fprintln(a.Stdout, "No projects.")
		return nil
	}
	tbl := newTable("ID", "NAME", "COLOR", "STATUS")
	for _, p := range shown {
		status := ""
		if p.Archived {
			status = "archived"
		}
		tbl.add(cell{text: shortID(p.ID), style: styleCyan}, plain(p.Name), plain(p.Color), cell{text: status, style: styleDim})
	}
	tbl.render(a.Stdout, a.color())
	return nil
}

func projectAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project add", g)
	color := fs.String("color", "", "colour as #rrggbb")
	key := fs.String("idempotency-key", "", "retry-safe create")
	pos, err := a.parse(g, fs, "project add", args)
	if err != nil {
		return a.helpOr("project", err)
	}
	name := strings.TrimSpace(strings.Join(pos, " "))
	if name == "" {
		return usageErr("usage: ot project add <name> [--color <css-colour>]")
	}
	if *color == "" {
		*color = defaultColor(name)
	}
	headers, err := idempotencyHeaders(visited(fs)["idempotency-key"], *key)
	if err != nil {
		return err
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	raw, _, err := c.do(ctx, "POST", "/projects", map[string]any{"name": name, "color": *color, "archived": false}, headers)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var p project
	_ = json.Unmarshal(raw, &p)
	fmt.Fprintln(a.Stdout, p.ID)
	return nil
}

func projectPatch(a *App, ctx context.Context, g *globalFlags, ref string, patch map[string]any, verb string) error {
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	projects, err := c.projects(ctx)
	if err != nil {
		return err
	}
	p, err := findProject(projects, ref)
	if err != nil {
		return err
	}
	a.target(ref, p.ID, p.Name, "")
	var raw json.RawMessage
	if err := c.patchJSON(ctx, "/projects/"+p.ID, patch, &raw); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(raw)
	}
	var updated project
	_ = json.Unmarshal(raw, &updated)
	fmt.Fprintf(a.Stdout, "%-8s %s  %s\n", verb, shortID(updated.ID), updated.Name)
	return nil
}

func projectRename(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project rename", g)
	pos, err := a.parse(g, fs, "project rename", args)
	if err != nil {
		return a.helpOr("project", err)
	}
	if len(pos) < 2 {
		return usageErr("usage: ot project rename <ref> <new-name>")
	}
	name := strings.TrimSpace(strings.Join(pos[1:], " "))
	if name == "" {
		return usageErr("the new name cannot be empty")
	}
	return projectPatch(a, ctx, g, pos[0], map[string]any{"name": name}, "renamed")
}

func projectArchive(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project archive", g)
	undo := fs.Bool("undo", false, "restore an archived project")
	pos, err := a.parse(g, fs, "project archive", args)
	if err != nil {
		return a.helpOr("project", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot project archive <ref> [--undo]")
	}
	verb := "archived"
	if *undo {
		verb = "restored"
	}
	return projectPatch(a, ctx, g, pos[0], map[string]any{"archived": !*undo}, verb)
}

func projectRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("project rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	pos, err := a.parse(g, fs, "project rm", args)
	if err != nil {
		return a.helpOr("project", err)
	}
	if len(pos) != 1 {
		return usageErr("usage: ot project rm <ref> [--yes]")
	}
	c, _, err := a.connect(g)
	if err != nil {
		return err
	}
	projects, err := c.projects(ctx)
	if err != nil {
		return err
	}
	p, err := findProject(projects, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], p.ID, p.Name, "deleted")
	// Off a terminal or with --json, a.parse already refused without --yes.
	if !*yes && !a.dryRun() {
		ok, err := a.confirm(fmt.Sprintf("Delete project %q? Its tasks stay and move to the Inbox view only after you reassign them.", p.Name))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	if err := c.delete(ctx, "/projects/"+p.ID); err != nil {
		return err
	}
	if g.json {
		return a.printJSON(p.Raw)
	}
	fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(p.ID), p.Name)
	return nil
}
