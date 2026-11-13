package sync

import (
	"context"
	"encoding/json"
	"maps"
	stdsync "sync"
)

// A reach limits what one request may read and write to chosen workspaces
// (OpenSpec change token-workspaces, D2, D3): the workspaces of an API token
// limited to them. It rides on the request's context; reads and ApplyStrict
// without one are unchanged, so the web app, sync and background jobs are not
// affected. Placement follows the workspace partition (partition.go), worked
// out once per request.

type reachKey struct{}

// reach is a request's limit and its placement of the account, built on first use.
type reach struct {
	in    map[string]bool
	order []string
	mu    stdsync.Mutex
	part  *Partition
}

// stale drops the placement after a write, so the request's later reads place
// what it just wrote.
func (r *reach) stale() {
	r.mu.Lock()
	r.part = nil
	r.mu.Unlock()
}

// WithReach limits ctx to workspaces. An empty list reaches nothing.
func WithReach(ctx context.Context, workspaces []string) context.Context {
	r := &reach{in: map[string]bool{}}
	for _, id := range workspaces {
		if !r.in[id] {
			r.in[id] = true
			r.order = append(r.order, id)
		}
	}
	return context.WithValue(ctx, reachKey{}, r)
}

// Reached reports whether ctx is limited to workspaces.
func Reached(ctx context.Context) bool { _, ok := ctx.Value(reachKey{}).(*reach); return ok }

// ReachWorkspaces returns the workspaces ctx is limited to, in the token's
// order, or nil without a reach. The first is where new items go (D3).
func ReachWorkspaces(ctx context.Context) []string {
	r, ok := ctx.Value(reachKey{}).(*reach)
	if !ok {
		return nil
	}
	return append([]string{}, r.order...)
}

func reachOf(ctx context.Context) *reach {
	r, _ := ctx.Value(reachKey{}).(*reach)
	return r
}

// partition places the account's projects and tasks, deleted ones too, read
// without the reach.
func (s *Service) partition(ctx context.Context, r *reach, userID string) (*Partition, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.part != nil {
		return r.part, nil
	}
	p, err := s.buildPartition(ctx, userID)
	if err != nil {
		return nil, err
	}
	r.part = p
	return p, nil
}

// buildPartition reads the placement of the account without the reach,
// deleted projects and tasks included.
func (s *Service) buildPartition(ctx context.Context, userID string) (*Partition, error) {
	base := context.WithoutCancel(context.WithValue(ctx, reachKey{}, nil))
	p := &Partition{Known: map[string]bool{}, Projects: map[string]PartitionProject{}, Tasks: map[string]PartitionTask{}}
	ws, err := s.workspacesAll(base, userID)
	if err != nil {
		return nil, err
	}
	for _, w := range ws {
		p.Known[w.ID] = true
		if w.Default {
			p.Default = w.ID
		}
	}
	projects, err := s.listEntitiesAll(base, userID, "project", true, nil, nil)
	if err != nil {
		return nil, err
	}
	for _, e := range projects {
		p.Projects[e.str("id")] = PartitionProject{WorkspaceID: e.str("workspace_id"), ParentID: e.str("parent_id")}
	}
	tasks, err := s.listEntitiesAll(base, userID, "task", true, nil, nil)
	if err != nil {
		return nil, err
	}
	for _, e := range tasks {
		p.Tasks[e.str("id")] = PartitionTask{WorkspaceID: e.str("workspace_id"), ProjectID: e.str("project_id"), ParentID: e.str("parent_id")}
	}
	return p, nil
}

// reachReadable are entities every reach may read but never write (D2).
var reachReadable = map[string]bool{"user_prefs": true, "theme": true}

