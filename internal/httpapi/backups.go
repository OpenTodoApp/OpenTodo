package httpapi

import (
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/backup"
)

// requireOwner answers 403 unless the signed-in user is the owner, and 503 when
// the backup service is not wired. It returns the user on success.
func (s *Server) requireBackupOwner(w http.ResponseWriter, r *http.Request) *auth.User {
	u := userFrom(r.Context())
	if u == nil || u.Role != "owner" {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner can manage backups")
		return nil
	}
	if s.backups == nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable", "backups are not available on this server")
		return nil
	}
	return u
}

type backupSettingsResponse struct {
	Settings backup.Settings    `json:"settings"`
	Secrets  backup.SecretFlags `json:"secrets"`
}

func (s *Server) backupSettingsBody(w http.ResponseWriter, r *http.Request, set backup.Settings) {
	flags, err := s.backups.Flags()
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, backupSettingsResponse{Settings: set, Secrets: flags})
}

func (s *Server) handleGetBackupSettings(w http.ResponseWriter, r *http.Request) {
	if s.requireBackupOwner(w, r) == nil {
		return
	}
	set, err := s.backups.LoadSettings(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	s.backupSettingsBody(w, r, set)
}

// handlePutBackupSettings replaces the settings. Secrets are optional: absent
// keeps the stored value, "" clears it, anything else replaces it. They are
// never echoed back; the response carries presence flags only.
func (s *Server) handlePutBackupSettings(w http.ResponseWriter, r *http.Request) {
	if s.requireBackupOwner(w, r) == nil {
		return
	}
	var in struct {
		Settings *backup.Settings    `json:"settings"`
		Secrets  backup.SecretUpdate `json:"secrets"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if in.Settings == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_input", "message": "settings: required", "field": "settings"}})
		return
	}
	set, err := s.backups.SaveSettings(r.Context(), *in.Settings, in.Secrets)
	var fe *backup.FieldError
	if errors.As(err, &fe) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_input", "message": fe.Error(), "field": fe.Field}})
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.log.Info("backup settings changed", "destination", set.Destination, "schedule", set.Schedule.Frequency)
	s.backupSettingsBody(w, r, set)
}

func (s *Server) handleBackupStatus(w http.ResponseWriter, r *http.Request) {
	if s.requireBackupOwner(w, r) == nil {
		return
	}
	ctx := r.Context()
	set, err := s.backups.LoadSettings(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	flags, err := s.backups.Flags()
	if err != nil {
		s.internal(w, err)
		return
	}
	history, err := s.backups.History(ctx, 20)
	if err != nil {
		s.internal(w, err)
		return
	}
	next, err := s.backups.NextRun(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	var nextMs *int64
	if next != nil {
		v := next.UnixMilli()
		nextMs = &v
	}
	var last *backup.Run
	for i := range history {
		if history[i].Status != backup.StatusRunning {
			last = &history[i]
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":     set.Enabled(),
		"destination": set.Destination,
		"schedule":    set.Schedule,
		"encrypted":   flags.HasPassphrase,
		"running":     s.backups.Running(),
		"nextRunAt":   nextMs,
		"lastRun":     last,
		"history":     history,
	})
}

func (s *Server) handleBackupRun(w http.ResponseWriter, r *http.Request) {
	if s.requireBackupOwner(w, r) == nil {
		return
	}
	err := s.backups.StartRun(r.Context(), backup.KindManual)
	if errors.Is(err, backup.ErrRunning) {
		writeError(w, http.StatusConflict, "conflict", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "started"})
}

// handleBackupTest writes and deletes a probe object at the saved destination.
// A destination failure is a 502 carrying the destination's message.
func (s *Server) handleBackupTest(w http.ResponseWriter, r *http.Request) {
	if s.requireBackupOwner(w, r) == nil {
		return
	}
	err := s.backups.TestDestination(r.Context())
	var fe *backup.FieldError
	switch {
	case errors.As(err, &fe):
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_input", "message": fe.Error(), "field": fe.Field}})
	case err != nil:
		writeError(w, http.StatusBadGateway, "destination_error", err.Error())
	default:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}
