package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/e2ee"
)

// End-to-end encryption (OpenSpec change `e2ee`, design D8). The server stores
// the wrapped key record and nothing else: no route here receives a passphrase,
// a recovery key, an account key or plaintext. /api/v1/sync is untouched;
// ciphertext is an ordinary string value there.

// MinClientVersion is the oldest web client that understands ciphertext values
// (web/src/lib/e2ee.ts CLIENT_VERSION). The profile carries it so a cached older
// shell asks to reload instead of rendering "enc:v1:…" (design D9).
const MinClientVersion = 1

// purgeNotice is returned by the history purge (design D7).
const purgeNotice = "Superseded content operations were deleted from the server. Backups made before this point, " +
	"and copies of the database taken earlier, may still contain plaintext; delete them if that matters to you."

func (s *Server) registerEncryptionRoutes(mux *routes) {
	mux.handle("GET /api/v1/encryption/keys", signedIn, s.handleGetEncryptionKeys)
	mux.handle("PUT /api/v1/encryption/keys", signedIn.credential().demoDenied(), s.handlePutEncryptionKeys)
	mux.handle("DELETE /api/v1/encryption/keys", signedIn.sensitive().demoDenied(), s.handleDeleteEncryptionKeys)
	mux.handle("POST /api/v1/encryption/purge-history", signedIn.demoDenied(), s.handlePurgeEncryptionHistory)
}

func (s *Server) keys() *e2ee.Store { return e2ee.NewStore(s.sync.DB()) }

// encryptionStatus is the profile's `encryption` field. A failed read reports
// "disabled"; callers that must not guess use encryptionEnabled.
func (s *Server) encryptionStatus(ctx context.Context, userID string) e2ee.Status {
	st, err := s.keys().Status(ctx, userID)
	if err != nil {
		s.log.Error("read encryption status", "err", err)
	}
	return st
}

// encryptionEnabled is for routes that refuse or degrade for encrypted accounts;
// it reports an error instead of guessing.
func (s *Server) encryptionEnabled(ctx context.Context, userID string) (bool, error) {
	return s.keys().Enabled(ctx, userID)
}

func (s *Server) handleGetEncryptionKeys(w http.ResponseWriter, r *http.Request) {
	rec, err := s.keys().Get(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if rec == nil {
		writeError(w, http.StatusNotFound, "encryption_disabled", "end-to-end encryption is not enabled for this account")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": rec})
}

// handlePutEncryptionKeys creates the record (version 1) or replaces it (version
// = stored + 1: passphrase change, recovery reset). Replacing needs a fresh
// re-authentication, like every other credential change; creating does not,
// because it grants nothing and a second device's attempt fails with 409.
func (s *Server) handlePutEncryptionKeys(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var in e2ee.KeyRecord
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", err.Error())
		return
	}
	if err := in.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), e2ee.ErrInvalid.Error()+": "))
		return
	}
	current, err := s.keys().Get(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	// A stale version is a conflict whatever the session: the second device must
	// unlock with the existing passphrase, not re-authenticate.
	if (current == nil && in.Version != 1) || (current != nil && in.Version != current.Version+1) {
		writeError(w, http.StatusConflict, "encryption_conflict", "the encryption key record was created or changed by another device; unlock with the existing passphrase")
		return
	}
	if current != nil {
		if sess := sessionFrom(ctx); sess != nil && !sess.FreshWithin(FreshWindow, s.auth.Now()) {
			writeError(w, http.StatusForbidden, "reauth_required", "confirm your password or a code to continue")
			return
		}
	}
	rec, created, err := s.keys().Put(ctx, uid, in, s.auth.Now().UnixMilli())
	if errors.Is(err, e2ee.ErrConflict) {
		writeError(w, http.StatusConflict, "encryption_conflict", "the encryption key record was created or changed by another device; unlock with the existing passphrase")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	status := http.StatusOK
	out := map[string]any{"keys": rec}
	if created {
		status = http.StatusCreated
		s.audit.Record(ctx, audit.SettingsChanged(uid, "encryption", "disabled", "enabled"))
		// The weekly digest would carry task titles (stats-and-review): turning
		// encryption on turns it off, and the response says so.
		off, err := s.digestStore().Disable(ctx, uid)
		if err != nil {
			s.internal(w, err)
			return
		}
		if off {
			out["digestDisabled"] = true
			s.audit.Record(ctx, audit.SettingsChanged(uid, "email_digest", "on", "off"))
		}
		// Issue polls would write titles and bodies in plaintext (issue-import D11):
		// the account's connections stop, and the response names them.
		stopped, err := s.stopIssueConnections(ctx, uid)
		if err != nil {
			s.internal(w, err)
			return
		}
		if len(stopped) > 0 {
			out["issueConnectionsStopped"] = stopped
		}
	} else {
		s.audit.Record(ctx, audit.SettingsChanged(uid, "encryption.keys", "v"+strconv.Itoa(rec.Version-1), "v"+strconv.Itoa(rec.Version)))
	}
	writeJSON(w, status, out)
}

func (s *Server) handleDeleteEncryptionKeys(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	ok, err := s.keys().Delete(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "encryption_disabled", "end-to-end encryption is not enabled for this account")
		return
	}
	s.audit.Record(r.Context(), audit.SettingsChanged(uid, "encryption", "enabled", "disabled"))
	// Nothing is left to relay (mcp-device-relay D9).
	s.relayEndAccount(r.Context(), uid)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePurgeEncryptionHistory(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	on, err := s.encryptionEnabled(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !on {
		writeError(w, http.StatusConflict, "encryption_disabled", "enable end-to-end encryption before purging content history")
		return
	}
	n, err := s.sync.PurgeSupersededContent(r.Context(), uid, e2ee.AllContentFields())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"purged": n, "notice": purgeNotice})
}

// refuseIfEncrypted answers 409 `encryption_enabled` for routes that cannot work
// on ciphertext (first share of a project, CalDAV app passwords). It reports
// whether it answered.
func (s *Server) refuseIfEncrypted(w http.ResponseWriter, r *http.Request, message string) bool {
	on, err := s.encryptionEnabled(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return true
	}
	if on {
		writeError(w, http.StatusConflict, "encryption_enabled", message)
		return true
	}
	return false
}
