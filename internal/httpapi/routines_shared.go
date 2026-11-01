package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/OpenTodoApp/opentodo/internal/rules"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines of a shared project (OpenSpec change routines-shared): the REST
// checks that keep a shared routine inside its project (D3), the per-project
// limit (D2) and the annotations naming the run-as person (D4).

// ruleProject reads a rule body's project (or the stored rule's): the
// project id when it is shared, "" for a personal routine. A project that
// does not exist for the user is refused.
func (s *Server) ruleProject(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	pid := idOf(fieldOf(body, existing, "project_id"))
	if pid == "" {
		return "", nil
	}
	live, shared, _, err := s.sync.ProjectStatus(ctx, uid, pid)
	if err != nil {
		return "", err
	}
	if !live {
		return "", invalidRule("project %s does not exist", pid)
	}
	if !shared {
		return "", nil
	}
	return pid, nil
}

// checkRuleLimit refuses a new rule past the limits: 50 personal routines per
// account, 50 routines per shared project (D2).
func (s *Server) checkRuleLimit(ctx context.Context, uid, pid string) error {
	live, err := s.sync.List(ctx, uid, "rule", false)
	if err != nil {
		return err
	}
	shared, err := s.sync.SharedProjects(ctx, uid)
	if err != nil {
		return err
	}
	n := 0
	for _, r := range live {
		rp := idOf(r["project_id"])
		if _, isShared := shared[rp]; !isShared {
			rp = ""
		}
		if rp == pid {
			n++
		}
	}
	if pid != "" && n >= rules.MaxSharedRules {
		return &errRuleConflict{"limit_reached", fmt.Sprintf("at most %d routines per shared project", rules.MaxSharedRules)}
	}
	if pid == "" && n >= rules.MaxRules {
		return &errRuleConflict{"limit_reached", fmt.Sprintf("at most %d rules per account", rules.MaxRules)}
	}
	return nil
}

// errOutsideProject is the refusal of a shared routine that names something
// outside its project.
func errOutsideProject(what string) error {
	return invalidRule("a shared routine acts only in its project: %s", what)
}

// checkSharedRefs keeps a shared routine's trigger, condition and steps
// inside its project (D3): no label (labels are personal), no other project,
// no task of another project, no move out.
func (s *Server) checkSharedRefs(ctx context.Context, uid, pid string, ref refs) error {
	if len(ref.labels) > 0 {
		return invalidRule("a shared routine cannot use labels: labels are personal to each member")
	}
	for _, p := range append(append(slices.Clone(ref.projects), ref.moveTargets...), ref.moveTo) {
		if p != "" && p != pid {
			return errOutsideProject("it names another project")
		}
	}
	for _, id := range ref.tasks {
		t, err := s.sync.Get(ctx, uid, "task", id)
		if err != nil {
			return err
		}
		if t != nil && idOf(t["project_id"]) != pid {
			return errOutsideProject("it names a task of another project")
		}
	}
	if ref.webhook != "" {
		return invalidRule("a shared routine cannot send a webhook: webhooks are personal")
	}
	return nil
}

// sharedTrigger refuses a shared routine's label trigger (labels are personal).
func sharedTrigger(tr ruleval.Trigger) error {
	if tr.LabelID != "" {
		return invalidRule("a shared routine cannot use labels: labels are personal to each member")
	}
	return nil
}

// annotateShared adds to each shared routine the person it runs as and, for
// a pause by someone's edit, who edited it (read-only annotations).
func (s *Server) annotateShared(ctx context.Context, uid string, list []opsync.Entity) {
	if s.rules == nil {
		return
	}
	shared, err := s.sync.SharedProjects(ctx, uid)
	if err != nil {
		return
	}
	var ids []string
	for _, e := range list {
		if e == nil {
			continue
		}
		if _, ok := shared[idOf(e["project_id"])]; ok {
			ids = append(ids, idOf(e["id"]))
		}
	}
	if len(ids) == 0 {
		return
	}
	runAs := s.rules.RunAsOf(ctx, ids)
	states, _ := s.rules.Store.States(ctx, ids)
	var people []string
	for _, id := range ids {
		people = append(people, runAs[id], states[id].PausedBy)
	}
	names := s.sync.UserNames(ctx, people)
	for _, e := range list {
		if e == nil {
			continue
		}
		id := idOf(e["id"])
		if !slices.Contains(ids, id) {
			continue
		}
		e["run_as"] = json.RawMessage("null")
		if u := runAs[id]; u != "" {
			e["run_as"] = jsonRaw(map[string]string{"id": u, "name": names[u]})
		}
		if by := states[id].PausedBy; by != "" && states[id].PausedReason == rules.PausedEditedByOther {
			e["paused_by"] = jsonRaw(map[string]string{"id": by, "name": names[by]})
		}
	}
}

// runAsOf is the user whose AI mode a routine shows: its run-as person when
// shared, else the caller.
func (s *Server) runAsOf(ctx context.Context, uid string, e opsync.Entity) string {
	if s.rules == nil || idOf(e["project_id"]) == "" {
		return uid
	}
	if u := s.rules.RunAsOf(ctx, []string{idOf(e["id"])})[idOf(e["id"])]; u != "" {
		return u
	}
	return uid
}
