package sync

import (
	"context"
	"database/sql"
	"sort"
)

// NotePage is one standalone note as a note page needs it (OpenSpec
// `note-public-links`, design D2): the note, its live attachments and when its
// text last changed, read from the one scope it lives in. The HTTP layer
// projects them to what a guest may see.
type NotePage struct {
	Scope           string
	Shared          bool
	Role            string
	ProjectArchived bool
	Note            Entity
	Attachments     []Entity // on the note, by created_at
	// TextChangedAt is the newest timestamp of the title, text and document
	// fields (Unix milliseconds).
	TextChangedAt int64
}

// NotePageData reads noteID as the publisher sees it. ok is false when the
// note is gone (in the Trash, purged, never seen), its project is deleted, or
// the publisher no longer sees it.
func (s *Service) NotePageData(ctx context.Context, publisherID, noteID string) (np NotePage, ok bool, err error) {
	note, err := s.Get(ctx, publisherID, "note", noteID)
	if err != nil || note == nil || note.deleted() {
		return np, false, err
	}
	np.Note = note
	ps, ok, err := s.pageScope(ctx, publisherID, idValue(note["project_id"]))
	if err != nil || !ok {
		return np, false, err
	}
	np.Scope, np.Shared, np.Role, np.ProjectArchived = ps.Scope, ps.Shared, ps.Role, ps.ProjectArchived
	var changed sql.NullInt64
	if err := s.reader().QueryRowContext(ctx, `SELECT MAX(ts) FROM scope_fields WHERE scope_id = ? AND entity = 'note' AND entity_id = ?
		AND field IN ('title', 'description', 'notes_doc')`, np.Scope, noteID).Scan(&changed); err != nil {
		return np, false, err
	}
	np.TextChangedAt = changed.Int64
	list, err := s.scopeEntities(ctx, np.Scope, "attachment", "")
	if err != nil {
		return np, false, err
	}
	for _, a := range list {
		if !a.deleted() && idValue(a["note_id"]) == noteID {
			np.Attachments = append(np.Attachments, a)
		}
	}
	sort.SliceStable(np.Attachments, func(i, j int) bool {
		return np.Attachments[i].number("created_at") < np.Attachments[j].number("created_at")
	})
	return np, true, nil
}
