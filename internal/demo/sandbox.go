package demo

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// ---- creation tokens (demo-sandboxes D2) ----

const tokenKeySetting = "demo.token_key"

// loadTokenKey reads the shared signing key, creating it once. INSERT OR IGNORE
// lets two processes starting together agree on the first key written.
func (s *Service) loadTokenKey(ctx context.Context) error {
	db := s.sync.DB()
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	if _, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?, ?, ?)`,
		tokenKeySetting, `"`+hex.EncodeToString(b)+`"`, s.now().UnixMilli()); err != nil {
		return fmt.Errorf("demo token key: %w", err)
	}
	var raw string
	if err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, tokenKeySetting).Scan(&raw); err != nil {
		return fmt.Errorf("demo token key: %w", err)
	}
	key, err := hex.DecodeString(strings.Trim(raw, `"`))
	if err != nil || len(key) < 32 {
		return errors.New("demo token key: stored value is not a 32-byte hex key")
	}
	s.tokenKey = key
	return nil
}

func (s *Service) sign(payload []byte) []byte {
	m := hmac.New(sha256.New, s.tokenKey)
	m.Write(payload)
	return m.Sum(nil)
}

// issueToken returns "<payload>.<mac>", both base64url: payload is a random
// 16-byte nonce followed by the expiry (Unix ms, big endian).
func (s *Service) issueToken() string {
	if s.tokenKey == nil {
		return ""
	}
	payload := make([]byte, 24)
	_, _ = rand.Read(payload[:16])
	binary.BigEndian.PutUint64(payload[16:], uint64(s.now().Add(TokenTTL).UnixMilli()))
	enc := base64.RawURLEncoding
	return enc.EncodeToString(payload) + "." + enc.EncodeToString(s.sign(payload))
}

// checkToken verifies the signature and expiry and returns the nonce and expiry.
func (s *Service) checkToken(token string) (string, int64, error) {
	p, m, ok := strings.Cut(token, ".")
	enc := base64.RawURLEncoding
	payload, err1 := enc.DecodeString(p)
	mac, err2 := enc.DecodeString(m)
	if !ok || err1 != nil || err2 != nil || len(payload) != 24 || s.tokenKey == nil || !hmac.Equal(mac, s.sign(payload)) {
		return "", 0, ErrBadToken
	}
	exp := int64(binary.BigEndian.Uint64(payload[16:]))
	if exp <= s.now().UnixMilli() {
		return "", 0, ErrBadToken
	}
	return hex.EncodeToString(payload[:16]), exp, nil
}

