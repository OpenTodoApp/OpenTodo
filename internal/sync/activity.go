package sync

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/pixari/opentodo/internal/activity"
)

// ActivityOps returns the operations the activity log of one task or project is
// derived from (OpenSpec change `comments-and-activity`, design D4), in seq
// order, each with its Actor. Like History (trash-and-history D3) it reads the
// op log directly and only from scopes the user can read; it never writes.
//
//   - task: the task's ops and the ops of its comments;
//   - project: in a shared project every task, comment and project op of its
//     scope; in a personal project the project's ops, the ops of the tasks that
//     currently belong to it and of their comments.
//
// ErrNotFound when the user can see no such task or project.
func (s *Service) ActivityOps(ctx context.Context, userID, entity, id string) ([]Op, error) {
	if entity != "task" && entity != "project" {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	scope, _, ok, err := locate(ctx, s.db, acc, entity, id)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	const cols = `SELECT o.seq,o.op_id,o.entity,o.entity_id,o.field,o.value,o.ts,o.device,o.user_id FROM ops o JOIN op_scopes s ON s.seq = o.seq `
	if entity == "project" && strings.HasPrefix(scope, "project:") {
		return s.readOps(ctx, cols+`WHERE s.scope_id = ? AND o.entity IN ('task','project','comment') ORDER BY o.seq`, scope)
	}
	targets := map[string][]string{}
	if entity == "task" {
		targets["task"] = []string{id}
	} else {
		targets["project"] = []string{id}
		if targets["task"], err = taskIDsWhere(ctx, s.db, scope, "project_id", id, false); err != nil {
			return nil, err
		}
	}
	for _, tid := range targets["task"] {
		cids, err := commentIDsOf(ctx, s.db, scope, tid)
		if err != nil {
			return nil, err
		}
		targets["comment"] = append(targets["comment"], cids...)
	}
	var out []Op
	for _, ent := range []string{"project", "task", "comment"} {
		ids := targets[ent]
		for len(ids) > 0 {
			n := min(len(ids), 400)
			chunk := ids[:n]
			ids = ids[n:]
			ops, err := s.readOps(ctx, cols+`WHERE s.scope_id = ? AND o.entity = ? AND o.entity_id IN (`+placeholders(n)+`)`,
				append([]any{scope, ent}, anys(chunk)...)...)
			if err != nil {
				return nil, err
			}
			out = append(out, ops...)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Seq < out[j].Seq })
	return out, nil
}

// FeedReader reads the ops the activity feed is derived from (OpenSpec change
// `activity-feed`, design D4; paging per `server-query-costs`): every task,
// comment and project op of each shared project the user is a member of, one
// entity at a time, newest entity first. Personal data never appears.
//
// The events of an entity depend only on that entity's own ops (the activity
// rule groups, compares and labels per entity), so an entity's whole history
// read at once yields exactly its events, wherever the others are. Entities
// are ordered by their latest op at or before upTo; every event at or before
// upTo starts at one of its entity's ops, so once the entities whose latest op
// is at or after a bound are read, every event from bound to upTo is known.
// Opaque document fields (activity.Opaque, e.g. task.notes_doc), which the rule
// ignores, are never read.
type FeedReader struct {
	s    *Service
	ents []feedEntity // newest latest op first
	next int
}

type feedEntity struct {
	project, entity, id string
	latest              int64
}

// opaqueFilter is the SQL condition that leaves out the opaque fields.
func opaqueFilter() (string, []any) {
	keys := make([]string, 0, len(activity.Opaque))
	for k := range activity.Opaque {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var cond strings.Builder
	var args []any
	for _, k := range keys {
		entity, field, _ := strings.Cut(k, ".")
		cond.WriteString(` AND NOT (o.entity = ? AND o.field = ?)`)
		args = append(args, entity, field)
	}
	return cond.String(), args
}

// FeedReader lists the feed's entities: of projectID only when it is not empty
// (and none when the user is not a member of it), with their latest op at or
// before upTo.
func (s *Service) FeedReader(ctx context.Context, userID, projectID string, upTo int64) (*FeedReader, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	r := &FeedReader{s: s}
	opaque, opaqueArgs := opaqueFilter()
	for _, pid := range acc.projects {
		if projectID != "" && pid != projectID {
			continue
		}
		rows, err := s.db.QueryContext(ctx, `SELECT o.entity, o.entity_id, MAX(o.ts) FROM ops o JOIN op_scopes s ON s.seq = o.seq
			WHERE s.scope_id = ? AND o.entity IN ('task','project','comment') AND o.ts <= ?`+opaque+` GROUP BY o.entity, o.entity_id`,
			append([]any{ProjectScope(pid), upTo}, opaqueArgs...)...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			e := feedEntity{project: pid}
			if err := rows.Scan(&e.entity, &e.id, &e.latest); err != nil {
				rows.Close()
				return nil, err
			}
			r.ents = append(r.ents, e)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	sort.SliceStable(r.ents, func(i, j int) bool { return r.ents[i].latest > r.ents[j].latest })
	return r, nil
}

// Next reads the whole history (in seq order, opaque fields left out) of at
// least n more entities, and of every other entity whose latest op is at the
// same time as the last of them, grouped by project. Every entity not read yet
// has its latest op before bound; done reports that none is left (bound is then
// math.MinInt64).
func (r *FeedReader) Next(ctx context.Context, n int) (ops map[string][]Op, bound int64, done bool, err error) {
	end := min(r.next+max(n, 1), len(r.ents))
	for end > 0 && end < len(r.ents) && r.ents[end].latest == r.ents[end-1].latest {
		end++
	}
	batch := r.ents[r.next:end]
	r.next = end
	ops = map[string][]Op{}
	ids := map[[2]string][]string{} // (project, entity) -> ids
	var keys [][2]string
	for _, e := range batch {
		k := [2]string{e.project, e.entity}
		if _, ok := ids[k]; !ok {
			keys = append(keys, k)
		}
		ids[k] = append(ids[k], e.id)
	}
	opaque, opaqueArgs := opaqueFilter()
	const cols = `SELECT o.seq,o.op_id,o.entity,o.entity_id,o.field,o.value,o.ts,o.device,o.user_id FROM ops o JOIN op_scopes s ON s.seq = o.seq `
	for _, k := range keys {
		list := ids[k]
		for len(list) > 0 {
			c := min(len(list), 400)
			chunk := list[:c]
			list = list[c:]
			got, err := r.s.readOps(ctx, cols+`WHERE s.scope_id = ? AND o.entity = ? AND o.entity_id IN (`+placeholders(c)+`)`+opaque,
				append(append([]any{ProjectScope(k[0]), k[1]}, anys(chunk)...), opaqueArgs...)...)
			if err != nil {
				return nil, 0, false, err
			}
			ops[k[0]] = append(ops[k[0]], got...)
		}
	}
	for pid := range ops {
		list := ops[pid]
		sort.Slice(list, func(i, j int) bool { return list[i].Seq < list[j].Seq })
	}
	if r.next >= len(r.ents) {
		return ops, math.MinInt64, true, nil
	}
	return ops, batch[len(batch)-1].latest, false, nil
}

func (s *Service) readOps(ctx context.Context, query string, args ...any) ([]Op, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Op
	for rows.Next() {
		op, err := scanOp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, op)
	}
	return out, rows.Err()
}

// UserNames resolves account ids to display names (the name, else the email);
// unknown ids are left out. Used to label activity events.
func (s *Service) UserNames(ctx context.Context, ids []string) map[string]string {
	out := map[string]string{}
	for _, id := range ids {
		if _, done := out[id]; done || id == "" {
			continue
		}
		if n := s.userName(ctx, id); n != "" {
			out[id] = n
		}
	}
	return out
}
