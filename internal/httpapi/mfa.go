package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
)

// ---- second factor (OpenSpec change `mfa-totp`) ----

// trustCookie remembers a browser that completed the second step with
// "remember this device"; it is only sent to the sign-in routes.
const trustCookie = "ot_trust"

// FreshWindow is how recently a cookie session must have proved identity to use
// a sensitive route (design D4); routes ask for it with routePolicy.recent.
const FreshWindow = 10 * time.Minute

func (s *Server) registerMFARoutes(mux *routes) {
	mux.handle("POST /api/v1/auth/mfa", public("the second sign-in step carries its challenge"), s.handleMFALogin)
	mux.handle("POST /api/v1/auth/reauth", signedIn, s.handleReauth)

	mux.handle("GET /api/v1/mfa", signedIn, s.handleMFAStatus)
	mux.handle("POST /api/v1/mfa/totp/enroll", signedIn.credential().demoDenied(), s.handleMFAEnroll)
	mux.handle("POST /api/v1/mfa/totp/confirm", signedIn.credential().demoDenied(), s.handleMFAConfirm)
	mux.handle("DELETE /api/v1/mfa/totp", signedIn.sensitive().demoDenied(), s.handleMFADisable)
	mux.handle("POST /api/v1/mfa/recovery-codes/regenerate", signedIn.sensitive().demoDenied(), s.handleMFARegenerate)
	mux.handle("GET /api/v1/mfa/trusted-devices", signedIn, s.handleListTrustedDevices)
	mux.handle("DELETE /api/v1/mfa/trusted-devices", signedIn.demoDenied(), s.handleForgetTrustedDevices)
	mux.handle("DELETE /api/v1/mfa/trusted-devices/{id}", signedIn.demoDenied(), s.handleForgetTrustedDevice)

	mux.handle("GET /api/v1/settings/mfa", ownerOnly("manage the two-factor policy and resets"), s.handleGetMFAPolicy)
	mux.handle("PUT /api/v1/settings/mfa", ownerOnly("manage the two-factor policy and resets").sensitive().demoDenied(), s.handlePutMFAPolicy)
	mux.handle("POST /api/v1/members/{id}/mfa/reset", ownerOnly("manage the two-factor policy and resets").sensitive().demoDenied(), s.handleMFAReset)
}

// allowedWhileRestricted lists what an enrolment-restricted session may still
// do: read its profile, enrol, re-authenticate and sign out.
func allowedWhileRestricted(r *http.Request) bool {
	p := r.URL.Path
	switch {
	case p == "/api/v1/me" && (r.Method == http.MethodGet || r.Method == http.MethodHead):
		return true
	case p == "/api/v1/mfa" || strings.HasPrefix(p, "/api/v1/mfa/"):
		return true
	case p == "/api/v1/auth/reauth" || p == "/api/v1/auth/logout":
		return true
	}
	return false
}

// secondStep handles an enrolled account after its first factor: a remembered
// browser starts the session directly, otherwise the answer is a challenge for
// POST /api/v1/auth/mfa and no cookie. It reports whether it answered; false
// means the account has no second factor and the caller starts the session.
func (s *Server) secondStep(w http.ResponseWriter, r *http.Request, u *auth.User, first string) bool {
	enrolled, err := s.auth.HasConfirmedTOTP(r.Context(), u.ID)
	if err != nil {
		s.internal(w, err)
		return true
	}
	if !enrolled {
		return false
	}
	if c, err := r.Cookie(trustCookie); err == nil {
		ok, err := s.auth.TrustedDeviceValid(r.Context(), u.ID, c.Value)
		if err != nil {
			s.internal(w, err)
			return true
		}
		if ok {
			if s.startSession(w, r, u, http.StatusOK, true) {
				s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, first+"+trusted_device"))
			}
			return true
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mfaRequired": true,
		"challenge":   s.auth.StartMFAChallenge(u.ID, first),
		"expiresAt":   s.auth.Now().Add(auth.LoginChallengeTTL).UnixMilli(),
	})
	return true
}

