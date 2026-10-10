package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	gosync "sync"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/notify"
)

// Comments (OpenSpec change `comments-and-activity`, design D1/D2). A comment is
// an ordinary entity in the op log that lives in the scope of its task. What is
// special is authorization, checked per op at receipt time:
//
//   - creating needs a task the author can read (viewers included) and an
//     author_id equal to the submitting account;
//   - task_id and author_id never change after creation;
//   - body, mentions, edited_at, parent_id and created_at are the author's alone;
//   - deleted_at may be set by the author, a project admin or the owner;
//   - mentions are filtered to current members of the task's shared project
//     (empty for a personal task) and the filtered value is what is stored.

// ReasonRateLimited: the author created too many comments in the current window
// (design risk "viewer comment spam"); the op is refused, not stored.
const ReasonRateLimited = "rate_limited"

// reasonDiscard marks an op for a comment whose task was purged: it is dropped
// and counted as a duplicate, like ops for purged entities (trash-and-history D5).
const reasonDiscard = "\x00discard"

// Comment creation limit per account (fixed window), applied to the sync and REST
// paths alike. Generous enough for an offline backlog, low enough to stop a flood.
const (
	CommentRateLimit  = 60
	CommentRateWindow = time.Minute
)

// batchComment is what a batch says about a comment it creates.
type batchComment struct {
	task, author string
	limited      int // rate limit decision: 0 not yet taken, 1 allowed, 2 refused
}

// commentState is what the resolver learned about one comment id.
type commentState struct {
	found        bool   // stored before this batch
	scope        string // the stored comment's scope ("" when invisible to the author)
	task, author string
}

// noteComment collects the winning task_id and author_id of comments in a batch,
// so a new comment's ops can be placed and checked whatever their order.
func (r *resolver) noteComment(op Op) {
	if op.Entity != "comment" || (op.Field != "task_id" && op.Field != "author_id") {
		return
	}
	b := r.batchComment[op.EntityID]
	if b == nil {
		b = &batchComment{}
		r.batchComment[op.EntityID] = b
	}
	if op.Field == "task_id" {
		b.task = idValue(op.Value)
	} else {
		b.author = idValue(op.Value)
	}
}

