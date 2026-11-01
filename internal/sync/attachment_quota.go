package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
	gosync "sync"
)

// ReasonQuotaExceeded: restoring a removed attachment would take its author
// over the attachment quota (attachment-client-hardening D1).
const ReasonQuotaExceeded = "quota_exceeded"

// SetAttachmentQuota installs the per-account attachment quota in bytes, read
// per batch like the per-file limit; nil or 0 means unlimited. Removing an
// attachment frees its author's quota at once, so restoring one is checked
// against it again: otherwise removing and restoring would store any amount.
func (s *Service) SetAttachmentQuota(quota func() int64) { s.attachmentQuota = quota }

// QuotaHolds is the one ledger of attachment bytes held against each
// account's quota while they are not yet counted in the stored rows: an upload
// in progress (held by the upload route until its handler ends) and a restore
// in an uncommitted batch (held by Apply until the batch commits or rolls
// back). Both paths consult it, so a restore and an upload that overlap cannot
// each fit into the same free space (issue #676).
//
// Lock order: mu is a leaf. Nothing that holds it touches the database or
// takes another lock, so it is taken inside the sync transaction (which holds
// the writer connection) and by the upload route alike without a cycle.
//
// Every holder releases only after its bytes are counted in the stored rows
// (an upload after markUploaded committed, a restore after its batch
// committed), and the upload route reads the ledger before it reads the stored
// rows. A held file is therefore always seen at least once, in the ledger or
// in the rows; for a moment it may be seen in both, which only refuses early.
// A restore reads the rows first, inside its transaction: that is safe because
// it holds the one writer connection, so no upload can commit (and then
// release) between its two reads.
type QuotaHolds struct {
	mu   gosync.Mutex
	held map[string]int64
}

// Held reports the bytes held for uid.
func (q *QuotaHolds) Held(uid string) int64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.held[uid]
}

// Hold adds size bytes for uid and returns the bytes now held for uid and a
// release that gives the size back, once.
func (q *QuotaHolds) Hold(uid string, size int64) (held int64, release func()) {
	q.mu.Lock()
	q.add(uid, size)
	held = q.held[uid]
	q.mu.Unlock()
	var once gosync.Once
	return held, func() { once.Do(func() { q.release(uid, size) }) }
}

// holdIf adds size bytes for uid when fits, called with the bytes held for
// uid, says they fit; the check and the hold happen under one lock.
func (q *QuotaHolds) holdIf(uid string, size int64, fits func(held int64) bool) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !fits(q.held[uid]) {
		return false
	}
	q.add(uid, size)
	return true
}

func (q *QuotaHolds) release(uid string, size int64) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.add(uid, -size)
}

func (q *QuotaHolds) add(uid string, size int64) {
	if q.held == nil {
		q.held = map[string]int64{}
	}
	if q.held[uid] += size; q.held[uid] <= 0 {
		delete(q.held, uid)
	}
}

// QuotaHolds is the service's ledger of held attachment bytes.
func (s *Service) QuotaHolds() *QuotaHolds { return s.holds }

// releaseHolds gives back the bytes the batch's restores hold. Apply defers
// it, so it runs after the batch committed or rolled back.
func (r *resolver) releaseHolds() {
	for uid, size := range r.heldByBatch {
		r.holds.release(uid, size)
	}
	r.heldByBatch = nil
}

// restoreOverQuota reports whether op restores a removed, uploaded attachment
// whose size no longer fits its author's quota. One that fits holds its size
// in the ledger until the batch ends, so an upload starting meanwhile counts it.
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
	if r.holds == nil {
		return used+size > r.attachmentQuota, nil
	}
	// The rows read in this transaction already count this batch's earlier
	// restores, so only what others hold is added to them.
	own := r.heldByBatch[st.author]
	fits := r.holds.holdIf(st.author, size, func(held int64) bool { return used+held-own+size <= r.attachmentQuota })
	if fits {
		if r.heldByBatch == nil {
			r.heldByBatch = map[string]int64{}
		}
		r.heldByBatch[st.author] += size
	}
	return !fits, nil
}