// workspaceOf places one entity, "" for an entity outside every workspace
// (frames, slots, places, objectives, memories, reviews, kinds added later).
func workspaceOf(p *Partition, entity string, e Entity) string {
	switch entity {
	case "project":
		return p.Project(e.str("id"))
	case "project_prefs":
		return p.Project(e.str("id"))
	case "task":
		return p.Task(e.str("id"))
	case "section", "field":
		return p.Project(e.str("project_id"))
	case "note", "rule":
		if pid := e.str("project_id"); pid != "" {
			return p.Project(pid)
		}
		return p.Own(e.str("workspace_id"))
	case "label", "view":
		return p.Own(e.str("workspace_id"))
	case "reminder", "comment", "attachment", "time_entry":
		return p.Task(e.str("task_id"))
	}
	return ""
}

// inReach reports whether ctx may read an entity: always without a reach.
func (s *Service) inReach(ctx context.Context, userID, entity string, e Entity) (bool, error) {
	r := reachOf(ctx)
	if r == nil || reachReadable[entity] {
		return true, nil
	}
	p, err := s.partition(ctx, r, userID)
	if err != nil {
		return false, err
	}
	ws := workspaceOf(p, entity, e)
	return ws != "" && r.in[ws], nil
}

// filterReach keeps the entities ctx may read.
func (s *Service) filterReach(ctx context.Context, userID, entity string, list []Entity) ([]Entity, error) {
	if reachOf(ctx) == nil || reachReadable[entity] {
		return list, nil
	}
	out := list[:0:0]
	for _, e := range list {
		ok, err := s.inReach(ctx, userID, entity, e)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, e)
		}
	}
	return out, nil
}

// reachIDs are the ids of one kind ctx may read, deleted ones too.
func (s *Service) reachIDs(ctx context.Context, userID, entity string) (map[string]bool, error) {
	list, err := s.listEntities(ctx, userID, entity, true, nil, nil)
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(list))
	for _, e := range list {
		out[e.str("id")] = true
	}
	return out, nil
}

// Refusals of a write under a reach (token-workspaces D3): an entity outside
// reads as missing; a destination outside is refused.
const (
	ReasonOutOfReach = "out_of_reach"
	ReasonReachLimit = "token_restricted"
)

// checkReach refuses a batch under a reach that touches an entity outside it
// or would leave one outside: each entity is placed as it is now and as the
// batch leaves it, new projects and tasks of the batch included.
func (s *Service) checkReach(ctx context.Context, userID string, ops []Op) error {
	r := reachOf(ctx)
	if r == nil || len(ops) == 0 {
		return nil
	}
	p, err := s.partition(ctx, r, userID)
	if err != nil {
		return err
	}
	type key struct{ entity, id string }
	after := map[key]Entity{}
	first := map[key]Op{}
	var order []key
	for _, op := range ops {
		if reachReadable[op.Entity] {
			return &RejectedError{Op: op, Reason: ReasonReachLimit}
		}
		k := key{op.Entity, op.EntityID}
		e, seen := after[k]
		if !seen {
			cur, err := s.getAll(ctx, userID, op.Entity, op.EntityID)
			if err != nil {
				return err
			}
			if cur != nil && !r.in[workspaceOf(p, op.Entity, cur)] {
				return &RejectedError{Op: op, Reason: ReasonOutOfReach}
			}
			e = Entity{"id": json.RawMessage(QuoteJSON(op.EntityID))}
			for f, v := range cur {
				e[f] = v
			}
			after[k], first[k] = e, op
			order = append(order, k)
		}
		e[op.Field] = op.Value
	}
	// Place the batch's projects and tasks as it leaves them, then every entity.
	part := *p
	part.Projects, part.Tasks = maps.Clone(p.Projects), maps.Clone(p.Tasks)
	for k, e := range after {
		switch k.entity {
		case "project":
			part.Projects[k.id] = PartitionProject{WorkspaceID: e.str("workspace_id"), ParentID: e.str("parent_id")}
		case "task":
			part.Tasks[k.id] = PartitionTask{WorkspaceID: e.str("workspace_id"), ProjectID: e.str("project_id"), ParentID: e.str("parent_id")}
		}
	}
	for _, k := range order {
		if ws := workspaceOf(&part, k.entity, after[k]); !r.in[ws] {
			return &RejectedError{Op: first[k], Reason: ReasonReachLimit}
		}
	}
	return nil
}