// comment looks a comment up among the author's personal scope and every project
// scope (once per batch).
func (r *resolver) comment(id string) (*commentState, error) {
	if st, ok := r.comments[id]; ok {
		return st, nil
	}
	rows, err := r.tx.QueryContext(r.ctx, `SELECT scope_id, field, value FROM scope_fields
		WHERE entity = 'comment' AND entity_id = ? AND field IN ('task_id','author_id') AND (scope_id = ? OR scope_id LIKE 'project:%')`,
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
	st := &commentState{}
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
	r.comments[id] = st
	return st, nil
}

// resolveComment places a comment op in its task's scope and applies the
// authorship rules of design D2.
func (r *resolver) resolveComment(op Op) (scope, reason string, err error) {
	st, err := r.comment(op.EntityID)
	if err != nil {
		return "", "", err
	}
	if st.found {
		if st.scope == "" {
			return "", ReasonForbidden, nil
		}
		switch op.Field {
		case "author_id":
			if idValue(op.Value) != st.author {
				return "", ReasonForbidden, nil
			}
		case "task_id":
			if idValue(op.Value) != st.task {
				return "", ReasonForbidden, nil
			}
		case "deleted_at":
			role := r.acc.roleIn(st.scope)
			if st.author != r.acc.userID && role != RoleOwner && role != RoleAdmin {
				return "", ReasonForbidden, nil
			}
		default:
			if st.author != r.acc.userID {
				return "", ReasonForbidden, nil
			}
		}
		return st.scope, "", nil
	}
	// A new comment: the batch must name its task and its author, the author must
	// be the submitter, and every op must agree with those values.
	b := r.batchComment[op.EntityID]
	if b == nil || b.task == "" || b.author != r.acc.userID {
		return "", ReasonForbidden, nil
	}
	if (op.Field == "author_id" && idValue(op.Value) != b.author) || (op.Field == "task_id" && idValue(op.Value) != b.task) {
		return "", ReasonForbidden, nil
	}
	scope, found, err := r.existingTaskScope(b.task)
	if err != nil {
		return "", "", err
	}
	if !found {
		if !r.batchTasks[b.task] {
			// A task that was purged takes its late comments with it; one that
			// never existed cannot be commented on.
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
	// One creation per comment counts against the limit, decided at its first op;
	// a refused creation refuses every op of the comment.
	if b.limited == 0 {
		b.limited = 1
		if r.allowComment != nil && !r.allowComment() {
			b.limited = 2
		}
	}
	if b.limited == 2 {
		return "", ReasonRateLimited, nil
	}
	return scope, "", nil
}

// filterMentions keeps the mentioned ids that are current members of a shared
// project scope, without duplicates; a personal scope keeps none. changed reports
// whether the value differs from what was sent.
func (r *resolver) filterMentions(scope string, raw json.RawMessage) (json.RawMessage, bool, error) {
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return raw, false, nil // Validate already refused anything that is not a list
	}
	kept := []string{}
	if scope != r.acc.personal {
		seen := map[string]bool{}
		for _, id := range ids {
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			ok, err := r.canBeAssigned(scope, id)
			if err != nil {
				return nil, false, err
			}
			if ok {
				kept = append(kept, id)
			}
		}
	}
	out, _ := json.Marshal(kept)
	return out, !SameJSON(out, raw), nil
}

// fixedWindow is a per-key fixed-window counter (the same shape as the HTTP
// layer's limiter), used for comment creation.
type fixedWindow struct {
	mu     gosync.Mutex
	limit  int
	window time.Duration
	now    func() time.Time
	hits   map[string]*windowCount
}

type windowCount struct {
	start time.Time
	count int
}

func newFixedWindow(limit int, window time.Duration, now func() time.Time) *fixedWindow {
	return &fixedWindow{limit: limit, window: window, now: now, hits: map[string]*windowCount{}}
}

func (l *fixedWindow) allow(key string) bool {
	if l == nil || l.limit <= 0 {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.hits) > 10000 {
		for k, v := range l.hits {
			if now.Sub(v.start) > l.window {
				delete(l.hits, k)
			}
		}
	}
	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) > l.window {
		l.hits[key] = &windowCount{start: now, count: 1}
		return true
	}
	w.count++
	return w.count <= l.limit
}

// SetCommentRateLimit replaces the per-account comment creation limit (limit <= 0
// disables it). Call it during wiring or in tests.
func (s *Service) SetCommentRateLimit(limit int, window time.Duration) {
	s.commentLimiter = newFixedWindow(limit, window, func() time.Time { return s.now() })
}

// emitMentions hands one notify.Mentioned event per account newly mentioned by
// a comment in a committed batch (design D2, task-assignment D4). Mentions in a
// personal scope were filtered to nothing at receipt; the author is never told.
func (s *Service) emitMentions(ctx context.Context, author string, at int64, changes []Change) {
	if len(s.sinks) == 0 {
		return
	}
	var actorName string
	actorLoaded := false
	for _, c := range changes {
		if c.Entity != "comment" || !strings.HasPrefix(c.ScopeID, "project:") {
			continue
		}
		fc, ok := c.Fields["mentions"]
		if !ok {
			continue
		}
		var before, after []string
		_ = json.Unmarshal(fc.From, &before)
		_ = json.Unmarshal(fc.To, &after)
		had := map[string]bool{}
		for _, id := range before {
			had[id] = true
		}
		if raw := s.rawField(ctx, c.ScopeID, "comment", c.EntityID, "deleted_at"); raw != "" && raw != "null" {
			continue
		}
		taskID := idValue(json.RawMessage(s.rawField(ctx, c.ScopeID, "comment", c.EntityID, "task_id")))
		for _, id := range after {
			if had[id] || id == author {
				continue
			}
			had[id] = true
			if !actorLoaded {
				actorName = s.userName(ctx, author)
				actorLoaded = true
			}
			e := notify.Mentioned{RecipientID: id, ActorID: author, ActorName: actorName, CommentID: c.EntityID, TaskID: taskID, At: at}
			e.TaskTitle = s.stringField(ctx, c.ScopeID, "task", taskID, "title")
			e.ProjectID = strings.TrimPrefix(c.ScopeID, "project:")
			e.ProjectName = s.stringField(ctx, c.ScopeID, "project", e.ProjectID, "name")
			e.Excerpt = excerpt(s.stringField(ctx, c.ScopeID, "comment", c.EntityID, "body"), 140)
			s.sinks.Mentioned(ctx, e)
		}
	}
}

// excerpt shortens s to at most n runes on one line.
func excerpt(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n-1]) + "…"
}

