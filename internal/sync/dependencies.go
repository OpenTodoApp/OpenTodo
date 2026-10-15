package sync

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/pixari/opentodo/internal/notify"
)

// Task dependencies (OpenSpec change task-dependencies, design D4, D5).
// task.blocked_by names tasks of the same sharing scope; synced state never holds
// a cycle. The resolver refuses an id stored in another scope (ReasonNotInScope)
// and a list that would close a cycle (ReasonCycle). Unknown ids are accepted: they
// may arrive in a later batch, and cannot be part of a cycle the server can see.
// Completion and deletion are ignored: the graph is structural.

const (
	// ReasonNotInScope: a blocked_by id names a task of another sharing scope.
	ReasonNotInScope = "not_in_scope"
	// ReasonCycle: the blocked_by list would make the task wait for itself.
	ReasonCycle = "cycle"
)

// checkBlockedBy applies the scope and cycle rules to a task's blocked_by op.
// The graph is read from scope_fields inside the transaction, so it already holds
// every op of this batch accepted before this one.
func (r *resolver) checkBlockedBy(op Op, scope string) (string, error) {
	list := idList(op.Value)
	if len(list) == 0 {
		return "", nil
	}
	for _, id := range list {
		other, found, err := r.existingTaskScope(id)
		if err != nil {
			return "", err
		}
		if !found && r.batchTasks[id] {
			if other, err = r.scopeOfChild("task", id); err != nil {
				return "", err
			}
			found = true
		}
		if found && other != scope {
			r.detail = id
			return ReasonNotInScope, nil
		}
	}
	graph, err := r.blockedGraph(scope)
	if err != nil {
		return "", err
	}
	graph[op.EntityID] = list
	for _, id := range list {
		if reaches(graph, []string{id}, op.EntityID) {
			r.detail = id
			return ReasonCycle, nil
		}
	}
	return "", nil
}

// blockedGraph is every task's blocked_by list in scope, as stored now.
func (r *resolver) blockedGraph(scope string) (map[string][]string, error) {
	rows, err := r.tx.QueryContext(r.ctx, `SELECT entity_id, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND field = 'blocked_by'`, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	g := map[string][]string{}
	for rows.Next() {
		var id, value string
		if err := rows.Scan(&id, &value); err != nil {
			return nil, err
		}
		if l := idList(json.RawMessage(value)); len(l) > 0 {
			g[id] = l
		}
	}
	return g, rows.Err()
}

// reaches reports whether target is reachable from any of start along graph edges.
func reaches(graph map[string][]string, start []string, target string) bool {
	seen := map[string]bool{}
	stack := append([]string(nil), start...)
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if id == target {
			return true
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		stack = append(stack, graph[id]...)
	}
	return false
}

// emitUnblocked hands one notify.Unblocked event per task that a committed batch
// made ready to start: a task whose blocker was completed, that is open and not
// deleted, whose other blockers are all closed, and whose assignee is someone
// other than the author (design D9). Best effort: it reads the stored state and
// can never fail the batch.
func (s *Service) emitUnblocked(ctx context.Context, author string, at int64, changes []Change) {
	if len(s.sinks) == 0 {
		return
	}
	completed := map[string][]string{} // scope -> completed task ids
	for _, c := range changes {
		if c.Entity != "task" {
			continue
		}
		fc, ok := c.Fields["completed_at"]
		if !ok || !isNullRaw(fc.From) || isNullRaw(fc.To) {
			continue
		}
		completed[c.ScopeID] = append(completed[c.ScopeID], c.EntityID)
	}
	if len(completed) == 0 {
		return
	}
	var actorName string
	actorLoaded := false
	done := map[string]bool{}
	for scope, ids := range completed {
		graph, err := s.scopeBlockedGraph(ctx, scope)
		if err != nil || len(graph) == 0 {
			continue
		}
		for _, blocker := range ids {
			for task, list := range graph {
				if done[task] || !containsID(list, blocker) || !s.isOpenTask(ctx, scope, task) {
					continue
				}
				ready := true
				for _, other := range list {
					if other != blocker && s.isOpenTask(ctx, scope, other) {
						ready = false
						break
					}
				}
				assignee := idValue(json.RawMessage(s.rawField(ctx, scope, "task", task, "assignee_id")))
				if !ready || assignee == "" || assignee == author {
					continue
				}
				done[task] = true
				if !actorLoaded {
					actorName = s.userName(ctx, author)
					actorLoaded = true
				}
				e := notify.Unblocked{AssigneeID: assignee, ActorID: author, ActorName: actorName, TaskID: task, BlockerID: blocker, At: at}
				e.TaskTitle = s.stringField(ctx, scope, "task", task, "title")
				e.BlockerTitle = s.stringField(ctx, scope, "task", blocker, "title")
				if pid, ok := strings.CutPrefix(scope, "project:"); ok {
					e.ProjectID = pid
					e.ProjectName = s.stringField(ctx, scope, "project", pid, "name")
				}
				s.sinks.Unblocked(ctx, e)
			}
		}
	}
}

// scopeBlockedGraph reads every non-empty blocked_by list of a scope.
func (s *Service) scopeBlockedGraph(ctx context.Context, scope string) (map[string][]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT entity_id, value FROM scope_fields WHERE scope_id = ? AND entity = 'task' AND field = 'blocked_by'`, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	g := map[string][]string{}
	for rows.Next() {
		var id, value string
		if err := rows.Scan(&id, &value); err != nil {
			return nil, err
		}
		if l := idList(json.RawMessage(value)); len(l) > 0 {
			g[id] = l
		}
	}
	return g, rows.Err()
}

// isOpenTask reports whether a task exists in scope, is not completed and not
// deleted. An unknown task is not open, like on the device.
func (s *Service) isOpenTask(ctx context.Context, scope, id string) bool {
	if s.rawField(ctx, scope, "task", id, "title") == "" && s.rawField(ctx, scope, "task", id, "created_at") == "" {
		return false
	}
	return isNullRaw(json.RawMessage(s.rawField(ctx, scope, "task", id, "completed_at"))) &&
		isNullRaw(json.RawMessage(s.rawField(ctx, scope, "task", id, "deleted_at")))
}

func isNullRaw(v json.RawMessage) bool {
	return len(v) == 0 || string(v) == "null"
}

func containsID(list []string, id string) bool {
	for _, x := range list {
		if x == id {
			return true
		}
	}
	return false
}
