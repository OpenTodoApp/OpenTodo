package sync

import (
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
	"task_id": true, "comment_id": true, "mime": true, "size": true, "sha256": true,
	"url": true, "encrypted": true, "author_id": true, "created_at": true,
}

// batchAttachment is what a batch says about an attachment it creates.
type batchAttachment struct {
	task, author, comment string
	size                  float64
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
	case "author_id":
		b.author = idValue(op.Value)
	case "comment_id":
		b.comment = idValue(op.Value)
	case "size":
		_ = json.Unmarshal(op.Value, &b.size)
	}
}

// attachment looks an attachment up among the author's personal scope and every
// project scope (once per batch).
func (r *resolver) attachment(id string) (*attachmentState, error) {
	if st, ok := r.attachments[id]; ok {
		return st, nil
	}
	rows, err := r.tx.QueryContext(r.ctx, `SELECT scope_id, field, value FROM scope_fields
		WHERE entity = 'attachment' AND entity_id = ? AND field IN ('task_id','author_id') AND (scope_id = ? OR scope_id LIKE 'project:%')`,
		id, r.acc.personal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type vals struct{ task, author string }
	byScope := map[string]*vals{}
	for rows.Next() {
		var sc, field, value string
		if err := rows.Scan(&sc, &field, &value); err != nil {
			return nil, err
		}
		v := byScope[sc]
		if v == nil {
			v = &vals{}
			byScope[sc] = v
		}
		if field == "task_id" {
			v.task = idValue(json.RawMessage(value))
		} else {
			v.author = idValue(json.RawMessage(value))
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	st := &attachmentState{}
	best := 99
	for sc, v := range byScope {
		if rk := r.acc.rank(sc); rk < best {
			best = rk
			st.found, st.scope, st.task, st.author = true, sc, v.task, v.author
		}
	}
	if st.found && !r.acc.canSee(st.scope) {
		st.scope = ""
	}
	r.attachments[id] = st
	return st, nil
}

// resolveAttachment places an attachment op in its task's scope and applies the
// rules above.
func (r *resolver) resolveAttachment(op Op) (scope, reason string, err error) {
	// Only the server says a file is stored; a device may create the row with null.
	if op.Field == "uploaded_at" && op.Device != ServerDevice && string(op.Value) != "null" {
		return "", ReasonForbidden, nil
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
		case op.Field == "name":
			if st.author != r.acc.userID {
				return "", ReasonForbidden, nil
			}
		case attachmentImmutable[op.Field]:
			// Only a repeat of the stored value is harmless (task and author are the
			// ones the lookup knows); anything else would rewrite a fixed field.
			if !(op.Field == "task_id" && idValue(op.Value) == st.task) && !(op.Field == "author_id" && idValue(op.Value) == st.author) {
				return "", ReasonForbidden, nil
			}
		}
		return st.scope, "", nil
	}
	b := r.batchAttachment[op.EntityID]
	if b == nil || b.task == "" || b.author != r.acc.userID {
		return "", ReasonForbidden, nil
	}
	if (op.Field == "author_id" && idValue(op.Value) != b.author) || (op.Field == "task_id" && idValue(op.Value) != b.task) {
		return "", ReasonForbidden, nil
	}
	if r.attachmentLimit > 0 && b.size > float64(r.attachmentLimit) {
		return "", ReasonTooLarge, nil
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
