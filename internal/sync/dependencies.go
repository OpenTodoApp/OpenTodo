package sync

import "encoding/json"

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
