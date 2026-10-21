package agenttools

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Projects kept away from AI assistants (OpenSpec change agent-planning-fields,
// design D9). A row in project_agent_exclusions means the project's own switch
// is on; a sub-project inherits it from the nearest ancestor that has it on.
// It is server state like membership: never an op, never synced, never in the
// export, and it only hides data from assistant surfaces (this registry).

// Exclusion states for the project.agent_access audit event.
const (
	AccessAllowed  = "allowed"
	AccessKeptAway = "kept_away"
)

// Exclusions stores the per-project switch.
type Exclusions struct {
	db  *sql.DB
	now func() time.Time
}

// NewExclusions wires the switch over the database.
func NewExclusions(db *sql.DB) *Exclusions { return &Exclusions{db: db, now: time.Now} }

// own reads every project id whose own switch is on.
func (x *Exclusions) own(ctx context.Context) (map[string]bool, error) {
	rows, err := x.db.QueryContext(ctx, `SELECT project_id FROM project_agent_exclusions`)
	if err != nil {
		return nil, fmt.Errorf("read agent exclusions: %w", err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// KeptAway is a project's state: kept away, and the nearest ancestor it
// inherits from ("" when its own switch decides or it is allowed).
type KeptAway struct {
	KeptAway      bool   `json:"kept_away"`
	InheritedFrom string `json:"-"`
}

// Resolve computes the state of every project in projects (id → parent id):
// kept away when its own switch is on or any ancestor's is; inherited from the
// nearest ancestor that has it on, unless its own switch is on.
func Resolve(own map[string]bool, parents map[string]string) map[string]KeptAway {
	out := make(map[string]KeptAway, len(parents))
	for id := range parents {
		if own[id] {
			out[id] = KeptAway{KeptAway: true}
			continue
		}
		seen := map[string]bool{id: true}
		for p := parents[id]; p != "" && !seen[p]; p = parents[p] {
			seen[p] = true
			if own[p] {
				out[id] = KeptAway{KeptAway: true, InheritedFrom: p}
				break
			}
		}
	}
	return out
}

// For returns the state of every project the user can see.
func (x *Exclusions) For(ctx context.Context, syncSvc *opsync.Service, userID string) (map[string]KeptAway, error) {
	own, err := x.own(ctx)
	if err != nil {
		return nil, err
	}
	if len(own) == 0 {
		return map[string]KeptAway{}, nil
	}
	projects, err := syncSvc.List(ctx, userID, "project", true)
	if err != nil {
		return nil, err
	}
	parents := make(map[string]string, len(projects))
	for _, p := range projects {
		parents[rawStr(p, "id")] = rawStr(p, "parent_id")
	}
	return Resolve(own, parents), nil
}

// Excluded lists the ids of every project kept away for the user.
func (x *Exclusions) Excluded(ctx context.Context, syncSvc *opsync.Service, userID string) ([]string, error) {
	states, err := x.For(ctx, syncSvc, userID)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for id, s := range states {
		if s.KeptAway {
			out = append(out, id)
		}
	}
	return out, nil
}

// Own reports whether the project's own switch is on.
func (x *Exclusions) Own(ctx context.Context, projectID string) (bool, error) {
	var one int
	err := x.db.QueryRowContext(ctx, `SELECT 1 FROM project_agent_exclusions WHERE project_id = ?`, projectID).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read agent exclusion: %w", err)
	}
	return true, nil
}

// Set changes the project's own switch and, when it changes, records
// project.agent_access in the same transaction.
func (x *Exclusions) Set(ctx context.Context, actorID, projectID string, keptAway bool, rec *audit.Recorder) error {
	tx, err := x.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var one int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM project_agent_exclusions WHERE project_id = ?`, projectID).Scan(&one)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("read agent exclusion: %w", err)
	}
	was := err == nil
	if was == keptAway {
		return tx.Commit()
	}
	if keptAway {
		_, err = tx.ExecContext(ctx, `INSERT INTO project_agent_exclusions(project_id, set_by, created_at) VALUES(?,?,?)`, projectID, actorID, x.now().UnixMilli())
	} else {
		_, err = tx.ExecContext(ctx, `DELETE FROM project_agent_exclusions WHERE project_id = ?`, projectID)
	}
	if err != nil {
		return fmt.Errorf("store agent exclusion: %w", err)
	}
	if rec != nil {
		from, to := AccessAllowed, AccessKeptAway
		if !keptAway {
			from, to = to, from
		}
		if err := rec.RecordTx(ctx, tx, audit.ProjectAgentAccess(actorID, projectID, from, to)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Forget removes a purged project's row (design D9: purging removes it).
func (x *Exclusions) Forget(ctx context.Context, projectID string) error {
	_, err := x.db.ExecContext(ctx, `DELETE FROM project_agent_exclusions WHERE project_id = ?`, projectID)
	return err
}
