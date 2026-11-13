package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

// Attachments (OpenSpec change `attachments`, design D1, D3). An attachment is the
// metadata of a file or link on a task or one of its comments: an entity in the op
// log that lives in its task's scope, with the comment authorship rules:
//
//   - creating needs a task the author can read (viewers included) and an
//     author_id equal to the submitting account; a comment_id must name a comment
//     of the same task by the same author;
//   - every field but name, uploaded_at and deleted_at is fixed at creation;
//   - name is the author's alone; deleted_at may be set by the author, a project
//     admin or the owner;
//   - uploaded_at is written only by the server (device "server") once it stored
//     the bytes;
//   - a size over the per-file limit is refused at creation (too_large), so an
//     oversized row never reaches other devices.

// ReasonTooLarge: an attachment's size is over the per-file limit.
const ReasonTooLarge = "too_large"

// attachmentImmutable lists the fields fixed at creation.
var attachmentImmutable = map[string]bool{
	"task_id": true, "note_id": true, "comment_id": true, "file_id": true, "mime": true, "size": true, "sha256": true,
	"url": true, "encrypted": true, "author_id": true, "created_at": true,
}

// batchAttachment is what a batch says about an attachment it creates.
type batchAttachment struct {
	task, note, author, comment, file, sha string
	uploaded                               bool
	size                                   float64
}

type attachmentState struct {
	found        bool
	scope        string
	task, author string
}

// noteAttachment collects the creation fields of attachments in a batch.
func (r *resolver) noteAttachment(op Op) {
	if op.Entity != "attachment" {
		return
	}
	b := r.batchAttachment[op.EntityID]
	if b == nil {
		b = &batchAttachment{}
		r.batchAttachment[op.EntityID] = b
	}
	switch op.Field {
	case "task_id":
		b.task = idValue(op.Value)
	case "note_id":
		b.note = idValue(op.Value)
	case "file_id":
		b.file = idValue(op.Value)
	case "sha256":
		b.sha = idValue(op.Value)
	case "uploaded_at":
		b.uploaded = string(op.Value) != "null"
	case "author_id":
		b.author = idValue(op.Value)
	case "comment_id":
		b.comment = idValue(op.Value)
	case "size":
		_ = json.Unmarshal(op.Value, &b.size)
	}
}

// attachment looks an attachment up in every scope (once per batch,
// entity-id-ownership).
func (r *resolver) attachment(id string) (*attachmentState, error) {
	if st, ok := r.attachments[id]; ok {
		return st, nil
	}
	st := &attachmentState{}
	var err error
	if st.found, st.scope, st.task, st.author, err = r.pairHome("attachment", id, "task_id", "author_id"); err != nil {
		return nil, err
	}
	r.attachments[id] = st
	return st, nil
}

// resolveAttachment places an attachment op in its task's scope and applies the
// rules above.
func (r *resolver) resolveAttachment(op Op) (scope, reason string, err error) {
	// Only the server says a file is stored; a device may create the row with null,
	// or a copy of a stored file with its time (note-attachments D3, checked below).
	if op.Field == "uploaded_at" && !IsServerDevice(op.Device) && string(op.Value) != "null" {
		if b := r.batchAttachment[op.EntityID]; b == nil || b.file == "" {
			return "", ReasonForbidden, nil
		}
		if st, err := r.attachment(op.EntityID); err != nil || st.found {
			return "", ReasonForbidden, err
		}
	}
	st, err := r.attachment(op.EntityID)
	if err != nil {
		return "", "", err
	}
	if st.found {
		if st.scope == "" {
			return "", ReasonForbidden, nil
		}
		switch {
		case op.Field == "uploaded_at":
		case op.Field == "deleted_at":
			role := r.acc.roleIn(st.scope)
			if st.author != r.acc.userID && role != RoleOwner && role != RoleAdmin {
				return "", ReasonForbidden, nil
			}
			if over, err := r.restoreOverQuota(op, st); err != nil || over {
				return "", ReasonQuotaExceeded, err
			}
		case op.Field == "name":
			if st.author != r.acc.userID {
				return "", ReasonForbidden, nil
			}
		case attachmentImmutable[op.Field]:
			// Only a repeat of the stored value is harmless (task and author are the
			// ones the lookup knows); anything else would rewrite a fixed field.
			if !(op.Field == "task_id" && idValue(op.Value) == st.task) && !(op.Field == "author_id" && idValue(op.Value) == st.author) &&
				!(op.Field == "note_id" && st.task == "" && idValue(op.Value) != "" && r.storedAttachmentNote(st.scope, op.EntityID) == idValue(op.Value)) {
				return "", ReasonForbidden, nil
			}
		}
		return st.scope, "", nil
	}
	b := r.batchAttachment[op.EntityID]
	// One parent: a task, or a standalone note (note-attachments D1).
	if b == nil || (b.task == "") == (b.note == "") || b.author != r.acc.userID || (b.note != "" && b.comment != "") {
		return "", ReasonForbidden, nil
	}
	if (op.Field == "author_id" && idValue(op.Value) != b.author) || (op.Field == "task_id" && idValue(op.Value) != b.task) || (op.Field == "note_id" && idValue(op.Value) != b.note) {
		return "", ReasonForbidden, nil
	}
	if r.attachmentLimit > 0 && b.size > float64(r.attachmentLimit) {
		return "", ReasonTooLarge, nil
	}
	if b.file != "" {
		if reason, err := r.checkSharedFile(b); err != nil || reason != "" {
			return "", reason, err
		}
	}
	if b.note != "" {
		// The note's scope, viewers included (D2).
		scope, err := r.scopeOfChild("note", b.note)
		if err != nil {
			return "", "", err
		}
		if scope == "" || !r.acc.canSee(scope) {
			return "", ReasonForbidden, nil
		}
		if _, found, err := r.existingChildScope("note", b.note); err != nil {
			return "", "", err
		} else if !found && !r.batchNotes[b.note] {
			return "", ReasonForbidden, nil
		}
		return scope, "", nil
	}
	scope, found, err := r.existingTaskScope(b.task)
	if err != nil {
		return "", "", err
	}
	if !found {
		if !r.batchTasks[b.task] {
			var one int
			err := r.tx.QueryRowContext(r.ctx, `SELECT 1 FROM purges WHERE entity = 'task' AND entity_id = ? LIMIT 1`, b.task).Scan(&one)
			if err == nil {
				return "", reasonDiscard, nil
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return "", "", err
			}
			return "", ReasonForbidden, nil
		}
		if scope, err = r.scopeOfChild("task", b.task); err != nil {
			return "", "", err
		}
	}
	if scope == "" || !r.acc.canSee(scope) {
		return "", ReasonForbidden, nil
	}
	if b.comment != "" {
		// A comment attachment belongs to a comment of the same task by the same author.
		task, author := "", ""
		if nb := r.batchComment[b.comment]; nb != nil {
			task, author = nb.task, nb.author
		} else {
			cs, err := r.comment(b.comment)
			if err != nil {
				return "", "", err
			}
			if !cs.found || cs.scope == "" {
				return "", ReasonForbidden, nil
			}
			task, author = cs.task, cs.author
		}
		if task != b.task || author != r.acc.userID {
			return "", ReasonForbidden, nil
		}
	}
	return scope, "", nil
}