// spendToken records the nonce so the token works once, across processes.
func (s *Service) spendToken(ctx context.Context, nonce string, exp int64) error {
	db := s.sync.DB()
	if _, err := db.ExecContext(ctx, `DELETE FROM demo_token_uses WHERE expires_at <= ?`, s.now().UnixMilli()); err != nil {
		return err
	}
	r, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO demo_token_uses(nonce, expires_at) VALUES(?, ?)`, nonce, exp)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrBadToken
	}
	return nil
}

// ---- creation (demo-sandboxes D1, D3) ----

// AddressHash hashes a client address with this process's salt.
func (s *Service) AddressHash(addr string) string {
	h := sha256.New()
	h.Write(s.salt)
	h.Write([]byte(addr))
	return hex.EncodeToString(h.Sum(nil))[:32]
}

// CreateSandbox checks the creation token and the limits, creates the visitor's
// password-less account and its collaborator, and seeds them through the op
// log. The caller issues the session. addr is the client address; only its
// salted hash is stored.
func (s *Service) CreateSandbox(ctx context.Context, token, addr string) (*auth.User, error) {
	nonce, exp, err := s.checkToken(token)
	if err != nil {
		return nil, err
	}
	me, collab, err := s.reserve(ctx, nonce, exp, s.AddressHash(addr))
	if err != nil {
		return nil, err
	}
	if err := s.seed(opsync.WithoutWriteGuard(ctx), me.ID, collab.ID); err != nil {
		if _, derr := s.deleteWhere(context.WithoutCancel(ctx), `user_id = ?`, me.ID); derr != nil {
			s.log.Error("demo: removing a half-seeded sandbox failed", "err", derr)
		}
		return nil, fmt.Errorf("demo seed: %w", err)
	}
	return me, nil
}

// reserve runs the checks and creates the accounts and the sandbox row under
// createMu, so the live cap holds within this process.
func (s *Service) reserve(ctx context.Context, nonce string, exp int64, addrHash string) (*auth.User, *auth.User, error) {
	s.createMu.Lock()
	defer s.createMu.Unlock()
	db := s.sync.DB()
	if err := s.spendToken(ctx, nonce, exp); err != nil {
		return nil, nil, err
	}
	now := s.now()
	var recent int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM demo_sandboxes WHERE addr_hash = ? AND created_at > ?`,
		addrHash, now.Add(-time.Hour).UnixMilli()).Scan(&recent); err != nil {
		return nil, nil, err
	}
	if recent >= PerAddressPerHour {
		return nil, nil, ErrRateLimited
	}
	if err := s.checkSize(ctx); err != nil {
		return nil, nil, err
	}
	if err := s.makeRoom(ctx); err != nil {
		return nil, nil, err
	}
	tag := randomTag()
	me, err := s.auth.CreatePasswordlessAccount(ctx, "sandbox-"+tag+"@demo.invalid", Name)
	if err != nil {
		return nil, nil, err
	}
	collab, err := s.auth.CreatePasswordlessAccount(ctx, "collab-"+tag+"@demo.invalid", CollaboratorName)
	if err == nil {
		_, err = db.ExecContext(ctx, `INSERT INTO demo_sandboxes(user_id, collaborator_id, created_at, last_active_at, addr_hash, ops_hour_start)
			VALUES(?, ?, ?, ?, ?, ?)`, me.ID, collab.ID, now.UnixMilli(), now.UnixMilli(), addrHash, now.UnixMilli())
	}
	if err != nil {
		ids := []string{me.ID}
		if collab != nil {
			ids = append(ids, collab.ID)
		}
		if derr := s.deleteAccounts(context.WithoutCancel(ctx), ids, ""); derr != nil {
			s.log.Error("demo: removing a half-created sandbox failed", "err", derr)
		}
		return nil, nil, err
	}
	s.touched.Store(me.ID, now.UnixMilli())
	return me, collab, nil
}

// checkSize refuses new sandboxes while the live database content is above the
// threshold, after trying to free space by deleting expired sandboxes.
func (s *Service) checkSize(ctx context.Context) error {
	used, err := s.usedBytes(ctx)
	if err != nil || used <= s.maxDBBytes {
		return err
	}
	if _, err := s.Cleanup(ctx); err != nil {
		return err
	}
	if used, err = s.usedBytes(ctx); err != nil {
		return err
	}
	if used > s.maxDBBytes {
		s.log.Warn("demo: database above the size limit, refusing new sandboxes", "used_bytes", used, "limit_bytes", s.maxDBBytes)
		return ErrBusy
	}
	return nil
}

// usedBytes is the database size without free pages (deleted rows before a
// VACUUM do not count).
func (s *Service) usedBytes(ctx context.Context) (int64, error) {
	db := s.sync.DB()
	var pages, free, size int64
	if err := db.QueryRowContext(ctx, `PRAGMA page_count`).Scan(&pages); err != nil {
		return 0, err
	}
	if err := db.QueryRowContext(ctx, `PRAGMA freelist_count`).Scan(&free); err != nil {
		return 0, err
	}
	if err := db.QueryRowContext(ctx, `PRAGMA page_size`).Scan(&size); err != nil {
		return 0, err
	}
	return (pages - free) * size, nil
}

