package cli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// `ot task note <ref>` (OpenSpec change notes-overview, cli-client "Task note
// command"): print a task's note as Markdown, or replace (--set, --file,
// --clear: a PATCH of description with If-Match) or append to it (--append).
// One option per call.

// resolveTaskOrTitle is resolveTask with a title fallback: a title (ignoring
// case) or an unambiguous title prefix when no id matches.
func resolveTaskOrTitle(all []task, ref string) (*task, error) {
	t, err := resolveTask(all, ref)
	if err == nil || strings.Contains(err.Error(), "ambiguous") {
		return t, err
	}
	lower := strings.ToLower(strings.TrimSpace(ref))
	for _, prefix := range []bool{false, true} {
		var found []*task
		for i := range all {
			title := strings.ToLower(strings.TrimSpace(all[i].Title))
			if all[i].DeletedAt != nil {
				continue
			}
			if title == lower || (prefix && strings.HasPrefix(title, lower)) {
				found = append(found, &all[i])
			}
		}
		if len(found) == 1 {
			return found[0], nil
		}
		if len(found) > 1 {
			return nil, usageErr("%q matches %d task titles; use the id (see `ot list`)", ref, len(found))
		}
	}
	return nil, err
}

// parseMaybeWrite is a.parse for a command that reads or writes depending on
// its flags: read-only mode and --dry-run apply only when it writes.
func (a *App) parseMaybeWrite(g *globalFlags, fs *flag.FlagSet, name string, args []string, writes func() bool) ([]string, error) {
	pos, err := parseArgs(fs, name, args)
	if err != nil {
		return nil, err
	}
	if envTrue(a.Getenv("OPENTODO_READ_ONLY")) {
		g.readOnly = true
	}
	a.gate.readOnly = g.readOnly
	if !writes() {
		return pos, nil
	}
	if g.readOnly {
		return nil, readOnlyErr(name)
	}
	if g.dryRun {
		a.gate.dry = &dryPlan{command: name}
		a.Stdout = io.Discard
	}
	return pos, nil
}

func taskNote(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("task note", g)
	set := fs.String("set", "", "replace the note with this text (Markdown)")
	file := fs.String("file", "", "replace the note with a file's text, - for standard input")
	appendText := fs.String("append", "", "add this text at the end of the note")
	clear := fs.Bool("clear", false, "replace the note with empty text")
	var options []string
	writes := func() bool {
		options = options[:0]
		for _, n := range []string{"set", "file", "append", "clear"} {
			if visited(fs)[n] {
				options = append(options, "--"+n)
			}
		}
		return len(options) > 0
	}
	pos, err := a.parseMaybeWrite(g, fs, "task note", protectDashText(args), writes)
	if err != nil {
		return a.helpOr("task", err)
	}
	if len(options) > 1 {
		return usageErr("give only one of --set, --file, --append and --clear (got %s); nothing was sent", strings.Join(options, ", "))
	}
	if len(pos) == 0 {
		return usageErr("usage: ot task note <ref> [--set <text> | --file <path|-> | --append <text> | --clear]")
	}
	text, replace := "", false
	switch {
	case len(options) == 0:
	case *clear:
		replace = true
	case options[0] == "--append":
		if text = undash(*appendText); strings.TrimSpace(text) == "" {
			return usageErr("--append needs text")
		}
	default:
		if text, _, err = a.readBody(*set, *file, options[0] == "--set", options[0] == "--file", "--set and --file"); err != nil {
			return err
		}
		replace = true
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if len(options) > 0 {
		if err := s.requireKey(); err != nil {
			return err
		}
	}
	tasks, err := s.c.tasks(ctx)
	if err != nil {
		return err
	}
	ref := strings.Join(undashAll(pos), " ")
	for i := range tasks {
		// Titles are matched decrypted; one that does not open matches only by id.
		if pt, ok := s.open("task", tasks[i].ID, "title", tasks[i].Title); ok {
			tasks[i].Title = pt
		} else {
			tasks[i].Title = ""
		}
	}
	t, err := resolveTaskOrTitle(tasks, ref)
	if err != nil {
		return err
	}
	r, err := s.rowOf("task", t.Raw)
	if err != nil {
		return err
	}
	switch {
	case len(options) == 0:
		return a.printNoteText(g, &r)
	case !replace:
		a.target(ref, r.id, r.shownTitle(), "appended")
		return a.sendAppend(ctx, g, s, "task", r.id, "/tasks/"+url.PathEscape(r.id)+"/note/append", text)
	}
	a.target(ref, r.id, r.shownTitle(), "replaced")
	sealed, err := s.seal("task", r.id, "description", text)
	if err != nil {
		return err
	}
	raw, _, err := s.c.do(ctx, http.MethodPatch, "/tasks/"+url.PathEscape(r.id), map[string]any{"description": sealed}, ifMatch(r.bodyVersion))
	if err != nil {
		return err
	}
	planned := r
	planned.description, planned.appends = text, []pendingAppend{}
	out := s.rowFromResponse("task", raw, planned)
	if g.json {
		return a.printJSON(out.textOut())
	}
	fmt.Fprintf(a.Stdout, "replaced  %s  %s\n", shortID(out.id), out.shownTitle())
	return nil
}
