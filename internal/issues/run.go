package issues

import (
	"context"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// run is one poll of one connection in progress.
type run struct {
	w      *Worker
	c      *Connection
	p      Provider
	prog   Progress
	links  map[string]*Link
	labels *LabelIndex
	pages  int
	// newest is the latest issue change seen, the next updated-since cursor.
	newest int64
	// seen collects the keys of a reconciliation listing.
	seen map[string]bool
}

func (r *run) streams() []string {
	if r.c.Filter.Scope == ScopeRepositories {
		return r.c.Filter.Repositories
	}
	return []string{""}
}

// all lists every stream from the stored cursor, page by page, within
// MaxPages. A run that runs out of pages keeps its place and is partial; a
// complete one moves the updated-since cursor and, once a day, reconciles.
func (r *run) all(ctx context.Context) error {
	first := r.prog.SinceMs == 0
	streams := r.streams()
	if r.prog.RepoIndex >= len(streams) {
		r.prog.RepoIndex, r.prog.Page = 0, 0
	}
	for i := r.prog.RepoIndex; i < len(streams); i++ {
		page := 1
		if i == r.prog.RepoIndex && r.prog.Page > 0 {
			page = r.prog.Page
		}
		done, err := r.stream(ctx, i, streams[i], page, r.prog.SinceMs, true)
		if err != nil || !done {
			return err
		}
	}
	r.prog.RepoIndex, r.prog.Page = 0, 0
	r.prog.SinceMs = max(r.prog.SinceMs, r.newest)
	now := r.w.clock().UnixMilli()
	if first {
		// The first run lists every open matching issue: nothing to reconcile.
		r.prog.ReconciledAt = now
		return nil
	}
	if now-r.prog.ReconciledAt >= ReconcileEvery.Milliseconds() && r.pages < MaxPages {
		return r.reconcile(ctx, streams, now)
	}
	return nil
}

// stream reads one listing from page on. done is false when the run ran out of
// pages (the cursor is kept and the run is partial).
func (r *run) stream(ctx context.Context, i int, repo string, page int, since int64, cursor bool) (bool, error) {
	for {
		if r.pages >= MaxPages {
			if cursor {
				r.prog.RepoIndex, r.prog.Page, r.prog.Counts.Partial = i, page, true
			}
			return false, nil
		}
		req := Request{Repo: repo, Page: page, Since: since, All: since > 0, Labels: r.c.Filter.Labels, Login: r.c.AccountLogin}
		if cursor && page == 1 {
			req.ETag = r.prog.ETags[repo]
		}
		r.pages++
		pg, err := r.p.List(ctx, req)
		if err != nil {
			if cursor {
				r.prog.RepoIndex, r.prog.Page = i, page
			}
			return false, err
		}
		if pg.NotModified {
			return true, nil
		}
		if cursor && page == 1 && pg.ETag != "" {
			r.prog.ETags[repo] = pg.ETag
		}
		if err := r.apply(ctx, pg.Issues); err != nil {
			if cursor {
				r.prog.RepoIndex, r.prog.Page = i, page
			}
			return false, err
		}
		if !pg.More {
			return true, nil
		}
		page++
	}
}

// reconcile lists every open matching issue once a day; a linked open issue
// that is not among them no longer matches the filter (unassigned, label
// removed): its task stays as it is and the run counts it as unlinked. A
// listing that does not complete within the page budget marks nothing.
func (r *run) reconcile(ctx context.Context, streams []string, now int64) error {
	r.seen = map[string]bool{}
	for i, repo := range streams {
		done, err := r.stream(ctx, i, repo, 1, 0, false)
		if err != nil {
			return err
		}
		if !done {
			r.seen = nil
			r.prog.ReconciledAt = now
			return nil
		}
	}
	var gone []*Link
	for key, l := range r.links {
		if l.Matched && l.State == Open && !r.seen[key] {
			nl := *l
			nl.Matched = false
			gone = append(gone, &nl)
			r.links[key] = &nl
			r.prog.Counts.Unlinked++
		}
	}
	r.seen = nil
	r.prog.ReconciledAt = now
	return r.w.Store.SaveLinks(ctx, gone)
}

// labelIndex loads the user's labels the first time a page needs them.
func (r *run) labelIndex(ctx context.Context) (*LabelIndex, error) {
	if r.labels == nil {
		list, err := r.w.Sync.List(ctx, r.c.UserID, "label", false)
		if err != nil {
			return nil, err
		}
		r.labels = NewLabelIndex(r.c.UserID, r.c.ID, list)
	}
	return r.labels, nil
}

// apply turns one page of issues into one batch of ops through ApplyStrict and
// records the links of the applied page (design D5, D9).
func (r *run) apply(ctx context.Context, list []Issue) error {
	ts := r.w.Sync.ServerTSAt(r.w.clock().UnixMilli())
	nowMs := r.w.clock().UnixMilli()
	var ops []opsync.Op
	var links []*Link
	var counts RunCounts
	for _, is := range list {
		r.newest = max(r.newest, is.UpdatedAt)
		if r.seen != nil && is.State == Open {
			r.seen[is.Key] = true
		}
		l := r.links[is.Key]
		if !Matches(r.c.Filter, is) {
			if l != nil && l.Matched {
				nl := *l
				nl.Matched = false
				links = append(links, &nl)
				counts.Unlinked++
			}
			continue
		}
		if l == nil && is.State == Closed {
			continue // closed before it was first seen: no task
		}
		var mapped []string
		if r.c.MapLabels {
			ix, err := r.labelIndex(ctx)
			if err != nil {
				return err
			}
			mapped = ix.Resolve(is.Labels, ts, nowMs)
		}
		task, err := r.w.Sync.Get(ctx, r.c.UserID, "task", TaskID(r.c.ID, is.Key))
		if err != nil {
			return err
		}
		nl := &Link{ConnectionID: r.c.ID, IssueKey: is.Key, TaskID: TaskID(r.c.ID, is.Key), Title: is.Title, State: is.State, ClosedAt: is.ClosedAt,
			Labels: mapped, IssueUpdatedMs: is.UpdatedAt, Matched: true}
		switch {
		case l == nil && task == nil:
			ops = append(ops, CreateOps(r.c, is, mapped, ts, nowMs)...)
			counts.Created++
		case l == nil:
			// The task exists but its link was never recorded (a restart
			// between the apply and the link): link it, write nothing.
		default:
			fops, ch := FollowOps(r.c, is, l, task, mapped, ts)
			ops = append(ops, fops...)
			counts.Renamed += b2i(ch.Renamed)
			counts.Completed += b2i(ch.Completed)
			counts.Reopened += b2i(ch.Reopened)
			if !r.c.MapLabels {
				nl.Labels = l.Labels
			}
		}
		links = append(links, nl)
	}
	if r.labels != nil {
		ops = append(r.labels.Take(), ops...)
	}
	if len(ops) > 0 {
		res, err := r.w.Sync.ApplyStrict(ctx, r.c.UserID, ops)
		if err != nil {
			return err
		}
		if res.Applied > 0 {
			r.w.Sync.NotifyApplied(res, Device(r.c.ID))
		}
	}
	if err := r.w.Store.SaveLinks(ctx, links); err != nil {
		return err
	}
	for _, l := range links {
		r.links[l.IssueKey] = l
	}
	c := &r.prog.Counts
	c.Created += counts.Created
	c.Completed += counts.Completed
	c.Reopened += counts.Reopened
	c.Renamed += counts.Renamed
	c.Unlinked += counts.Unlinked
	return nil
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
