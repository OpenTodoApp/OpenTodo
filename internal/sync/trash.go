package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"
)

// Trash and history (OpenSpec change `trash-and-history`).
//
// History is read straight from the op log (design D3). Purge (design D5) is the
// only path that removes data from the log: it deletes an entity's ops, their
// scope labels and its materialized fields, and leaves a purge marker whose seq is
// reserved from the ops sequence, so markers and ops share one cursor space. Purge
// is not an op: an op would live in the log it removes.

// ErrNotDeleted: a purge was requested for an entity that is not in the Trash.
var ErrNotDeleted = errors.New("not deleted")

// Purgeable lists the entities the Trash holds.
var Purgeable = map[string]bool{"task": true, "project": true}

// HistoryPageSize is the default and maximum number of change sets per page.
const HistoryPageSize = 200

// HistoryChange is one field assignment in a change set. From is the field's
// value before it in timestamp order (null for the first value). Lost marks an
// operation that arrived after a newer write to the same field, so it never
// became the stored value under last-writer-wins.
type HistoryChange struct {
	OpID  string          `json:"opId"`
	Field string          `json:"field"`
	From  json.RawMessage `json:"from"`
	To    json.RawMessage `json:"to"`
	Lost  bool            `json:"lost,omitempty"`
}

// ChangeSet groups the operations of one entity that share a timestamp and a
// device: one edit as the user made it. Device is the device id, "server" for
// REST writes. UserID is the author (members of a shared project differ).
type ChangeSet struct {
	TS      int64           `json:"ts"`
	Device  string          `json:"device"`
	UserID  string          `json:"userId"`
	Changes []HistoryChange `json:"changes"`
	// DeviceLabel names a server-side writer for the timeline (additive,
	// mcp-write-tools D6): set by the history route for agent:<token-id>
	// devices, computed when history is read, never stored.
	DeviceLabel string `json:"device_label,omitempty"`
}

// History is one page of an entity's change sets, oldest first. When More is
// set, Before is the value to pass to fetch the previous page.
type History struct {
	Entity     string      `json:"entity"`
	ID         string      `json:"id"`
	ChangeSets []ChangeSet `json:"changeSets"`
	More       bool        `json:"more"`
	Before     int64       `json:"before,omitempty"`
}

type historyOp struct {
	seq    int64
	opID   string
	field  string
	value  string
	ts     int64
	device string
	user   string
	lost   bool
}

