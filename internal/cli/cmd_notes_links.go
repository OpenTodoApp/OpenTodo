package cli

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/notelinks"
)

// `ot notes links <ref>` (OpenSpec change note-links, design D6): the items a
// note links to and the notes that link to it, computed on this machine over
// the notes the API returned (internal/notelinks, the grammar the app uses), so
// an unlocked encrypted profile works; a locked one stops with
// encryption_enabled (exit 5). Reads only.

type noteLinkOut struct {
	Kind      string `json:"kind"`
	ID        string `json:"id"`
	Title     string `json:"title"`
	Available bool   `json:"available"`
}

type noteLinkedFrom struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Title string `json:"title"`
}

type noteLinksOut struct {
	Kind       string           `json:"kind"`
	ID         string           `json:"id"`
	Title      string           `json:"title"`
	Links      []noteLinkOut    `json:"links"`
	LinkedFrom []noteLinkedFrom `json:"linked_from"`
}

func notesLinks(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes links", g)
	pos, err := a.parse(g, fs, "notes links", args)
	if err != nil {
		return a.helpOr("notes", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot notes links <ref>")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	// Links live in the text: on an encrypted account they need the key.
	if err := s.requireKey(); err != nil {
		return err
	}
	rows, _, err := s.loadRows(ctx, "all", true)
	if err != nil {
		return err
	}
	r, err := resolveNote(rows, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	out := computeNoteLinks(rows, r)
	if g.json {
		return a.printJSON(out)
	}
	printNoteLinks(a.Stdout, out, a.color())
	return nil
}

// computeNoteLinks reads the links of r's text and the rows whose text links to r.
func computeNoteLinks(rows []noteRow, r *noteRow) noteLinksOut {
	byKey := make(map[string]*noteRow, len(rows))
	for i := range rows {
		byKey[rows[i].kind+":"+rows[i].id] = &rows[i]
	}
	self := r.kind + ":" + r.id
	out := noteLinksOut{Kind: r.kind, ID: r.id, Title: r.shownTitle(), Links: []noteLinkOut{}, LinkedFrom: []noteLinkedFrom{}}
	for _, l := range notelinks.Targets(r.searchText) {
		o := noteLinkOut{Kind: l.Kind, ID: l.ID, Title: l.Label}
		if t, ok := byKey[l.Key()]; ok {
			o.Title, o.Available = t.shownTitle(), true
		}
		out.Links = append(out.Links, o)
	}
	// rows are newest first, so linked references are too.
	for i := range rows {
		src := &rows[i]
		if src.kind+":"+src.id == self {
			continue
		}
		for _, l := range notelinks.Targets(src.searchText) {
			if l.Key() == self {
				out.LinkedFrom = append(out.LinkedFrom, noteLinkedFrom{Kind: src.kind, ID: src.id, Title: src.shownTitle()})
				break
			}
		}
	}
	return out
}

func printNoteLinks(w io.Writer, out noteLinksOut, color bool) {
	section := func(name string, n int, rows func(t *table)) {
		fmt.Fprintf(w, "%s (%d)\n", name, n)
		if n == 0 {
			fmt.Fprintln(w, "  none")
			return
		}
		tbl := newTable("KIND", "ID", "TITLE")
		rows(tbl)
		tbl.render(w, color)
	}
	section("Links to", len(out.Links), func(t *table) {
		for _, l := range out.Links {
			kind := l.Kind
			if !l.Available {
				kind += " (not found)"
			}
			t.add(cell{text: kind, style: styleDim}, cell{text: shortID(l.ID), style: styleCyan}, plain(l.Title))
		}
	})
	fmt.Fprintln(w)
	section("Linked references", len(out.LinkedFrom), func(t *table) {
		for _, l := range out.LinkedFrom {
			t.add(cell{text: l.Kind, style: styleDim}, cell{text: shortID(l.ID), style: styleCyan}, plain(l.Title))
		}
	})
}
