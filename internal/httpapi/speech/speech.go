// Package speech serves speech to text (OpenSpec change settings-refresh,
// design D7; voice-capture "Server speech service" and "Transcription
// route"). The owner connects one OpenAI-compatible transcription endpoint; a
// signed-in user's recorded phrase passes through this server to it and its
// text comes back. The audio and the text stay in memory for the request only:
// never written, never logged, never in the audit log. Only the per-user rate
// limit counts requests.
package speech

import (
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"strconv"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/httpapi/httpx"
	"github.com/pixari/opentodo/internal/stt"
)

// Routes are the speech routes over the owner's transcription service.
type Routes struct {
	STT   *stt.Service
	Audit *audit.Recorder
	Log   *slog.Logger
	// Demo: a demo instance never reports a connected service.
	Demo bool
	// Allow counts one phrase of an account against its limit (30/minute).
	Allow func(userID string) bool
}

// Register adds the routes behind their policies.
func (s *Routes) Register(mux httpx.Router) {
	mux.Handle("GET /api/v1/settings/stt", httpx.OwnerOnly("manage the speech-to-text service").Credential().DemoDenied(), s.handleGetSTT)
	mux.Handle("PUT /api/v1/settings/stt", httpx.OwnerOnly("manage the speech-to-text service").Credential().DemoDenied(), s.handlePutSTT)
	mux.Handle("POST /api/v1/settings/stt/test", httpx.OwnerOnly("test the speech-to-text service").Credential().DemoDenied(), s.handleTestSTT)
	mux.Handle("POST /api/v1/voice/transcribe", httpx.SignedIn.FullTokens().DemoDenied(), s.handleTranscribe)
}

// Status is what every user learns from /me: whether a service is connected
// and its host, named in the recogniser statement.
func (s *Routes) Status(r *http.Request) map[string]any {
	if s.Demo {
		return map[string]any{"connected": false}
	}
	v, err := s.STT.View(r.Context())
	if err != nil || !v.Connected {
		return map[string]any{"connected": false}
	}
	return map[string]any{"connected": true, "host": v.Host}
}

func (s *Routes) handleGetSTT(w http.ResponseWriter, r *http.Request) {
	v, err := s.STT.View(r.Context())
	if err != nil {
		httpx.Internal(w, s.Log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, v)
}

func (s *Routes) sttFieldError(w http.ResponseWriter, err error) bool {
	var fe *stt.FieldError
	if errors.As(err, &fe) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", fe.Error())
		return true
	}
	return false
}

func (s *Routes) handlePutSTT(w http.ResponseWriter, r *http.Request) {
	var in stt.Input
	if err := httpx.ReadJSON(r, &in); err != nil {
		httpx.BadBody(w, err)
		return
	}
	before, err := s.STT.View(r.Context())
	if err != nil {
		httpx.Internal(w, s.Log, err)
		return
	}
	if err := s.STT.Update(r.Context(), in); err != nil {
		if !s.sttFieldError(w, err) {
			httpx.Internal(w, s.Log, err)
		}
		return
	}
	v, err := s.STT.View(r.Context())
	if err != nil {
		httpx.Internal(w, s.Log, err)
		return
	}
	if before.Connected != v.Connected {
		s.Audit.Record(r.Context(), audit.SettingsChanged(httpx.UserFrom(r.Context()).ID, "stt.connected", strconv.FormatBool(before.Connected), strconv.FormatBool(v.Connected)))
	}
	httpx.WriteJSON(w, http.StatusOK, v)
}

// handleTestSTT sends the built-in sample with the stored or draft settings and
// answers the text, or the stage that failed.
func (s *Routes) handleTestSTT(w http.ResponseWriter, r *http.Request) {
	var in stt.Input
	if err := httpx.ReadOptionalJSON(r, &in); err != nil {
		httpx.BadBody(w, err)
		return
	}
	text, err := s.STT.Test(r.Context(), in)
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "text": text})
	case s.sttFieldError(w, err):
	case errors.Is(err, stt.ErrNotConfigured):
		httpx.WriteError(w, http.StatusConflict, "stt_not_configured", err.Error())
	case errors.Is(err, stt.ErrUnavailable):
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
	default:
		httpx.Internal(w, s.Log, err)
	}
}

var sttLanguage = regexp.MustCompile(`^[a-z]{2}$`)

func (s *Routes) handleTranscribe(w http.ResponseWriter, r *http.Request) {
	u := httpx.UserFrom(r.Context())
	if !s.Allow(u.ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "too many phrases, wait a minute")
		return
	}
	mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if _, ok := stt.AudioTypes[mt]; !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", "audio: send WebM, Ogg, MP4 or WAV audio")
		return
	}
	if sec, err := strconv.ParseFloat(r.URL.Query().Get("seconds"), 64); err == nil && sec > stt.MaxSeconds {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", "audio: a phrase is at most 60 seconds")
		return
	}
	lang := r.URL.Query().Get("language")
	if !sttLanguage.MatchString(lang) {
		lang = ""
	}
	audio, err := io.ReadAll(http.MaxBytesReader(w, r.Body, stt.MaxAudioBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", "audio: a phrase is at most 5 MB")
		return
	}
	if err != nil || len(audio) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", "audio: the phrase could not be read")
		return
	}
	text, err := s.STT.Transcribe(r.Context(), audio, mt, lang)
	switch {
	case err == nil:
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"text": text})
	case errors.Is(err, stt.ErrNotConfigured):
		httpx.WriteError(w, http.StatusConflict, "stt_not_configured", "no speech-to-text service is connected")
	case errors.Is(err, stt.ErrUnavailable):
		// The stage names no address and no content; nothing about the phrase is logged.
		httpx.WriteError(w, http.StatusBadGateway, "stt_unavailable", err.Error())
	default:
		httpx.Internal(w, s.Log, err)
	}
}
