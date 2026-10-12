package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Idempotency keys on create (OpenSpec change `agent-ready-cli`, design D5).
//
// POST /api/v1/{collection} with an Idempotency-Key header derives the entity
// id and every op id from (instance salt, user, collection, key). There is no
// key table: the op log is the record, de-duplicated per user by op id, so
// nothing grows besides the entity itself and nothing needs a TTL.
//
//   - The user id is part of the derivation and ops are stored per user
//     (UNIQUE(user_id, op_id)), so one user's key can never name, return or
//     collide with another user's entity.
//   - A replay is recognised only by ops this same user stored under the
//     derived op ids. An entity that merely exists under the derived id (which
//     the per-instance salt makes unguessable anyway) is a conflict, never a
//     replay, so a collaborator cannot plant an entity for someone's key.
//   - Offline-first sync is unaffected: devices never send the header, and the
//     derived ops are ordinary ops that converge by last-writer-wins.

// IdempotencyHeader is the request header; ReplayedHeader marks a replay.
const (
	IdempotencyHeader = "Idempotency-Key"
	ReplayedHeader    = "Idempotent-Replayed"
)

var idempotencyKeyRe = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

// idempotencySaltKey is the settings row holding the per-instance salt.
const idempotencySaltKey = "idempotency.salt"

// volatileOnCreate are the fields a create fills from the clock: a retry
// computes new values, so they never decide between replay and conflict.
var volatileOnCreate = map[string]bool{"created_at": true, "position": true}

// idempotencyKey reads and validates the header. ok is false without one; a
// malformed key is answered with 400 here and reported as handled.
func idempotencyKey(w http.ResponseWriter, r *http.Request) (key string, ok, handled bool) {
	vals := r.Header.Values(IdempotencyHeader)
	if len(vals) == 0 {
		return "", false, false
	}
	key = vals[0]
	if len(vals) > 1 || !idempotencyKeyRe.MatchString(key) {
		writeError(w, http.StatusBadRequest, "invalid_input", "Idempotency-Key: must be 1 to 128 characters of letters, digits and . _ : -")
		return "", false, true
	}
	return key, true, false
}

// loadIdempotencySalt reads, or creates once, the instance's random salt. The
// insert never overwrites, so concurrent first starts agree on one value.
func (s *Server) loadIdempotencySalt(ctx context.Context) error {
	db := s.sync.DB()
	fresh, _ := json.Marshal(ids.Secret(32))
	if _, err := db.ExecContext(ctx, `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO NOTHING`,
		idempotencySaltKey, string(fresh), time.Now().UnixMilli()); err != nil {
		return fmt.Errorf("store idempotency salt: %w", err)
	}
	var raw string
	if err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, idempotencySaltKey).Scan(&raw); err != nil {
		return fmt.Errorf("read idempotency salt: %w", err)
	}
	var salt string
	if json.Unmarshal([]byte(raw), &salt) != nil || salt == "" {
		return fmt.Errorf("read idempotency salt: malformed value")
	}
	s.idemSalt = salt
	return nil
}

// idemEntityID is the entity id of a keyed create by uid in collection.
func (s *Server) idemEntityID(uid, collection, key string) string {
	return ids.NameID("idem", s.idemSalt+"\x00"+uid+"\x00"+collection+"\x00"+key)
}

// idemOpID is the op id of field f of a keyed create.
func idemOpID(entityID, field string) string { return ids.NameID("idem-op", entityID+":"+field) }

// agentRequestID turns a key into the registry's client_request_id for an
// agent token (agenttools adds the user and token ids to the derivation).
func (s *Server) agentRequestID(collection, key string) string {
	sum := sha256.Sum256([]byte(s.idemSalt + "\x00" + collection + "\x00" + key))
	return "rest:" + hex.EncodeToString(sum[:20])
}

type replay int

const (
	replayFresh replay = iota
	replayMatch
	replayConflict
)

// replayState compares a planned create with what this user already stored
// under the derived op ids: nothing stored is a fresh create, the same values
// a replay, anything else (other values, other fields, or an entity under the
// id that this user's derived ops did not create) a conflict.
func (s *Server) replayState(ctx context.Context, uid, entity, id string, planned map[string]json.RawMessage, opID func(field string) string) (replay, error) {
	fields := map[string]bool{}
	for f := range opsync.Schema[entity] {
		fields[f] = true
	}
	for f := range planned {
		fields[f] = true
	}
	byOp := map[string]string{}
	opIDs := make([]string, 0, len(fields))
	for f := range fields {
		oid := opID(f)
		byOp[oid] = f
		opIDs = append(opIDs, oid)
	}
	stored, err := s.storedOpValues(ctx, uid, opIDs)
	if err != nil {
		return replayFresh, err
	}
	if len(stored) == 0 {
		existing, err := s.sync.Get(ctx, uid, entity, id)
		if err != nil {
			return replayFresh, err
		}
		if existing != nil {
			return replayConflict, nil
		}
		return replayFresh, nil
	}
	got := map[string]json.RawMessage{}
	for oid, v := range stored {
		got[byOp[oid]] = v
	}
	for f, v := range planned {
		if volatileOnCreate[f] {
			continue
		}
		if sv, ok := got[f]; !ok || !opsync.SameJSON(sv, v) {
			return replayConflict, nil
		}
	}
	for f := range got {
		if _, ok := planned[f]; !ok && !volatileOnCreate[f] {
			return replayConflict, nil
		}
	}
	return replayMatch, nil
}

// storedOpValues returns the values of this user's ops with the given ids.
func (s *Server) storedOpValues(ctx context.Context, uid string, opIDs []string) (map[string]json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	if len(opIDs) == 0 {
		return out, nil
	}
	args := make([]any, 0, len(opIDs)+1)
	args = append(args, uid)
	for _, id := range opIDs {
		args = append(args, id)
	}
	rows, err := s.sync.DB().QueryContext(ctx, `SELECT op_id, value FROM ops WHERE user_id = ? AND op_id IN (?`+strings.Repeat(",?", len(opIDs)-1)+`)`, args...)
	if err != nil {
		return nil, fmt.Errorf("read keyed ops: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, v string
		if err := rows.Scan(&id, &v); err != nil {
			return nil, err
		}
		out[id] = json.RawMessage(v)
	}
	return out, rows.Err()
}

// writeReplay answers a replayed keyed create: 200, the stored entity (a
// tombstone included) and Idempotent-Replayed. An entity that was purged
// since cannot be replayed and is a conflict.
func (s *Server) writeReplay(w http.ResponseWriter, r *http.Request, entity, id string) {
	e, err := s.sync.Get(r.Context(), userFrom(r.Context()).ID, entity, id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if e == nil {
		writeIdempotencyConflict(w, "this Idempotency-Key was used for an entity that has since been permanently deleted; use a new key")
		return
	}
	if err := s.annotateProjects(r.Context(), entity, e); err != nil {
		s.internal(w, err)
		return
	}
	w.Header().Set(ReplayedHeader, "true")
	writeJSON(w, http.StatusOK, e)
}

func writeIdempotencyConflict(w http.ResponseWriter, msg string) {
	if msg == "" {
		msg = "this Idempotency-Key was already used for a create with different content; nothing was changed (use a new key)"
	}
	writeError(w, http.StatusConflict, "idempotency_conflict", msg)
}
