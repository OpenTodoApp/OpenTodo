// Package host serves many OpenTodo tenants from one process (OpenSpec
// `multi-tenant-host`): a registry of tenants beside their data directories,
// host-name routing, lazy open and idle close, one scheduler for every
// tenant's background work, per-tenant limits and the operator interface a
// control plane drives. A server without OPENTODO_HOST_URL never builds it.
package host

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
)

// RegistryFile is the host-level registry, beside the tenants directory.
const RegistryFile = "host.db"

// TenantsDir holds one data directory per tenant.
const TenantsDir = "tenants"

// Tenant states.
const (
	StateActive    = "active"
	StateSuspended = "suspended"
	StateDeleted   = "deleted"
)

// TombstoneGrace is how long a deleted tenant's name stays reserved, so a new
// tenant never receives the old one's devices and links (design D7).
const TombstoneGrace = 30 * 24 * time.Hour

// Registry errors.
var (
	ErrNotFound     = errors.New("no such tenant")
	ErrExists       = errors.New("a tenant with this name exists or was deleted recently")
	ErrInvalidName  = errors.New("a tenant name is 1 to 63 lowercase letters, digits and inner hyphens, and not a reserved name")
	ErrInvalidState = errors.New("the tenant is not in a state that allows this")
)

var nameRE = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// reserved names are never tenants: they are common service host names.
var reserved = map[string]bool{"www": true, "api": true, "app": true, "admin": true, "operator": true, "mail": true,
	"smtp": true, "imap": true, "status": true, "static": true, "cdn": true, "docs": true, "help": true, "support": true}

// ValidName reports whether name can be a tenant.
func ValidName(name string) bool { return nameRE.MatchString(name) && !reserved[name] }

// Record is one tenant in the registry.
type Record struct {
	Name      string        `json:"name"`
	State     string        `json:"state"`
	CreatedAt int64         `json:"createdAt"`
	UpdatedAt int64         `json:"updatedAt"`
	DeletedAt *int64        `json:"deletedAt,omitempty"`
	Limits    config.Limits `json:"limits"`
	// LastError is the last failure to open the tenant (a failing migration),
	// reported to the operator; empty once it opens again.
	LastError string `json:"lastError,omitempty"`
	// setupToken guards the tenant's first account (owner-bootstrap).
	setupToken string
}

// Registry is the host-level SQLite database: tenants and the "next due" index.
type Registry struct {
	db  *sql.DB
	now func() time.Time
}

const registrySchema = `
CREATE TABLE IF NOT EXISTS tenants (
  name        TEXT PRIMARY KEY,
  state       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  limits      TEXT NOT NULL DEFAULT '{}',
  setup_token TEXT NOT NULL DEFAULT '',
  last_error  TEXT NOT NULL DEFAULT ''
);
-- One row per tenant and kind of background work: when it is next due (D3).
CREATE TABLE IF NOT EXISTS due (
  tenant TEXT NOT NULL,
  kind   TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (tenant, kind)
);
CREATE INDEX IF NOT EXISTS due_at ON due(at);
PRAGMA user_version = 1;
`

// OpenRegistry opens (creating) the registry in root.
func OpenRegistry(root string, now func() time.Time) (*Registry, error) {
	if now == nil {
		now = time.Now
	}
	db, err := store.OpenFile(filepath.Join(root, RegistryFile))
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(registrySchema); err != nil {
		db.Close()
		return nil, fmt.Errorf("host registry: %w", err)
	}
	return &Registry{db: db, now: now}, nil
}

// Close closes the registry database.
func (r *Registry) Close() error { return r.db.Close() }

func newSetupToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Create registers an active tenant and returns its setup token. A name in
// use, or deleted less than TombstoneGrace ago, is ErrExists.
func (r *Registry) Create(ctx context.Context, name string, limits config.Limits) (Record, error) {
	if !ValidName(name) {
		return Record{}, ErrInvalidName
	}
	raw, _ := json.Marshal(limits)
	now := r.now().UnixMilli()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Record{}, err
	}
	defer tx.Rollback()
	var state string
	var deleted sql.NullInt64
	err = tx.QueryRowContext(ctx, `SELECT state, deleted_at FROM tenants WHERE name = ?`, name).Scan(&state, &deleted)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return Record{}, err
	case state != StateDeleted || !deleted.Valid || now-deleted.Int64 < TombstoneGrace.Milliseconds():
		return Record{}, ErrExists
	}
	rec := Record{Name: name, State: StateActive, CreatedAt: now, UpdatedAt: now, Limits: limits, setupToken: newSetupToken()}
	if _, err := tx.ExecContext(ctx, `INSERT INTO tenants(name,state,created_at,updated_at,limits,setup_token) VALUES(?,?,?,?,?,?)
		ON CONFLICT(name) DO UPDATE SET state=excluded.state, created_at=excluded.created_at, updated_at=excluded.updated_at,
		deleted_at=NULL, limits=excluded.limits, setup_token=excluded.setup_token, last_error=''`,
		name, rec.State, now, now, string(raw), rec.setupToken); err != nil {
		return Record{}, err
	}
	return rec, tx.Commit()
}

