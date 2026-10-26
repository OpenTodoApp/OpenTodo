package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// ReasonQuotaExceeded: restoring a removed attachment would take its author
// over the attachment quota (attachment-client-hardening D1).
const ReasonQuotaExceeded = "quota_exceeded"

// SetAttachmentQuota installs the per-account attachment quota in bytes, read
// per batch like the per-file limit; nil or 0 means unlimited. Removing an
// attachment frees its author's quota at once, so restoring one is checked
// against it again: otherwise removing and restoring would store any amount.
func (s *Service) SetAttachmentQuota(quota func() int64) { s.attachmentQuota = quota }

// restoreOverQuota reports whether op restores a removed, uploaded attachment
// whose size no longer fits its author's quota.
func (r *resolver) restoreOverQuota(op Op, st *attachmentState) (bool, error) {
	if r.attachmentQuota <= 0 || op.Field != "deleted_at" || string(op.Value) != "null" {
		return false, nil
	}
	field := func(name string) (string, error) {
		var v string
		err := r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'attachment' AND entity_id = ? AND field = ?`,
			st.scope, op.EntityID, name).Scan(&v)
		if errors.Is(err, sql.ErrNoRows) {
			return "null", nil
		}
		return v, err
	}
	deleted, err := field("deleted_at")
	if err != nil || deleted == "null" {
		return false, err
	}
	uploaded, err := field("uploaded_at")
	if err != nil || uploaded == "null" {
		return false, err
	}
	sizeRaw, err := field("size")
	if err != nil {
		return false, err
	}
	var size int64
	_ = json.Unmarshal([]byte(sizeRaw), &size)
	author, _ := json.Marshal(st.author)
	// The author's live, uploaded attachments in every scope, as the quota counts them.
	var used int64
	err = r.tx.QueryRowContext(r.ctx, `SELECT COALESCE(SUM(CAST(s.value AS INTEGER)), 0) FROM scope_fields s
		JOIN scope_fields a ON a.scope_id = s.scope_id AND a.entity = 'attachment' AND a.entity_id = s.entity_id AND a.field = 'author_id' AND a.value = ?
		JOIN scope_fields u ON u.scope_id = s.scope_id AND u.entity = 'attachment' AND u.entity_id = s.entity_id AND u.field = 'uploaded_at' AND u.value != 'null'
		LEFT JOIN scope_fields d ON d.scope_id = s.scope_id AND d.entity = 'attachment' AND d.entity_id = s.entity_id AND d.field = 'deleted_at'
		WHERE s.entity = 'attachment' AND s.field = 'size' AND (d.value IS NULL OR d.value = 'null')`, string(author)).Scan(&used)
	if err != nil {
		return false, err
	}
	return used+size > r.attachmentQuota, nil
}
