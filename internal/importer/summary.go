package importer

import (
	"context"
	"encoding/json"
	"slices"
)

// Summary events (OpenSpec change `harden-server-edges`). An import writes
// through the op log like any client, but outbound webhooks do not turn its ops
// into one event per task: each finished job and each undo is reported once,
// as a Summary handed to the observer installed with SetSummaryObserver.
const (
	EventCompleted = "import.completed"
	EventUndone    = "import.undone"
)

// Summary describes one finished import job or one undo.
type Summary struct {
	UserID  string
	JobID   string
	Event   string // EventCompleted or EventUndone
	Format  string
	Status  string // the job's status after the run: done, failed or undone
	Message string
	Totals  Totals
	// Counts maps entity kind -> action (created, updated or deleted) -> number
	// of entities written by this run.
	Counts map[string]map[string]int
	// ProjectIDs lists, sorted, the projects the run wrote or wrote tasks into.
	ProjectIDs []string
}

// SetSummaryObserver installs the post-run observer (nil removes it). Call it
// during wiring, before the service handles requests. It runs on the job's
// goroutine after the job's final state is stored and must be quick.
func (s *Service) SetSummaryObserver(fn func(context.Context, Summary)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onSummary = fn
}

func (s *Service) emit(ctx context.Context, sum Summary) {
	s.mu.Lock()
	fn := s.onSummary
	s.mu.Unlock()
	if fn == nil {
		return
	}
	if sum.Counts == nil {
		sum.Counts = map[string]map[string]int{}
	}
	if sum.ProjectIDs == nil {
		sum.ProjectIDs = []string{}
	}
	fn(ctx, sum)
}

// tally accumulates a run's counts and touched projects.
type tally struct {
	counts   map[string]map[string]int
	projects map[string]bool
}

func newTally() *tally {
	return &tally{counts: map[string]map[string]int{}, projects: map[string]bool{}}
}

func (t *tally) count(entity, action string) {
	if t.counts[entity] == nil {
		t.counts[entity] = map[string]int{}
	}
	t.counts[entity][action]++
}

func (t *tally) project(id string) {
	if id != "" {
		t.projects[id] = true
	}
}

// add records one written import change.
func (t *tally) add(c change) {
	action := "updated"
	if c.created {
		action = "created"
	}
	t.count(c.entity, action)
	switch c.entity {
	case KindProject:
		t.project(c.id)
	case KindTask:
		for _, f := range c.fields {
			if f.name == "project_id" {
				var id string
				if json.Unmarshal(f.value, &id) == nil {
					t.project(id)
				}
			}
		}
	}
}

func (t *tally) projectIDs() []string {
	out := make([]string, 0, len(t.projects))
	for id := range t.projects {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}