const recordColumns = `name, state, created_at, updated_at, deleted_at, limits, setup_token, last_error`

func scanRecord(sc interface{ Scan(...any) error }) (Record, error) {
	var rec Record
	var deleted sql.NullInt64
	var limits string
	if err := sc.Scan(&rec.Name, &rec.State, &rec.CreatedAt, &rec.UpdatedAt, &deleted, &limits, &rec.setupToken, &rec.LastError); err != nil {
		return rec, err
	}
	if deleted.Valid {
		rec.DeletedAt = &deleted.Int64
	}
	_ = json.Unmarshal([]byte(limits), &rec.Limits)
	return rec, nil
}

// Get returns a tenant, including a deleted one's tombstone.
func (r *Registry) Get(ctx context.Context, name string) (Record, error) {
	rec, err := scanRecord(r.db.QueryRowContext(ctx, `SELECT `+recordColumns+` FROM tenants WHERE name = ?`, name))
	if errors.Is(err, sql.ErrNoRows) {
		return rec, ErrNotFound
	}
	return rec, err
}

// List returns every tenant, tombstones included, by name.
func (r *Registry) List(ctx context.Context) ([]Record, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+recordColumns+` FROM tenants ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	for rows.Next() {
		rec, err := scanRecord(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// SetState moves a tenant between active and suspended; from is the state it
// must be in.
func (r *Registry) SetState(ctx context.Context, name, from, to string) error {
	res, err := r.db.ExecContext(ctx, `UPDATE tenants SET state = ?, updated_at = ? WHERE name = ? AND state = ?`, to, r.now().UnixMilli(), name, from)
	if err != nil {
		return err
	}
	return r.affected(ctx, res, name)
}

func (r *Registry) affected(ctx context.Context, res sql.Result, name string) error {
	if n, _ := res.RowsAffected(); n == 1 {
		return nil
	}
	rec, err := r.Get(ctx, name)
	if err != nil {
		return err
	}
	if rec.State == StateDeleted {
		return ErrNotFound
	}
	return ErrInvalidState
}

// MarkDeleted turns a tenant into a tombstone and drops its due entries.
func (r *Registry) MarkDeleted(ctx context.Context, name string) error {
	now := r.now().UnixMilli()
	res, err := r.db.ExecContext(ctx, `UPDATE tenants SET state = ?, deleted_at = ?, updated_at = ?, setup_token = '' WHERE name = ? AND state != ?`,
		StateDeleted, now, now, name, StateDeleted)
	if err != nil {
		return err
	}
	if err := r.affected(ctx, res, name); err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `DELETE FROM due WHERE tenant = ?`, name)
	return err
}

// SetLimits replaces a tenant's limit overrides.
func (r *Registry) SetLimits(ctx context.Context, name string, l config.Limits) error {
	raw, _ := json.Marshal(l)
	res, err := r.db.ExecContext(ctx, `UPDATE tenants SET limits = ?, updated_at = ? WHERE name = ? AND state != ?`, string(raw), r.now().UnixMilli(), name, StateDeleted)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNotFound
	}
	return nil
}

// SetError records (or, with "", clears) the last open failure.
func (r *Registry) SetError(ctx context.Context, name, msg string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE tenants SET last_error = ? WHERE name = ?`, msg, name)
	return err
}

// ---- "next due" index (design D3) ----

// SetDue replaces a tenant's due entries: one time per kind of work.
func (r *Registry) SetDue(ctx context.Context, name string, due map[string]time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM due WHERE tenant = ?`, name); err != nil {
		return err
	}
	for kind, at := range due {
		if _, err := tx.ExecContext(ctx, `INSERT INTO due(tenant, kind, at) VALUES(?,?,?)`, name, kind, at.UnixMilli()); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// DueBefore lists the tenants with work due at or before t, each with its due
// kinds, earliest first, at most limit tenants.
func (r *Registry) DueBefore(ctx context.Context, t time.Time, limit int) (map[string][]string, []string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT d.tenant, d.kind FROM due d JOIN tenants t ON t.name = d.tenant
		WHERE d.at <= ? AND t.state = ? ORDER BY d.at`, t.UnixMilli(), StateActive)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	kinds := map[string][]string{}
	var order []string
	for rows.Next() {
		var name, kind string
		if err := rows.Scan(&name, &kind); err != nil {
			return nil, nil, err
		}
		if _, seen := kinds[name]; !seen {
			if len(order) == limit {
				continue
			}
			order = append(order, name)
		}
		kinds[name] = append(kinds[name], kind)
	}
	return kinds, order, rows.Err()
}

// NextDue is the earliest due entry of an active tenant; ok is false when none.
func (r *Registry) NextDue(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	err := r.db.QueryRowContext(ctx, `SELECT MIN(d.at) FROM due d JOIN tenants t ON t.name = d.tenant WHERE t.state = ?`, StateActive).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	return time.UnixMilli(at.Int64), true, nil
}