// storedAttachmentNote is the note_id stored for an attachment in scope ("" when none).
func (r *resolver) storedAttachmentNote(scope, id string) string {
	var v sql.NullString
	_ = r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'attachment' AND entity_id = ? AND field = 'note_id'`, scope, id).Scan(&v)
	return idValue(json.RawMessage(v.String))
}

// checkSharedFile allows a row to share another attachment's stored file
// (note-attachments D3) only when the author can see that attachment, it is a
// file of its own (not itself a copy) with the same digest, and, for a copy
// that says it is uploaded, the file is stored.
func (r *resolver) checkSharedFile(b *batchAttachment) (string, error) {
	src, err := r.attachment(b.file)
	if err != nil {
		return "", err
	}
	if !src.found || src.scope == "" || !r.acc.canSee(src.scope) {
		return ReasonForbidden, nil
	}
	field := func(name string) string {
		var v sql.NullString
		_ = r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'attachment' AND entity_id = ? AND field = ?`, src.scope, b.file, name).Scan(&v)
		if !v.Valid {
			return ""
		}
		return v.String
	}
	if idValue(json.RawMessage(field("file_id"))) != "" || b.sha == "" || idValue(json.RawMessage(field("sha256"))) != b.sha {
		return ReasonForbidden, nil
	}
	if up := field("uploaded_at"); b.uploaded && (up == "" || up == "null") {
		return ReasonForbidden, nil
	}
	return "", nil
}

// fileReferenced reports whether an attachment row in any scope still names
// the stored file id: as its own id, or as the file it shares (D3).
func fileReferenced(ctx context.Context, q querier, id string) (bool, error) {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM scope_fields WHERE entity = 'attachment' AND (entity_id = ? OR (field = 'file_id' AND value = ?)) LIMIT 1`, id, QuoteJSON(id)).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// sharedFileOf is the stored file an attachment row shares ("" for its own).
func sharedFileOf(ctx context.Context, q querier, scope, id string) string {
	var v sql.NullString
	_ = q.QueryRowContext(ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'attachment' AND entity_id = ? AND field = 'file_id'`, scope, id).Scan(&v)
	return idValue(json.RawMessage(v.String))
}

// SharedFileCopies lists the attachments that share the stored file id, by
// author (note-attachments D3), so the upload of the original marks them
// uploaded too.
func (s *Service) SharedFileCopies(ctx context.Context, id string) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT f.entity_id, COALESCE((SELECT a.value FROM scope_fields a WHERE a.scope_id = f.scope_id AND a.entity = 'attachment' AND a.entity_id = f.entity_id AND a.field = 'author_id'), '""')
		FROM scope_fields f WHERE f.entity = 'attachment' AND f.field = 'file_id' AND f.value = ?`, QuoteJSON(id))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var cid, author string
		if err := rows.Scan(&cid, &author); err != nil {
			return nil, err
		}
		out[cid] = idValue(json.RawMessage(author))
	}
	return out, rows.Err()
}