// makeRoom enforces the live cap: at the cap, the least recently active sandbox
// idle for EvictAfter is deleted; when there is none the demo is busy.
func (s *Service) makeRoom(ctx context.Context) error {
	db := s.sync.DB()
	var live int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM demo_sandboxes`).Scan(&live); err != nil {
		return err
	}
	if live < s.maxSandboxes {
		return nil
	}
	var victim string
	err := db.QueryRowContext(ctx, `SELECT user_id FROM demo_sandboxes WHERE last_active_at < ? ORDER BY last_active_at LIMIT 1`,
		s.now().Add(-EvictAfter).UnixMilli()).Scan(&victim)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrBusy
	}
	if err != nil {
		return err
	}
	_, err = s.deleteWhere(ctx, `user_id = ?`, victim)
	return err
}

func randomTag() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ---- activity and the write budget (demo-sandboxes D3, D4, D7) ----

// Touch records activity of an authenticated account, writing last_active_at at
// most once per TouchInterval per sandbox. Accounts that are not sandboxes are
// left alone.
func (s *Service) Touch(ctx context.Context, userID string) error {
	now := s.now().UnixMilli()
	if v, ok := s.touched.Load(userID); ok && now-v.(int64) < TouchInterval.Milliseconds() {
		return nil
	}
	s.touched.Store(userID, now)
	_, err := s.sync.DB().ExecContext(ctx, `UPDATE demo_sandboxes SET last_active_at = ? WHERE user_id = ? AND last_active_at < ?`,
		now, userID, now-TouchInterval.Milliseconds())
	return err
}

// IsSandbox reports whether userID is a live sandbox account.
func (s *Service) IsSandbox(ctx context.Context, userID string) (bool, error) {
	var one int
	err := s.sync.DB().QueryRowContext(ctx, `SELECT 1 FROM demo_sandboxes WHERE user_id = ?`, userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// Guard returns the write guard to install on the sync service.
func (s *Service) Guard() opsync.WriteGuard { return guard{s} }

type guard struct{ s *Service }

// CheckOp caps op values: notes at MaxNotesBytes, everything else at
// MaxTextBytes (the JSON quotes of a string do not count).
func (g guard) CheckOp(op opsync.Op) error {
	limit := MaxTextBytes
	if op.Entity == "task" && (op.Field == "description" || op.Field == "notes_doc") {
		limit = MaxNotesBytes
	}
	if len(op.Value) > limit+2 {
		return fmt.Errorf("%w: %s.%s is too long for the demo (at most %d KB)", opsync.ErrInvalidOp, op.Entity, op.Field, limit/1024)
	}
	return nil
}

// Charge counts n ops against the sandbox's hourly and total budget inside the
// batch's transaction; refusing rolls the batch back. Accounts without a
// sandbox row (the hidden owner) are not limited here.
func (g guard) Charge(ctx context.Context, tx *sql.Tx, userID string, n int) error {
	var start, hour, total int64
	err := tx.QueryRowContext(ctx, `SELECT ops_hour_start, ops_hour_count, ops_total FROM demo_sandboxes WHERE user_id = ?`, userID).
		Scan(&start, &hour, &total)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	now := g.s.now().UnixMilli()
	if now-start >= time.Hour.Milliseconds() {
		start, hour = now, 0
	}
	if hour+int64(n) > OpsPerHour {
		return fmt.Errorf("%w: this demo sandbox may save at most %d changes per hour; try again later", opsync.ErrWriteLimit, OpsPerHour)
	}
	if total+int64(n) > OpsTotal {
		return fmt.Errorf("%w: this demo sandbox reached its limit of %d changes; start a new sandbox to keep trying", opsync.ErrWriteLimit, OpsTotal)
	}
	_, err = tx.ExecContext(ctx, `UPDATE demo_sandboxes SET ops_hour_start = ?, ops_hour_count = ?, ops_total = ? WHERE user_id = ?`,
		start, hour+int64(n), total+int64(n), userID)
	return err
}

// ---- expiry and deletion (demo-sandboxes D4) ----

// Cleanup deletes every sandbox idle for IdleTimeout or older than MaxLifetime
// and returns how many it deleted.
func (s *Service) Cleanup(ctx context.Context) (int, error) {
	now := s.now()
	return s.deleteWhere(ctx, `last_active_at < ? OR created_at < ?`, now.Add(-IdleTimeout).UnixMilli(), now.Add(-MaxLifetime).UnixMilli())
}

// deleteWhere deletes the sandboxes matching cond (a condition on
// demo_sandboxes), in batches, one transaction per sandbox.
func (s *Service) deleteWhere(ctx context.Context, cond string, args ...any) (int, error) {
	db := s.sync.DB()
	deleted := 0
	for {
		rows, err := db.QueryContext(ctx, `SELECT user_id, collaborator_id FROM demo_sandboxes WHERE `+cond+` LIMIT 100`, args...)
		if err != nil {
			return deleted, err
		}
		var batch [][2]string
		for rows.Next() {
			var p [2]string
			if err := rows.Scan(&p[0], &p[1]); err != nil {
				rows.Close()
				return deleted, err
			}
			batch = append(batch, p)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return deleted, err
		}
		if len(batch) == 0 {
			return deleted, nil
		}
		for _, p := range batch {
			if err := s.deleteAccounts(ctx, []string{p[0], p[1]}, p[0]); err != nil {
				return deleted, err
			}
			deleted++
		}
	}
}

// deleteLegacy deletes the shared accounts of the first demo-mode version.
func (s *Service) deleteLegacy(ctx context.Context) (int, error) {
	var ids []string
	for _, email := range legacyEmails {
		u, err := s.auth.UserByEmail(ctx, email)
		if errors.Is(err, auth.ErrNotFound) {
			continue
		}
		if err != nil {
			return 0, err
		}
		if u.Role == "owner" {
			continue
		}
		ids = append(ids, u.ID)
	}
	if len(ids) == 0 {
		return 0, nil
	}
	return len(ids), s.deleteAccounts(ctx, ids, "")
}

// deleteAccounts removes accounts and everything they hold in one transaction:
// their synced data (personal scopes and the projects they own, with ops,
// fields and memberships), purge markers of those scopes, audit events about
// them, the accounts themselves (sessions, notifications and the other account
// tables cascade) and the sandbox row. No purge markers are written: nobody is
// left who could see the data. Devices of the accounts are woken so their next
// request learns the sandbox expired.
func (s *Service) deleteAccounts(ctx context.Context, userIDs []string, sandbox string) error {
	tx, err := s.sync.DB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	scopes := []any{}
	for _, uid := range userIDs {
		scopes = append(scopes, opsync.PersonalScope(uid))
		rows, err := tx.QueryContext(ctx, `SELECT project_id FROM project_scopes WHERE owner_id = ?`, uid)
		if err != nil {
			return err
		}
		for rows.Next() {
			var pid string
			if err := rows.Scan(&pid); err != nil {
				rows.Close()
				return err
			}
			scopes = append(scopes, opsync.ProjectScope(pid))
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
	}
	for _, uid := range userIDs {
		if _, err := opsync.DeleteAccountData(ctx, tx, uid); err != nil {
			return err
		}
	}
	users := make([]any, len(userIDs))
	for i, u := range userIDs {
		users[i] = u
	}
	in := func(n int) string { return strings.TrimSuffix(strings.Repeat("?,", n), ",") }
	if _, err := tx.ExecContext(ctx, `DELETE FROM purges WHERE scope_id IN (`+in(len(scopes))+`)`, scopes...); err != nil {
		return err
	}
	twice := append(append([]any{}, users...), users...)
	if _, err := tx.ExecContext(ctx, `DELETE FROM audit_events WHERE actor_id IN (`+in(len(users))+`) OR target_id IN (`+in(len(users))+`)`, twice...); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id IN (`+in(len(users))+`)`, users...); err != nil {
		return err
	}
	if sandbox != "" {
		if _, err := tx.ExecContext(ctx, `DELETE FROM demo_sandboxes WHERE user_id = ?`, sandbox); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	for _, uid := range userIDs {
		s.touched.Delete(uid)
	}
	// An open tab of this process syncs at once and gets 401 demo_expired.
	s.sync.NotifyMembership(userIDs)
	return nil
}
