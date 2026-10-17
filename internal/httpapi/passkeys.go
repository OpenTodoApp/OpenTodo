package httpapi

import (
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/webauthn"
)

// ---- handlers: passkeys (OpenSpec change `passkeys`) ----
//
// Binary fields travel as base64url strings, padded or not, in the same JSON
// shape the browser produces for PublicKeyCredential.toJSON().

// passkeysAvailable writes the 409 passkeys_unavailable error and returns false
// when the server has no https (or localhost) base URL.
func (s *Server) passkeysAvailable(w http.ResponseWriter) bool {
	if s.cfg.PasskeysAvailable() && s.auth.PasskeysAvailable() {
		return true
	}
	writeError(w, http.StatusConflict, "passkeys_unavailable", auth.ErrPasskeysUnavailable.Error())
	return false
}

// publicKeyCredential mirrors the browser's serialized credential. Only the
// fields the server verifies are read.
type publicKeyCredential struct {
	ID       string `json:"id"`
	RawID    string `json:"rawId"`
	Type     string `json:"type"`
	Response struct {
		ClientDataJSON    string   `json:"clientDataJSON"`
		AttestationObject string   `json:"attestationObject"`
		AuthenticatorData string   `json:"authenticatorData"`
		Signature         string   `json:"signature"`
		Transports        []string `json:"transports"`
	} `json:"response"`
}

func (c *publicKeyCredential) rawID() ([]byte, error) {
	if c.RawID != "" {
		return webauthn.DecodeBase64URL(c.RawID)
	}
	return webauthn.DecodeBase64URL(c.ID)
}

// decodeFields base64url-decodes each named field, reporting the first failure.
func decodeFields(fields map[string]string) (map[string][]byte, string) {
	out := make(map[string][]byte, len(fields))
	for name, v := range fields {
		if v == "" {
			return nil, "credential.response." + name + " is required"
		}
		b, err := webauthn.DecodeBase64URL(v)
		if err != nil {
			return nil, "credential.response." + name + " must be base64url"
		}
		out[name] = b
	}
	return out, ""
}

func (s *Server) handlePasskeyRegisterOptions(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysAvailable(w) {
		return
	}
	opts, err := s.auth.BeginPasskeyRegistration(r.Context(), userFrom(r.Context()))
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"publicKey": opts})
}

func (s *Server) handlePasskeyRegister(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysAvailable(w) {
		return
	}
	var in struct {
		Name       string              `json:"name"`
		Credential publicKeyCredential `json:"credential"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	fields, msg := decodeFields(map[string]string{
		"clientDataJSON":    in.Credential.Response.ClientDataJSON,
		"attestationObject": in.Credential.Response.AttestationObject,
	})
	if msg != "" {
		writeError(w, http.StatusBadRequest, "bad_request", msg)
		return
	}
	p, err := s.auth.FinishPasskeyRegistration(r.Context(), userFrom(r.Context()).ID, in.Name, webauthn.RegistrationResponse{
		ClientDataJSON:    fields["clientDataJSON"],
		AttestationObject: fields["attestationObject"],
		Transports:        in.Credential.Response.Transports,
	})
	switch {
	case errors.Is(err, auth.ErrChallengeInvalid):
		writeError(w, http.StatusBadRequest, "passkey_challenge_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"passkey": p})
}

func (s *Server) handleListPasskeys(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysAvailable(w) {
		return
	}
	list, err := s.auth.ListPasskeys(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"passkeys": list})
}

func (s *Server) handleRenamePasskey(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysAvailable(w) {
		return
	}
	var in struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	p, err := s.auth.RenamePasskey(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), in.Name)
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "passkey not found")
		return
	case errors.Is(err, auth.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"passkey": p})
}

func (s *Server) handleDeletePasskey(w http.ResponseWriter, r *http.Request) {
	if !s.passkeysAvailable(w) {
		return
	}
	err := s.auth.DeletePasskey(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "passkey not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// loginGate applies a per-address limiter (10 per minute, like password
// sign-in) and the Origin check to the anonymous passkey routes. Sign-in
// attempts and challenge requests, which the sign-in screen makes on every
// visit for autofill, each have their own window.
func (s *Server) loginGate(w http.ResponseWriter, r *http.Request, limiter *rateLimiter) bool {
	if allowed, first := limiter.hit(clientIP(r)); !allowed {
		// Record one rate_limited
		// event per window and address, as for password sign-in.
		if first && limiter == s.passkeyLimiter {
			s.audit.Record(r.Context(), audit.LoginFailed("", "", audit.ReasonRateLimited))
		}
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return false
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return false
	}
	return s.passkeysAvailable(w)
}

func (s *Server) handlePasskeyLoginOptions(w http.ResponseWriter, r *http.Request) {
	if !s.loginGate(w, r, s.passkeyOptions) {
		return
	}
	opts, err := s.auth.BeginPasskeyLogin(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"publicKey": opts})
}

func (s *Server) handlePasskeyLogin(w http.ResponseWriter, r *http.Request) {
	if !s.loginGate(w, r, s.passkeyLimiter) {
		return
	}
	var in struct {
		Credential publicKeyCredential `json:"credential"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	credID, err := in.Credential.rawID()
	if err != nil || len(credID) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "credential.rawId must be base64url")
		return
	}
	fields, msg := decodeFields(map[string]string{
		"clientDataJSON":    in.Credential.Response.ClientDataJSON,
		"authenticatorData": in.Credential.Response.AuthenticatorData,
		"signature":         in.Credential.Response.Signature,
	})
	if msg != "" {
		writeError(w, http.StatusBadRequest, "bad_request", msg)
		return
	}
	u, verified, err := s.auth.FinishPasskeyLoginVerified(r.Context(), credID, webauthn.AssertionResponse{
		ClientDataJSON:    fields["clientDataJSON"],
		AuthenticatorData: fields["authenticatorData"],
		Signature:         fields["signature"],
	})
	switch {
	case errors.Is(err, auth.ErrChallengeInvalid):
		writeError(w, http.StatusBadRequest, "passkey_challenge_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case errors.Is(err, auth.ErrInvalidCredentials):
		var f *auth.LoginFailure
		if errors.As(err, &f) {
			s.audit.Record(r.Context(), audit.LoginFailed(f.UserID, f.Email, f.Reason))
		}
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "passkey not recognised")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	// SSO-only mode: members must use the provider (oidc-login D6).
	if s.ssoRequired(w, r, u) {
		return
	}
	// A passkey with user verification is two factors (mfa-totp D5); one without
	// it is only possession, so an enrolled account still needs its code.
	if !verified {
		if done := s.secondStep(w, r, u, "passkey"); done {
			return
		}
	}
	if s.startSession(w, r, u, http.StatusOK, verified) {
		s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, "passkey"))
	}
}