func (s *Server) handleMFALogin(w http.ResponseWriter, r *http.Request) {
	if !s.mfaLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var in struct {
		Challenge    string `json:"challenge"`
		Code         string `json:"code"`
		RecoveryCode string `json:"recoveryCode"`
		Remember     bool   `json:"remember"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	code, recovery := in.Code, false
	if strings.TrimSpace(in.RecoveryCode) != "" {
		code, recovery = in.RecoveryCode, true
	}
	if strings.TrimSpace(in.Challenge) == "" || strings.TrimSpace(code) == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "challenge and code (or recoveryCode) are required")
		return
	}
	u, method, err := s.auth.CompleteMFAChallenge(r.Context(), in.Challenge, code, recovery)
	switch {
	case errors.Is(err, auth.ErrMFAChallengeInvalid):
		writeError(w, http.StatusUnauthorized, "mfa_challenge_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrMFACodeInvalid):
		s.recordMFAFailure(r, err)
		writeError(w, http.StatusUnauthorized, "mfa_code_invalid", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	if in.Remember {
		secret, exp, err := s.auth.CreateTrustedDevice(r.Context(), u.ID, r.UserAgent())
		if err != nil {
			s.internal(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: trustCookie, Value: secret, Path: "/api/v1/auth", Expires: exp, MaxAge: int(auth.TrustedDeviceTTL.Seconds()),
			HttpOnly: true, Secure: s.cfg.SecureCookies(), SameSite: http.SameSiteLaxMode,
		})
	}
	if s.startSession(w, r, u, http.StatusOK, true) {
		s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, method))
	}
}

// recordMFAFailure writes mfa.challenge_failed with the reason, never the code.
func (s *Server) recordMFAFailure(r *http.Request, err error) {
	var f *auth.MFAFailure
	if errors.As(err, &f) {
		s.audit.Record(r.Context(), audit.MFAChallengeFailed(f.UserID, f.Reason))
	}
}

func (s *Server) handleReauth(w http.ResponseWriter, r *http.Request) {
	if !s.reauthLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	sess := sessionFrom(r.Context())
	if sess == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "re-authentication applies to browser sessions; API tokens are never challenged")
		return
	}
	var in struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	u := sess.User
	viaCode := false
	switch {
	case in.Password != "":
		ok, err := s.auth.CheckPassword(r.Context(), u.ID, in.Password)
		if err != nil {
			s.internal(w, err)
			return
		}
		if !ok {
			s.audit.Record(r.Context(), audit.LoginFailed(u.ID, u.Email, "reauth_wrong_password"))
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "the password is not correct")
			return
		}
	case strings.TrimSpace(in.Code) != "":
		if _, err := s.auth.VerifySecondFactor(r.Context(), u.ID, in.Code, false); err != nil {
			if errors.Is(err, auth.ErrMFACodeInvalid) {
				s.recordMFAFailure(r, err)
				writeError(w, http.StatusUnauthorized, "mfa_code_invalid", err.Error())
				return
			}
			s.internal(w, err)
			return
		}
		viaCode = true
	default:
		writeError(w, http.StatusBadRequest, "invalid_input", "password or code is required")
		return
	}
	if err := s.auth.MarkReauthenticated(r.Context(), sess.TokenHash, viaCode); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reauthAt": s.auth.Now().UnixMilli(), "validForMs": FreshWindow.Milliseconds()})
}

func (s *Server) mfaStatus(w http.ResponseWriter, r *http.Request) (*auth.MFAStatus, bool) {
	st, err := s.auth.MFAStatusFor(r.Context(), userFrom(r.Context()), sessionFrom(r.Context()) != nil)
	if err != nil {
		s.internal(w, err)
		return nil, false
	}
	return st, true
}

func (s *Server) handleMFAStatus(w http.ResponseWriter, r *http.Request) {
	if st, ok := s.mfaStatus(w, r); ok {
		writeJSON(w, http.StatusOK, map[string]any{"mfa": st})
	}
}

func (s *Server) handleMFAEnroll(w http.ResponseWriter, r *http.Request) {
	en, err := s.auth.BeginTOTPEnrollment(r.Context(), userFrom(r.Context()))
	if errors.Is(err, auth.ErrMFAAlreadyEnrolled) {
		writeError(w, http.StatusConflict, "mfa_already_enrolled", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, en)
}

func (s *Server) handleMFAConfirm(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	tokenHash := ""
	if sess := sessionFrom(r.Context()); sess != nil {
		tokenHash = sess.TokenHash
	}
	codes, err := s.auth.ConfirmTOTPEnrollment(r.Context(), userFrom(r.Context()), in.Code, tokenHash)
	switch {
	case errors.Is(err, auth.ErrMFAAlreadyEnrolled):
		writeError(w, http.StatusConflict, "mfa_already_enrolled", err.Error())
		return
	case errors.Is(err, auth.ErrMFACodeInvalid):
		writeError(w, http.StatusBadRequest, "mfa_code_invalid", "the code does not match: check that your device's clock is set automatically, or start again if more than ten minutes passed")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	st, ok := s.mfaStatus(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes, "mfa": st})
}

func (s *Server) handleMFADisable(w http.ResponseWriter, r *http.Request) {
	err := s.auth.DisableTOTP(r.Context(), userFrom(r.Context()))
	switch {
	case errors.Is(err, auth.ErrMFARequiredByPolicy):
		writeError(w, http.StatusForbidden, "mfa_required_by_policy", err.Error())
		return
	case errors.Is(err, auth.ErrMFANotEnrolled):
		writeError(w, http.StatusConflict, "mfa_not_enrolled", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMFARegenerate(w http.ResponseWriter, r *http.Request) {
	codes, err := s.auth.RegenerateRecoveryCodes(r.Context(), userFrom(r.Context()).ID)
	if errors.Is(err, auth.ErrMFANotEnrolled) {
		writeError(w, http.StatusConflict, "mfa_not_enrolled", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recoveryCodes": codes})
}

func (s *Server) handleListTrustedDevices(w http.ResponseWriter, r *http.Request) {
	list, err := s.auth.ListTrustedDevices(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": list})
}

func (s *Server) handleForgetTrustedDevices(w http.ResponseWriter, r *http.Request) {
	if err := s.auth.DeleteAllTrustedDevices(r.Context(), userFrom(r.Context()).ID); err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleForgetTrustedDevice(w http.ResponseWriter, r *http.Request) {
	err := s.auth.DeleteTrustedDevice(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "trusted device not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetMFAPolicy(w http.ResponseWriter, r *http.Request) {
	p, err := s.auth.MFAPolicy(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"required": p})
}

func (s *Server) handlePutMFAPolicy(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Required string `json:"required"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	p, err := auth.ParsePolicy(in.Required)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	p, err = s.auth.SetMFAPolicy(r.Context(), u.ID, p)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"required": p})
}

func (s *Server) handleMFAReset(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	err := s.auth.ResetMFA(r.Context(), u.ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "member not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
