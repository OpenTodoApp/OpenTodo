package httpapi

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/stt"
)

// Speech to text (OpenSpec change settings-refresh, design D7; voice-capture
// "Server speech service" and "Transcription route"). The owner connects one
// OpenAI-compatible transcription endpoint; a signed-in user's recorded phrase
// passes through this server to it and its text comes back. The audio and the
// text stay in memory for the request only: never written, never logged, never
// in the audit log. Only the per-user rate limiter counts requests.
func (s *Server) registerSTTRoutes(mux *routes) {
	if s.stt == nil {
		s.stt = stt.New(settings.New(s.sync.DB()), s.cfg.DataDir, s.cfg.STT, s.allowPrivate())
	}
	mux.handle("GET /api/v1/settings/stt", ownerOnly("manage the speech-to-text service").credential().demoDenied(), s.handleGetSTT)
	mux.handle("PUT /api/v1/settings/stt", ownerOnly("manage the speech-to-text service").credential().demoDenied(), s.handlePutSTT)
	mux.handle("POST /api/v1/settings/stt/test", ownerOnly("test the speech-to-text service").credential().demoDenied(), s.handleTestSTT)
	mux.handle("POST /api/v1/voice/transcribe", signedIn.fullTokens().demoDenied(), s.handleTranscribe)
}

// speechStatus is what every user learns from /me: whether a service is
// connected and its host, named in the recogniser statement.
func (s *Server) speechStatus(r *http.Request) map[string]any {
	if s.stt == nil || s.cfg.Demo {
		return map[string]any{"connected": false}
	}
	v, err := s.stt.View(r.Context())
	if err != nil || !v.Connected {
		return map[string]any{"connected": false}
	}
	return map[string]any{"connected": true, "host": v.Host}
}

func (s *Server) handleGetSTT(w http.ResponseWriter, r *http.Request) {
	v, err := s.stt.View(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) sttFieldError(w http.ResponseWriter, err error) bool {
	var fe *stt.FieldError
	if errors.As(err, &fe) {
		writeError(w, http.StatusBadRequest, "invalid_input", fe.Error())
		return true
	}
	return false
}

func (s *Server) handlePutSTT(w http.ResponseWriter, r *http.Request) {
	var in stt.Input
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	before, err := s.stt.View(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.stt.Update(r.Context(), in); err != nil {
		if !s.sttFieldError(w, err) {
			s.internal(w, err)
		}
		return
	}
	v, err := s.stt.View(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	if before.Connected != v.Connected {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, "stt.connected", boolText(before.Connected), boolText(v.Connected)))
	}
	writeJSON(w, http.StatusOK, v)
}

// handleTestSTT sends the built-in sample with the stored or draft settings and
// answers the text, or the stage that failed.
func (s *Server) handleTestSTT(w http.ResponseWriter, r *http.Request) {
	var in stt.Input
	if err := readOptionalJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	text, err := s.stt.Test(r.Context(), in)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "text": text})
	case s.sttFieldError(w, err):
	case errors.Is(err, stt.ErrNotConfigured):
		writeError(w, http.StatusConflict, "stt_not_configured", err.Error())
	case errors.Is(err, stt.ErrUnavailable):
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
	default:
		s.internal(w, err)
	}
}

var sttLanguage = regexp.MustCompile(`^[a-z]{2}$`)

func (s *Server) handleTranscribe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if !s.sttLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many phrases, wait a minute")
		return
	}
	mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if _, ok := stt.AudioTypes[mt]; !ok {
		writeError(w, http.StatusBadRequest, "invalid_input", "audio: send WebM, Ogg, MP4 or WAV audio")
		return
	}
	if sec, err := strconv.ParseFloat(r.URL.Query().Get("seconds"), 64); err == nil && sec > stt.MaxSeconds {
		writeError(w, http.StatusBadRequest, "invalid_input", "audio: a phrase is at most 60 seconds")
		return
	}
	lang := r.URL.Query().Get("language")
	if !sttLanguage.MatchString(lang) {
		lang = ""
	}
	audio, err := io.ReadAll(http.MaxBytesReader(w, r.Body, stt.MaxAudioBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeError(w, http.StatusBadRequest, "invalid_input", "audio: a phrase is at most 5 MB")
		return
	}
	if err != nil || len(audio) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_input", "audio: the phrase could not be read")
		return
	}
	text, err := s.stt.Transcribe(r.Context(), audio, mt, lang)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]any{"text": text})
	case errors.Is(err, stt.ErrNotConfigured):
		writeError(w, http.StatusConflict, "stt_not_configured", "no speech-to-text service is connected")
	case errors.Is(err, stt.ErrUnavailable):
		// The stage names no address and no content; nothing about the phrase is logged.
		writeError(w, http.StatusBadGateway, "stt_unavailable", err.Error())
	default:
		s.internal(w, err)
	}
}
