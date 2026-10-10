package e2ee

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
)

// Key record parameters accepted from clients (design D1).
const (
	// KDFPBKDF2SHA256 is PBKDF2-HMAC-SHA-256; a memory-hard function can be added
	// later as kdf 2 without changing the table.
	KDFPBKDF2SHA256 = 1
	MinIterations   = 600_000
	MaxIterations   = 10_000_000
	SaltBytes       = 16
	// WrappedKeyBytes is a 256-bit key wrapped with AES-KW (RFC 3394): 32 + 8.
	WrappedKeyBytes = 40
)

// Errors of the key store, mapped to the API envelope by the HTTP layer.
var (
	// ErrConflict: the version sent is not the stored version + 1 (another device
	// changed or created the record first).
	ErrConflict = errors.New("encryption key record changed")
	// ErrInvalid: the record is malformed.
	ErrInvalid = errors.New("invalid key record")
)

// KeyRecord is the only key material the server holds for an account: wrapped
// keys and derivation parameters, from which content cannot be decrypted
// without the passphrase or the recovery key.
type KeyRecord struct {
	Version             int    `json:"version"`
	KDF                 int    `json:"kdf"`
	Salt                string `json:"salt"`
	Iterations          int    `json:"iterations"`
	WrappedByPassphrase string `json:"wrappedByPassphrase"`
	WrappedByRecovery   string `json:"wrappedByRecovery"`
	CreatedAt           int64  `json:"createdAt"`
	UpdatedAt           int64  `json:"updatedAt"`
}

// Status is the profile's view of an account's encryption.
type Status struct {
	Enabled    bool `json:"enabled"`
	KeyVersion int  `json:"keyVersion"`
}

func b64len(s string) int {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return -1
	}
	return len(b)
}

// Validate checks the shape of a record sent by a client.
func (r KeyRecord) Validate() error {
	switch {
	case r.Version < 1:
		return fmt.Errorf("%w: version must be a positive integer", ErrInvalid)
	case r.KDF != KDFPBKDF2SHA256:
		return fmt.Errorf("%w: kdf must be %d (PBKDF2-SHA-256)", ErrInvalid, KDFPBKDF2SHA256)
	case r.Iterations < MinIterations || r.Iterations > MaxIterations:
		return fmt.Errorf("%w: iterations must be between %d and %d", ErrInvalid, MinIterations, MaxIterations)
	case b64len(r.Salt) != SaltBytes:
		return fmt.Errorf("%w: salt must be %d bytes, base64url without padding", ErrInvalid, SaltBytes)
	case b64len(r.WrappedByPassphrase) != WrappedKeyBytes || b64len(r.WrappedByRecovery) != WrappedKeyBytes:
		return fmt.Errorf("%w: wrapped keys must be %d bytes (AES-KW of a 256-bit key), base64url without padding", ErrInvalid, WrappedKeyBytes)
	}
	return nil
}

// Store reads and writes key records.
type Store struct{ db *sql.DB }

// NewStore wraps the server database.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// Get returns the account's record, or nil when encryption is not enabled.
func (s *Store) Get(ctx context.Context, userID string) (*KeyRecord, error) {
	var r KeyRecord
	err := s.db.QueryRowContext(ctx, `SELECT version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at
		FROM encryption_keys WHERE user_id = ?`, userID).Scan(&r.Version, &r.KDF, &r.Salt, &r.Iterations, &r.WrappedByPassphrase, &r.WrappedByRecovery, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read key record: %w", err)
	}
	return &r, nil
}

// Status reports whether the account has a key record and its version.
func (s *Store) Status(ctx context.Context, userID string) (Status, error) {
	r, err := s.Get(ctx, userID)
	if err != nil || r == nil {
		return Status{}, err
	}
	return Status{Enabled: true, KeyVersion: r.Version}, nil
}

// Enabled reports whether the account encrypts its content.
func (s *Store) Enabled(ctx context.Context, userID string) (bool, error) {
	st, err := s.Status(ctx, userID)
	return st.Enabled, err
}

// Put creates or replaces the record under optimistic concurrency: rec.Version
// must be the stored version + 1 (1 when there is none), otherwise ErrConflict.
// It reports whether the record was created.
func (s *Store) Put(ctx context.Context, userID string, rec KeyRecord, now int64) (KeyRecord, bool, error) {
	if err := rec.Validate(); err != nil {
		return KeyRecord{}, false, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return KeyRecord{}, false, err
	}
	defer tx.Rollback()
	var current int
	var created int64
	err = tx.QueryRowContext(ctx, `SELECT version, created_at FROM encryption_keys WHERE user_id = ?`, userID).Scan(&current, &created)
	exists := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return KeyRecord{}, false, err
	}
	if rec.Version != current+1 {
		return KeyRecord{}, false, ErrConflict
	}
	if !exists {
		created = now
	}
	rec.CreatedAt, rec.UpdatedAt = created, now
	_, err = tx.ExecContext(ctx, `INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET version=excluded.version, kdf=excluded.kdf, salt=excluded.salt, iterations=excluded.iterations,
		wrapped_passphrase=excluded.wrapped_passphrase, wrapped_recovery=excluded.wrapped_recovery, updated_at=excluded.updated_at`,
		userID, rec.Version, rec.KDF, rec.Salt, rec.Iterations, rec.WrappedByPassphrase, rec.WrappedByRecovery, rec.CreatedAt, rec.UpdatedAt)
	if err != nil {
		return KeyRecord{}, false, fmt.Errorf("store key record: %w", err)
	}
	return rec, !exists, tx.Commit()
}

// Delete removes the record. It reports whether one existed.
func (s *Store) Delete(ctx context.Context, userID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM encryption_keys WHERE user_id = ?`, userID)
	if err != nil {
		return false, fmt.Errorf("delete key record: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