// History returns the change sets of one task or project the user can see, in
// timestamp order, only from scopes the user can read. before (exclusive, 0 for
// none) and limit page backwards through time. ErrNotFound when the user can see
// no operation of the entity (unknown, foreign or purged).
func (s *Service) History(ctx context.Context, userID, entity, id string, before int64, limit int) (History, error) {
	h := History{Entity: entity, ID: id, ChangeSets: []ChangeSet{}}
	if !Purgeable[entity] {
		return h, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	if limit <= 0 || limit > HistoryPageSize {
		limit = HistoryPageSize
	}
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return h, err
	}
	scopes := acc.scopes()
	rows, err := s.db.QueryContext(ctx, `SELECT o.seq, o.op_id, o.field, o.value, o.ts, o.device, o.user_id
		FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.entity_id = ? AND o.entity = ? AND s.scope_id IN (`+placeholders(len(scopes))+`) ORDER BY o.seq`,
		append([]any{id, entity}, anys(scopes)...)...)
	if err != nil {
		return h, err
	}
	var ops []historyOp
	for rows.Next() {
		var o historyOp
		if err := rows.Scan(&o.seq, &o.opID, &o.field, &o.value, &o.ts, &o.device, &o.user); err != nil {
			rows.Close()
			return h, err
		}
		// An opaque document (task.notes_doc) is not a readable revision: its
		// projection (description) is in the same change set and is what a user
		// restores (collaborative-rich-text).
		if IsDocField(entity, o.field) {
			continue
		}
		ops = append(ops, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return h, err
	}
	if len(ops) == 0 {
		return h, ErrNotFound
	}
	// Arrival order decides which ops lost: one that arrived after a newer write
	// to its field was never the stored value.
	type clock struct {
		ts     int64
		device string
	}
	best := map[string]clock{}
	for i := range ops {
		o := &ops[i]
		if b, ok := best[o.field]; ok && Wins(b.ts, b.device, o.ts, o.device) {
			o.lost = true
			continue
		}
		best[o.field] = clock{o.ts, o.device}
	}
	sort.SliceStable(ops, func(i, j int) bool {
		if ops[i].ts != ops[j].ts {
			return ops[i].ts < ops[j].ts
		}
		if ops[i].device != ops[j].device {
			return ops[i].device < ops[j].device
		}
		return ops[i].seq < ops[j].seq
	})
	last := map[string]json.RawMessage{}
	var sets []ChangeSet
	for _, o := range ops {
		ch := HistoryChange{OpID: o.opID, Field: o.field, From: last[o.field], To: json.RawMessage(o.value), Lost: o.lost}
		if ch.From == nil {
			ch.From = json.RawMessage("null")
		}
		if !o.lost {
			last[o.field] = json.RawMessage(o.value)
		}
		if n := len(sets); n > 0 && sets[n-1].TS == o.ts && sets[n-1].Device == o.device {
			sets[n-1].Changes = append(sets[n-1].Changes, ch)
			continue
		}
		sets = append(sets, ChangeSet{TS: o.ts, Device: o.device, UserID: o.user, Changes: []HistoryChange{ch}})
	}
	end := len(sets)
	if before > 0 {
		end = sort.Search(len(sets), func(i int) bool { return sets[i].TS >= before })
	}
	start := max(end-limit, 0)
	// Never split one timestamp across pages: `before` is exclusive.
	for start > 0 && sets[start-1].TS == sets[start].TS {
		start--
	}
	h.ChangeSets = sets[start:end]
	if start > 0 {
		h.More = true
		h.Before = sets[start].TS
	}
	return h, nil
}

// PurgeResult reports what a purge removed and whom to tell.
type PurgeResult struct {
	Tasks     int `json:"tasks"`
	Projects  int `json:"projects"`
	Reminders int `json:"reminders"`
	// Sections of purged projects (board-view).
	Sections int `json:"sections"`
	// Custom field definitions of purged projects (custom-fields); additive.
	Fields int `json:"fields"`
	// Comments of purged tasks (comments-and-activity); additive.
	Comments int `json:"comments"`
	// Attachments of purged tasks and removed attachments past retention
	// (attachments D13); additive. Their files are removed after commit.
	Attachments int `json:"attachments"`
	// Time entries of purged tasks (time-tracking); additive.
	TimeEntries int `json:"timeEntries"`
	// Orphans counts files without a row removed by the retention sweep.
	Orphans int `json:"orphans,omitempty"`
	// Audience is every user who could see a purged entity: their devices must sync.
	Audience []string `json:"-"`
}

type purgeTarget struct {
	scope, entity, id string
}

// locate finds the scope a user sees an entity in (the preferred one when the id
// exists in several) and its materialized deleted_at; ok is false when the user
// cannot see the entity at all.
func locate(ctx context.Context, q querier, acc *access, entity, id string) (scope string, deleted bool, ok bool, err error) {
	scopes := acc.scopes()
	rows, err := q.QueryContext(ctx, `SELECT scope_id, COALESCE(MAX(CASE WHEN field = 'deleted_at' THEN value END), 'null')
		FROM scope_fields WHERE entity = ? AND entity_id = ? AND scope_id IN (`+placeholders(len(scopes))+`) GROUP BY scope_id`,
		append([]any{entity, id}, anys(scopes)...)...)
	if err != nil {
		return "", false, false, err
	}
	defer rows.Close()
	bestRank := 99
	for rows.Next() {
		var sc, del string
		if err := rows.Scan(&sc, &del); err != nil {
			return "", false, false, err
		}
		if r := acc.rank(sc); r < bestRank {
			scope, deleted, bestRank = sc, del != "null", r
		}
	}
	return scope, deleted, bestRank != 99, rows.Err()
}

// Purge permanently removes trashed tasks or projects the user may delete
// (design D5). Every id must be visible to the user (ErrNotFound), tombstoned
// (ErrNotDeleted) and deletable with the user's role (ErrForbidden); otherwise
// nothing is removed. Purging a project purges every task referencing it;
// purging a task purges its deleted descendants; reminders of purged tasks go too.
func (s *Service) Purge(ctx context.Context, userID, entity string, ids []string) (PurgeResult, error) {
	if !Purgeable[entity] {
		return PurgeResult{}, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	return s.purgeTx(ctx, userID, func(tx *sql.Tx, acc *access) ([]purgeTarget, error) {
		var targets []purgeTarget
		for _, id := range ids {
			scope, deleted, ok, err := locate(ctx, tx, acc, entity, id)
			if err != nil {
				return nil, err
			}
			if !ok {
				return nil, ErrNotFound
			}
			if !CanWrite(acc.roleIn(scope), entity, "deleted_at") {
				return nil, ErrForbidden
			}
			if !deleted {
				return nil, ErrNotDeleted
			}
			targets = append(targets, purgeTarget{scope, entity, id})
		}
		return targets, nil
	})
}

// PurgeTrash empties the user's Trash: every tombstoned task and project in a
// scope the user can see and is allowed to delete in. Items of shared projects
// the user's role cannot delete are left alone.
func (s *Service) PurgeTrash(ctx context.Context, userID string) (PurgeResult, error) {
	return s.purgeTx(ctx, userID, func(tx *sql.Tx, acc *access) ([]purgeTarget, error) {
		all, err := trashed(ctx, tx, acc.scopes())
		if err != nil {
			return nil, err
		}
		var out []purgeTarget
		for _, t := range all {
			if CanWrite(acc.roleIn(t.scope), t.entity, "deleted_at") {
				out = append(out, t.purgeTarget)
			}
		}
		return out, nil
	})
}

// PurgeExpired is the retention job (design D7): it purges every tombstoned task
// and project, in every scope, whose deletion time is before cutoff.
func (s *Service) PurgeExpired(ctx context.Context, cutoff time.Time) (PurgeResult, error) {
	return s.purgeTx(ctx, "", func(tx *sql.Tx, _ *access) ([]purgeTarget, error) {
		all, err := trashed(ctx, tx, nil)
		if err != nil {
			return nil, err
		}
		var out []purgeTarget
		for _, t := range all {
			if t.deletedAt < cutoff.UnixMilli() {
				out = append(out, t.purgeTarget)
			}
		}
		// Removed attachments keep their file for the retention period, so a removal
		// can be undone from any device (attachments D13).
		removed, err := removedAttachments(ctx, tx, cutoff.UnixMilli())
		if err != nil {
			return nil, err
		}
		return append(out, removed...), nil
	})
}

// removedAttachments lists attachments tombstoned before cutoff (Unix ms).
func removedAttachments(ctx context.Context, q querier, cutoff int64) ([]purgeTarget, error) {
	rows, err := q.QueryContext(ctx, `SELECT scope_id, entity_id, value FROM scope_fields WHERE entity = 'attachment' AND field = 'deleted_at' AND value != 'null'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []purgeTarget
	for rows.Next() {
		var sc, id, value string
		if err := rows.Scan(&sc, &id, &value); err != nil {
			return nil, err
		}
		var ms float64
		if json.Unmarshal([]byte(value), &ms) == nil && ms > 0 && int64(ms) < cutoff {
			out = append(out, purgeTarget{sc, "attachment", id})
		}
	}
	return out, rows.Err()
}

// BlobStore is what the sync service needs from the attachment file store
// (internal/blobs): remove a file, and walk files for the orphan sweep.
type BlobStore interface {
	Remove(id string) error
	Walk(fn func(id string, modified time.Time) error) error
}

// SetBlobStore lets purges remove attachment files after commit (attachments D13).
func (s *Service) SetBlobStore(b BlobStore) { s.blobs = b }

// OrphanAge is how long a file without a row is kept (an upload whose op has not
// arrived yet, or a restore in progress) before the sweep removes it.
const OrphanAge = 7 * 24 * time.Hour

// SweepOrphans removes attachment files older than OrphanAge that no attachment
// row in any scope refers to. Returns how many it removed.
func (s *Service) SweepOrphans(ctx context.Context) (int, error) {
	if s.blobs == nil {
		return 0, nil
	}
	cutoff := s.now().Add(-OrphanAge)
	var orphans []string
	err := s.blobs.Walk(func(id string, modified time.Time) error {
		if modified.After(cutoff) {
			return nil
		}
		var one int
		err := s.db.QueryRowContext(ctx, `SELECT 1 FROM scope_fields WHERE entity = 'attachment' AND entity_id = ? LIMIT 1`, id).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			orphans = append(orphans, id)
			return nil
		}
		return err
	})
	if err != nil {
		return 0, err
	}
	for _, id := range orphans {
		if err := s.blobs.Remove(id); err != nil {
			return 0, err
		}
	}
	return len(orphans), nil
}

// RetentionInterval is how often the retention job runs after its startup pass.
const RetentionInterval = 24 * time.Hour

// RetentionPass purges everything that has been in the Trash for more than days
// (design D7) and wakes the devices that could see it. days <= 0 does nothing.
func (s *Service) RetentionPass(ctx context.Context, days int) (PurgeResult, error) {
	if days <= 0 {
		return PurgeResult{}, nil
	}
	res, err := s.PurgeExpired(ctx, s.now().Add(-time.Duration(days)*24*time.Hour))
	if err != nil {
		return res, err
	}
	s.NotifyMembership(res.Audience)
	if res.Orphans, err = s.SweepOrphans(ctx); err != nil {
		return res, err
	}
	return res, nil
}

// RunRetention runs RetentionPass at startup and every RetentionInterval until
// ctx is done. days <= 0 (OPENTODO_TRASH_RETENTION_DAYS=0) returns immediately.
func (s *Service) RunRetention(ctx context.Context, days int, log *slog.Logger) {
	if days <= 0 {
		return
	}
	pass := func() {
		res, err := s.RetentionPass(ctx, days)
		if err != nil {
			if ctx.Err() == nil {
				log.Error("trash retention failed", "err", err)
			}
			return
		}
		if res.Tasks+res.Projects+res.Attachments+res.Orphans > 0 {
			log.Info("trash retention purged items", "tasks", res.Tasks, "projects", res.Projects, "attachments", res.Attachments, "orphan_files", res.Orphans, "days", days)
		}
	}
	pass()
	t := time.NewTicker(RetentionInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			pass()
		}
	}
}

type trashedEntity struct {
	purgeTarget
	deletedAt int64
}

// trashed lists tombstoned tasks and projects in the given scopes (all scopes
// when nil), projects first so their cascades run before single tasks.
func trashed(ctx context.Context, q querier, scopes []string) ([]trashedEntity, error) {
	query := `SELECT scope_id, entity, entity_id, value FROM scope_fields WHERE field = 'deleted_at' AND entity IN ('project','task') AND value != 'null'`
	var args []any
	if scopes != nil {
		query += ` AND scope_id IN (` + placeholders(len(scopes)) + `)`
		args = anys(scopes)
	}
	rows, err := q.QueryContext(ctx, query+` ORDER BY entity = 'task', scope_id, entity_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []trashedEntity
	for rows.Next() {
		var t trashedEntity
		var value string
		if err := rows.Scan(&t.scope, &t.entity, &t.id, &value); err != nil {
			return nil, err
		}
		var ms float64
		if json.Unmarshal([]byte(value), &ms) != nil || ms <= 0 {
			continue
		}
		t.deletedAt = int64(ms)
		out = append(out, t)
	}
	return out, rows.Err()
}

// purgeTx resolves the targets inside one transaction, expands cascades, removes
// the data and writes the markers. actor is "" for the retention job.
func (s *Service) purgeTx(ctx context.Context, actor string, pick func(tx *sql.Tx, acc *access) ([]purgeTarget, error)) (PurgeResult, error) {
	var res PurgeResult
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer tx.Rollback()
	var acc *access
	if actor != "" {
		if acc, err = loadAccess(ctx, tx, actor); err != nil {
			return res, err
		}
	}
	targets, err := pick(tx, acc)
	if err != nil {
		return res, err
	}
	all, err := expandPurge(ctx, tx, targets)
	if err != nil {
		return res, err
	}
	now := s.now().UnixMilli()
	touched := map[string]bool{}
	var purgedFiles []string
	for _, t := range all {
		if err := purgeOne(ctx, tx, actor, t, now); err != nil {
			return res, err
		}
		touched[t.scope] = true
		switch t.entity {
		case "task":
			res.Tasks++
		case "project":
			res.Projects++
		case "reminder":
			res.Reminders++
		case "section":
			res.Sections++
		case "field":
			res.Fields++
		case "comment":
			res.Comments++
		case "attachment":
			res.Attachments++
			purgedFiles = append(purgedFiles, t.id)
		case "time_entry":
			res.TimeEntries++
		}
	}
	// CalDAV resource names of purged tasks go in the same transaction
	// (harden-server-edges), unless the task id still lives in another scope.
	for _, t := range all {
		if t.entity != "task" {
			continue
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM caldav_resources WHERE task_id = ?
			AND NOT EXISTS (SELECT 1 FROM scope_fields WHERE entity = 'task' AND entity_id = ?)`, t.id, t.id); err != nil {
			return res, fmt.Errorf("purge caldav resource: %w", err)
		}
	}
	if len(touched) > 0 {
		author := actor
		if author == "" {
			// The retention job has no author; tell everyone who could see the data.
			for sc := range touched {
				if users, err := scopeUsers(ctx, tx, sc); err == nil && len(users) > 0 {
					author = users[0]
					break
				}
			}
		}
		if res.Audience, err = audience(ctx, tx, author, touched); err != nil {
			return res, err
		}
	}
	if err := tx.Commit(); err != nil {
		return res, err
	}
	// Files go only once their rows are gone, unless the id lives on in another scope.
	if s.blobs != nil {
		for _, id := range purgedFiles {
			var one int
			if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM scope_fields WHERE entity = 'attachment' AND entity_id = ? LIMIT 1`, id).Scan(&one); err == nil {
				continue
			}
			_ = s.blobs.Remove(id)
		}
	}
	return res, nil
}

// expandPurge adds the cascades of design D5 and drops duplicates: every task
// referencing a purged project and its sections (same scope), every deleted descendant of a purged
// task (same scope) and every reminder of a purged task (any scope; reminders are
// personal to each member).
func expandPurge(ctx context.Context, tx *sql.Tx, targets []purgeTarget) ([]purgeTarget, error) {
	seen := map[purgeTarget]bool{}
	var out []purgeTarget
	add := func(t purgeTarget) bool {
		if seen[t] {
			return false
		}
		seen[t] = true
		out = append(out, t)
		return true
	}
	var tasks []purgeTarget
	for _, t := range targets {
		if !add(t) {
			continue
		}
		if t.entity == "task" {
			tasks = append(tasks, t)
			continue
		}
		ids, err := taskIDsWhere(ctx, tx, t.scope, "project_id", t.id, false)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if c := (purgeTarget{t.scope, "task", id}); add(c) {
				tasks = append(tasks, c)
			}
		}
		// The project's sections, live or deleted, go with it (board-view).
		sections, err := childIDsWhere(ctx, tx, t.scope, "section", "project_id", t.id, false)
		if err != nil {
			return nil, err
		}
		for _, id := range sections {
			add(purgeTarget{t.scope, "section", id})
		}
		// So do its custom field definitions (custom-fields); the values are
		// task fields and go with the tasks.
		defs, err := childIDsWhere(ctx, tx, t.scope, "field", "project_id", t.id, false)
		if err != nil {
			return nil, err
		}
		for _, id := range defs {
			add(purgeTarget{t.scope, "field", id})
		}
		// Every member's personal preferences for the project (activity-feed D1)
		// go too; each lives in its owner's personal scope.
		prefScopes, err := scopesHolding(ctx, tx, "project_prefs", t.id)
		if err != nil {
			return nil, err
		}
		for _, sc := range prefScopes {
			add(purgeTarget{sc, "project_prefs", t.id})
		}
	}
	// Deleted descendants, breadth first; the seen set stops cycles.
	for i := 0; i < len(tasks); i++ {
		ids, err := taskIDsWhere(ctx, tx, tasks[i].scope, "parent_id", tasks[i].id, true)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if c := (purgeTarget{tasks[i].scope, "task", id}); add(c) {
				tasks = append(tasks, c)
			}
		}
	}
	for _, t := range tasks {
		rows, err := tx.QueryContext(ctx, `SELECT scope_id, entity_id FROM scope_fields WHERE entity = 'reminder' AND field = 'task_id' AND value = ?`,
			QuoteJSON(t.id))
		if err != nil {
			return nil, err
		}
		var rs []purgeTarget
		for rows.Next() {
			var r purgeTarget
			if err := rows.Scan(&r.scope, &r.id); err != nil {
				rows.Close()
				return nil, err
			}
			r.entity = "reminder"
			rs = append(rs, r)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		for _, r := range rs {
			add(r)
		}
		// Comments live in their task's scope and go with it (comments-and-activity).
		cids, err := commentIDsOf(ctx, tx, t.scope, t.id)
		if err != nil {
			return nil, err
		}
		for _, id := range cids {
			add(purgeTarget{t.scope, "comment", id})
		}
		// So do attachments, removed or not (attachments D13).
		aids, err := childIDsWhere(ctx, tx, t.scope, "attachment", "task_id", t.id, false)
		if err != nil {
			return nil, err
		}
		for _, id := range aids {
			add(purgeTarget{t.scope, "attachment", id})
		}
		// And time entries, every member's, deleted or not (time-tracking).
		eids, err := childIDsWhere(ctx, tx, t.scope, "time_entry", "task_id", t.id, false)
		if err != nil {
			return nil, err
		}
		for _, id := range eids {
			add(purgeTarget{t.scope, "time_entry", id})
		}
	}
	return out, nil
}

// scopesHolding lists the scopes that hold fields of one entity.
func scopesHolding(ctx context.Context, q querier, entity, id string) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT DISTINCT scope_id FROM scope_fields WHERE entity = ? AND entity_id = ? ORDER BY scope_id`, entity, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sc string
		if err := rows.Scan(&sc); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

// commentIDsOf lists the comments of a task inside a scope.
func commentIDsOf(ctx context.Context, q querier, scope, taskID string) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT entity_id FROM scope_fields WHERE scope_id = ? AND entity = 'comment' AND field = 'task_id' AND value = ? ORDER BY entity_id`,
		scope, QuoteJSON(taskID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// taskIDsWhere lists the tasks of a scope whose reference field (project_id or
// parent_id) equals id, optionally only tombstoned ones.
func taskIDsWhere(ctx context.Context, q querier, scope, field, id string, deletedOnly bool) ([]string, error) {
	return childIDsWhere(ctx, q, scope, "task", field, id, deletedOnly)
}

// childIDsWhere is taskIDsWhere for any entity (sections of a project).
func childIDsWhere(ctx context.Context, q querier, scope, entity, field, id string, deletedOnly bool) ([]string, error) {
	query := `SELECT f.entity_id FROM scope_fields f WHERE f.scope_id = ? AND f.entity = ? AND f.field = ? AND f.value = ?`
	args := []any{scope, entity, field, QuoteJSON(id)}
	if deletedOnly {
		query += ` AND EXISTS (SELECT 1 FROM scope_fields d WHERE d.scope_id = f.scope_id AND d.entity = f.entity AND d.entity_id = f.entity_id AND d.field = 'deleted_at' AND d.value != 'null')`
	}
	rows, err := q.QueryContext(ctx, query+` ORDER BY f.entity_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// purgeOne removes one entity's ops, scope labels and fields inside a scope and
// records its marker.
func purgeOne(ctx context.Context, tx *sql.Tx, actor string, t purgeTarget, now int64) error {
	rows, err := tx.QueryContext(ctx, `SELECT o.seq FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.entity_id = ? AND o.entity = ? AND s.scope_id = ?`, t.id, t.entity, t.scope)
	if err != nil {
		return err
	}
	var seqs []any
	for rows.Next() {
		var seq int64
		if err := rows.Scan(&seq); err != nil {
			rows.Close()
			return err
		}
		seqs = append(seqs, seq)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for len(seqs) > 0 {
		n := min(len(seqs), 500)
		chunk := seqs[:n]
		seqs = seqs[n:]
		if _, err := tx.ExecContext(ctx, `DELETE FROM ops WHERE seq IN (`+placeholders(n)+`)`, chunk...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM op_scopes WHERE seq IN (`+placeholders(n)+`)`, chunk...); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ?`, t.scope, t.entity, t.id); err != nil {
		return err
	}
	seq, err := reserveSeq(ctx, tx)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO purges(seq, user_id, scope_id, entity, entity_id, purged_at) VALUES(?,?,?,?,?,?)`,
		seq, actor, t.scope, t.entity, t.id, now)
	return err
}

// reserveSeq takes the next number of the ops sequence without inserting an op,
// so a purge marker sorts among ops for cursors. SQLite hands out
// max(sqlite_sequence, max rowid) + 1 to the next AUTOINCREMENT insert.
func reserveSeq(ctx context.Context, tx *sql.Tx) (int64, error) {
	if _, err := tx.ExecContext(ctx, `INSERT INTO sqlite_sequence(name, seq) SELECT 'ops', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'ops')`); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE sqlite_sequence SET seq = MAX(seq, (SELECT COALESCE(MAX(seq),0) FROM ops), (SELECT COALESCE(MAX(seq),0) FROM purges)) + 1 WHERE name = 'ops'`); err != nil {
		return 0, err
	}
	var seq int64
	err := tx.QueryRowContext(ctx, `SELECT seq FROM sqlite_sequence WHERE name = 'ops'`).Scan(&seq)
	return seq, err
}

// purgeChecker answers "was this entity purged?" for the ops of one batch.
type purgeChecker struct {
	ctx   context.Context
	q     querier
	acc   *access
	cache map[string]bool
}

// purged reports whether a marker exists for the entity in a scope the author can
// see (or one the author purged): such ops are discarded so a stale device cannot
// resurrect the entity (design D5 rule 2).
func (p *purgeChecker) purged(entity, id string) (bool, error) {
	key := entity + "\x00" + id
	if v, ok := p.cache[key]; ok {
		return v, nil
	}
	scopes := p.acc.scopes()
	var one int
	err := p.q.QueryRowContext(p.ctx, `SELECT 1 FROM purges WHERE entity_id = ? AND entity = ? AND (user_id = ? OR scope_id IN (`+placeholders(len(scopes))+`)) LIMIT 1`,
		append([]any{id, entity, p.acc.userID}, anys(scopes)...)...).Scan(&one)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	p.cache[key] = err == nil
	return err == nil, nil
}

// PurgedEntity is one purge marker as the sync response reports it.
type PurgedEntity struct {
	Entity   string `json:"entity"`
	EntityID string `json:"entityId"`
}

// purgedSince lists the markers of the given scopes with after < seq <= upto
// (upto 0 = no upper bound) and the highest seq among them.
func purgedSince(ctx context.Context, q querier, scopes []string, after, upto int64) ([]PurgedEntity, int64, error) {
	query := `SELECT seq, entity, entity_id FROM purges WHERE scope_id IN (` + placeholders(len(scopes)) + `) AND seq > ?`
	args := append(anys(scopes), after)
	if upto > 0 {
		query += ` AND seq <= ?`
		args = append(args, upto)
	}
	rows, err := q.QueryContext(ctx, query+` ORDER BY seq`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []PurgedEntity
	var top int64
	for rows.Next() {
		var p PurgedEntity
		var seq int64
		if err := rows.Scan(&seq, &p.Entity, &p.EntityID); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
		top = seq
	}
	return out, top, rows.Err()
}
