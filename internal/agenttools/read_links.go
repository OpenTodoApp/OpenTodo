package agenttools

import (
	"context"
	"sort"

	"github.com/OpenTodoApp/opentodo/internal/notelinks"
)

// Links between notes, tasks and projects in get_note and get_task (OpenSpec
// change note-links, design D6): `links` are the items the result's own text
// links to ([title](?note=<id>), ?task=, ?project=), `linked_from` the task
// notes, project notes and standalone notes the caller can read that link to
// it. Computed in the call's memory over the rows of the caller's scopes (the
// same pass search_notes makes); nothing is stored. Only for an account
// without end-to-end encryption: on an encrypted one the server holds
// ciphertext and learns nothing about links, and neither field is returned.

// linkText is the user-written title of a link's target or source.
type linkText struct {
	Title string `json:"title"`
}

type linkOut struct {
	Kind      string   `json:"kind"`
	ID        string   `json:"id"`
	Untrusted linkText `json:"untrusted_text"`
	// Available is false for a target that is missing, in the Trash or not
	// visible to the caller (indistinguishable on purpose); its title is then
	// the link's own text.
	Available bool `json:"available"`
}

type linkedFromOut struct {
	Kind      string   `json:"kind"`
	ID        string   `json:"id"`
	Untrusted linkText `json:"untrusted_text"`
}

// linkDescription is appended to the descriptions of get_note and get_task.
const linkDescription = " On an account without end-to-end encryption it also returns links (the notes, tasks and projects its text links to, each with available: false when the caller cannot open it) and linked_from (the notes that link to it); an encrypted account gets neither (the user can run `ot notes links` on their machine)."

// linkHowTo is appended to the descriptions of the tools that write note text.
const linkHowTo = " Link to a note, task or project with Markdown: [title](?note=<id>), [title](?task=<id>) or [title](?project=<id>); the app shows the item's current title."

// noteLinks computes links and linked_from of kind:id for a plaintext account.
func (r *Registry) noteLinks(ctx context.Context, userID, kind, id string) ([]linkOut, []linkedFromOut, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	rows, err := r.collectNotesIn(ctx, userID, noteQuery{source: "all"}, snap)
	if err != nil {
		return nil, nil, err
	}
	self := kind + ":" + id
	notes := map[string]noteRow{}
	var own string
	for _, row := range rows {
		if row.kind == "note" {
			notes[row.id] = row
		}
		if row.kind+":"+row.id == self {
			own = row.plainX
		}
	}
	links := []linkOut{}
	for _, l := range notelinks.Targets(own) {
		o := linkOut{Kind: l.Kind, ID: l.ID, Untrusted: linkText{Title: l.Label}}
		switch l.Kind {
		case notelinks.KindTask:
			if t := snap.task(l.ID); t != nil && snap.visible(t, true) {
				o.Available, o.Untrusted.Title = true, str(t, "title")
			}
		case notelinks.KindProject:
			if p, ok := snap.projects[l.ID]; ok {
				o.Available, o.Untrusted.Title = true, str(p, "name")
			}
		case notelinks.KindNote:
			if n, ok := notes[l.ID]; ok {
				o.Available, o.Untrusted.Title = true, n.title
			}
		}
		links = append(links, o)
	}
	type hit struct {
		o       linkedFromOut
		updated int64
	}
	var hits []hit
	for _, row := range rows {
		if row.kind+":"+row.id == self {
			continue
		}
		for _, l := range notelinks.Targets(row.plainX) {
			if l.Key() == self {
				hits = append(hits, hit{linkedFromOut{Kind: row.kind, ID: row.id, Untrusted: linkText{Title: row.title}}, row.updated})
				break
			}
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].updated != hits[j].updated {
			return hits[i].updated > hits[j].updated
		}
		return hits[i].o.ID < hits[j].o.ID
	})
	from := make([]linkedFromOut, 0, len(hits))
	for _, h := range hits {
		from = append(from, h.o)
	}
	return links, from, nil
}

// withLinks adds links and linked_from to a get_note or get_task result for a
// caller whose account is not end-to-end encrypted.
func (r *Registry) withLinks(ctx context.Context, c Caller, kind, id string, out map[string]any) (map[string]any, error) {
	if c.Encrypted {
		return out, nil
	}
	links, from, err := r.noteLinks(ctx, c.UserID, kind, id)
	if err != nil {
		return nil, err
	}
	out["links"], out["linked_from"] = links, from
	return out, nil
}
