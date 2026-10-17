package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/store"
)

// Web restore (OpenSpec backup-restore-web, design D8). Every route is owner
// only and covered by the demo deny prefix /api/v1/backups; the confirmation and
// the safety-copy delete also need a fresh session and refuse API tokens (route
// policy, see policy.go).

// liftDeadlines lets a long upload or download run past the server's 60 s
// read/write timeouts, as the live-update stream does.
func liftDeadlines(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})
}

func invalidField(w http.ResponseWriter, field, msg string) {
	writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_input", "message": msg, "field": field}})
}

// restoreError maps backup errors to the documented codes.
func (s *Server) restoreError(w http.ResponseWriter, err error) {
	var de *backup.DestinationError
	switch {
	case errors.Is(err, backup.ErrPassphraseRequired):
		writeError(w, http.StatusUnprocessableEntity, "passphrase_required", "this archive is encrypted: enter its passphrase")
	case errors.Is(err, backup.ErrPassphraseInvalid):
		writeError(w, http.StatusUnprocessableEntity, "passphrase_invalid", "the passphrase does not open this archive")
	case errors.Is(err, backup.ErrNewerSchema):
		writeError(w, http.StatusConflict, "newer_schema", err.Error())
	case errors.Is(err, backup.ErrIntegrity):
		writeError(w, http.StatusBadRequest, "integrity", err.Error())
	case errors.Is(err, backup.ErrInsufficientStorage):
		writeError(w, http.StatusInsufficientStorage, "insufficient_storage", err.Error())
	case errors.Is(err, backup.ErrNotArchiveName):
		invalidField(w, "source", "name an OpenTodo archive from the list")
	case errors.Is(err, backup.ErrNotSafetyCopy):
		invalidField(w, "name", "not a safety copy name")
	case errors.Is(err, backup.ErrStagedNotFound), errors.Is(err, backup.ErrArchiveNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
	case errors.Is(err, backup.ErrRunning):
		writeError(w, http.StatusConflict, "conflict", "a backup is running: try again when it has finished")
	case errors.Is(err, store.ErrLocked):
		writeError(w, http.StatusConflict, "conflict", err.Error())
	case errors.As(err, &de):
		writeError(w, http.StatusBadGateway, "destination_error", err.Error())
	default:
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusInsufficientStorage, "insufficient_storage", "the archive is larger than the free disk space can hold for a restore")
			return
		}
		s.internal(w, err)
	}
}

func (s *Server) handleBackupArchives(w http.ResponseWriter, r *http.Request) {
	if s.backupsReady(w, r) == nil {
		return
	}
	list, dest, err := s.backups.Archives(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "destination_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"destination": dest, "archives": list})
}

func (s *Server) handleRestoreUpload(w http.ResponseWriter, r *http.Request) {
	u := s.backupsReady(w, r)
	if u == nil {
		return
	}
	liftDeadlines(w)
	res, err := s.backups.ReceiveUpload(r.Context(), r.Body, u.ID)
	if err != nil {
		s.restoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

func (s *Server) handleRestorePrepare(w http.ResponseWriter, r *http.Request) {
	u := s.backupsReady(w, r)
	if u == nil {
		return
	}
	// Each attempt may try a passphrase: slow down guessing one through us.
	if !s.reauthLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	var in struct {
		Source     backup.PrepareSource `json:"source"`
		Passphrase string               `json:"passphrase"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	n := 0
	for _, v := range []string{in.Source.Archive, in.Source.Upload, in.Source.SafetyCopy} {
		if v != "" {
			n++
		}
	}
	if n != 1 {
		invalidField(w, "source", "name exactly one of archive, upload or safetyCopy")
		return
	}
	liftDeadlines(w)
	res, err := s.backups.Prepare(r.Context(), in.Source, in.Passphrase, u.ID)
	if err != nil {
		s.restoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleRestoreCancel(w http.ResponseWriter, r *http.Request) {
	if s.backupsReady(w, r) == nil {
		return
	}
	s.backups.CancelRestore(r.PathValue("id"))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRestoreConfirm(w http.ResponseWriter, r *http.Request) {
	u := s.backupsReady(w, r)
	if u == nil {
		return
	}
	var in struct {
		ID      string `json:"id"`
		Confirm string `json:"confirm"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if in.Confirm != backup.ConfirmWord {
		invalidField(w, "confirm", "type RESTORE to confirm")
		return
	}
	if err := s.backups.ConfirmRestore(r.Context(), in.ID, u.ID); err != nil {
		s.restoreError(w, err)
		return
	}
	// The restart begins once this response is written: Shutdown waits for it.
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "restarting"})
}

func (s *Server) handleRestoreState(w http.ResponseWriter, r *http.Request) {
	if s.backupsReady(w, r) == nil {
		return
	}
	st, err := s.backups.RestoreState(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) handleDeleteSafetyCopy(w http.ResponseWriter, r *http.Request) {
	u := s.backupsReady(w, r)
	if u == nil {
		return
	}
	if err := s.backups.DeleteSafetyCopy(r.Context(), r.PathValue("name"), u.ID); err != nil {
		s.restoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