// TaskComments returns the non-deleted comments of a task the user can see, in
// thread order: top-level comments by creation time, each followed by its replies
// in creation time (a reply to a reply belongs to the same thread). Replies whose
// thread starter was deleted keep their place. ErrNotFound when the user cannot
// see the task.
func (s *Service) TaskComments(ctx context.Context, userID, taskID string) ([]Entity, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	scope, _, ok, err := locate(ctx, s.db, acc, "task", taskID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	rows, err := s.db.QueryContext(ctx, `SELECT c.entity_id, c.field, c.value FROM scope_fields c
		WHERE c.scope_id = ? AND c.entity = 'comment' AND c.entity_id IN
		  (SELECT entity_id FROM scope_fields WHERE scope_id = ? AND entity = 'comment' AND field = 'task_id' AND value = ?)`,
		scope, scope, quoteID(taskID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]Entity{}
	for rows.Next() {
		var id, field, value string
		if err := rows.Scan(&id, &field, &value); err != nil {
			return nil, err
		}
		e := byID[id]
		if e == nil {
			e = Entity{"id": json.RawMessage(quoteID(id))}
			byID[id] = e
		}
		e[field] = json.RawMessage(value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	all := make([]Entity, 0, len(byID))
	for _, e := range byID {
		all = append(all, e)
	}
	ordered := ThreadOrder(all)
	out := make([]Entity, 0, len(ordered))
	for _, e := range ordered {
		if !e.Deleted() {
			out = append(out, e)
		}
	}
	return out, nil
}

// ThreadOrder sorts comments into thread order (see TaskComments); it keeps
// deleted comments so callers decide how to show them. Mirrors threadOrder in
// web/src/lib/comments.ts.
func ThreadOrder(list []Entity) []Entity {
	byID := map[string]Entity{}
	for _, e := range list {
		byID[e.str("id")] = e
	}
	// root walks parent links to the thread starter; a missing parent, a parent
	// on another task or a cycle makes the comment its own root.
	root := func(e Entity) string {
		id := e.str("id")
		seen := map[string]bool{id: true}
		cur := e
		for {
			p := cur.str("parent_id")
			pe, ok := byID[p]
			if ok && seen[p] {
				return id // a cycle: the comment starts its own thread
			}
			if p == "" || !ok || pe.str("task_id") != e.str("task_id") {
				return cur.str("id")
			}
			seen[p] = true
			cur = pe
		}
	}
	less := func(a, b Entity) bool {
		if a.number("created_at") != b.number("created_at") {
			return a.number("created_at") < b.number("created_at")
		}
		return a.str("id") < b.str("id")
	}
	threads := map[string][]Entity{}
	var roots []Entity
	for _, e := range list {
		r := root(e)
		if r == e.str("id") {
			roots = append(roots, e)
		} else {
			threads[r] = append(threads[r], e)
		}
	}
	sort.Slice(roots, func(i, j int) bool { return less(roots[i], roots[j]) })
	out := make([]Entity, 0, len(list))
	for _, r := range roots {
		out = append(out, r)
		replies := threads[r.str("id")]
		sort.Slice(replies, func(i, j int) bool { return less(replies[i], replies[j]) })
		out = append(out, replies...)
	}
	return out
}

func (e Entity) str(field string) string {
	var v string
	if raw, ok := e[field]; ok {
		_ = json.Unmarshal(raw, &v)
	}
	return v
}

func quoteID(id string) string {
	b, _ := json.Marshal(id)
	return string(b)
}
