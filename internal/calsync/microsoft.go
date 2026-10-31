package calsync

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/settings"
)

// Microsoft (OpenSpec change outlook-calendar-sync): Outlook.com and
// Microsoft 365 calendars through Microsoft Graph, with an app registration
// the owner configures (design D2–D4).
const (
	// MicrosoftLogin is the Microsoft identity platform (tests change the
	// worker's copy).
	MicrosoftLogin = "https://login.microsoftonline.com"
	// GraphBase is Microsoft Graph's v1.0 endpoint.
	GraphBase = "https://graph.microsoft.com/v1.0"
	// MicrosoftScopes are the delegated permissions calendar sync asks for.
	MicrosoftScopes = "offline_access User.Read Calendars.ReadWrite MailboxSettings.Read"
	// DefaultTenant lets personal and work or school accounts sign in.
	DefaultTenant = "common"

	// Settings keys of the owner's client (the secret is in the secrets file).
	MicrosoftClientIDKey = "calendar_sync.microsoft_client_id"
	MicrosoftTenantKey   = "calendar_sync.microsoft_tenant"
	MicrosoftRefusedKey  = "calendar_sync.microsoft_refused_at"
)

// MicrosoftClient is the owner's app registration.
type MicrosoftClient struct {
	ID, Secret, Tenant string
	// FromEnv is set when OPENTODO_MICROSOFT_* configure it.
	FromEnv bool
	// RefusedAt is when Microsoft last refused the secret (Unix ms, 0 never
	// since it was saved).
	RefusedAt int64
}

// Complete reports whether the id and the secret are there.
func (m MicrosoftClient) Complete() bool { return m.ID != "" && m.Secret != "" }

var (
	tenantGUID   = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	tenantDomain = regexp.MustCompile(`^(?i:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?i:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$`)
)

// ValidTenant reports whether a tenant is common, organizations, consumers, a
// tenant GUID or a domain name.
func ValidTenant(t string) bool {
	switch t {
	case "common", "organizations", "consumers":
		return true
	}
	return len(t) <= 253 && (tenantGUID.MatchString(t) || tenantDomain.MatchString(t))
}

// MicrosoftConfig resolves the Microsoft client: the environment, else the
// settings table and the secrets file.
type MicrosoftConfig struct {
	Env     config.MicrosoftConfig
	Store   *settings.Store
	Secrets *Secrets
}

// Client returns the configured client (maybe incomplete).
func (m *MicrosoftConfig) Client(ctx context.Context) (MicrosoftClient, error) {
	var c MicrosoftClient
	if _, err := m.Store.Get(ctx, MicrosoftRefusedKey, &c.RefusedAt); err != nil {
		return c, err
	}
	if m.Env.Set() {
		c.ID, c.Secret, c.Tenant, c.FromEnv = m.Env.ClientID, m.Env.ClientSecret, m.Env.Tenant, true
	} else {
		if _, err := m.Store.Get(ctx, MicrosoftClientIDKey, &c.ID); err != nil {
			return c, err
		}
		if _, err := m.Store.Get(ctx, MicrosoftTenantKey, &c.Tenant); err != nil {
			return c, err
		}
		secret, err := m.Secrets.Get(MicrosoftSecretKey)
		if err != nil {
			return c, err
		}
		c.Secret = secret
	}
	if c.Tenant == "" {
		c.Tenant = DefaultTenant
	}
	return c, nil
}

// Save stores the owner's client; a nil secret keeps the stored one, an empty
// one removes it. A new secret forgets Microsoft's last refusal.
func (m *MicrosoftConfig) Save(ctx context.Context, id, tenant string, secret *string) error {
	if err := m.Store.Set(ctx, MicrosoftClientIDKey, strings.TrimSpace(id)); err != nil {
		return err
	}
	if err := m.Store.Set(ctx, MicrosoftTenantKey, strings.TrimSpace(tenant)); err != nil {
		return err
	}
	if secret == nil {
		return nil
	}
	if err := m.Store.Delete(ctx, MicrosoftRefusedKey); err != nil {
		return err
	}
	if *secret == "" {
		return m.Secrets.Delete(MicrosoftSecretKey)
	}
	return m.Secrets.Set(MicrosoftSecretKey, strings.TrimSpace(*secret))
}

// MicrosoftStateHash is how a Microsoft sign-in's state is stored: bound to the
// provider, so a Google callback can never consume it (design D3).
func MicrosoftStateHash(state string) string {
	return hash16(state) + hash16("calsync\x00microsoft\x00"+state)
}

// MicrosoftAuthorizationURL is the consent page of the client's tenant.
func MicrosoftAuthorizationURL(login string, c MicrosoftClient, redirectURI, state, challenge string) string {
	q := url.Values{
		"client_id": {c.ID}, "redirect_uri": {redirectURI}, "response_type": {"code"}, "response_mode": {"query"},
		"scope": {MicrosoftScopes}, "prompt": {"select_account"},
		"state": {state}, "code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}
	return strings.TrimSuffix(login, "/") + "/" + url.PathEscape(c.Tenant) + "/oauth2/v2.0/authorize?" + q.Encode()
}

// MicrosoftCallbackReason turns the error Microsoft returned to the callback
// into the panel's reason: the user declined, the organisation requires an
// administrator's approval, or anything else.
func MicrosoftCallbackReason(code, description string) string {
	switch {
	case strings.Contains(description, "AADSTS65001"), strings.Contains(description, "AADSTS90094"),
		strings.Contains(description, "AADSTS90095"), code == "consent_required", code == "interaction_required":
		return "admin_consent_required"
	case code == "access_denied":
		return "denied"
	}
	return "authorization_failed"
}

// MicrosoftToken talks to the token endpoint of the client's tenant.
type MicrosoftToken struct {
	HTTP  *http.Client
	Login string
	now   func() time.Time
}

func (t *MicrosoftToken) post(ctx context.Context, c MicrosoftClient, form url.Values) (*Token, error) {
	form.Set("client_id", c.ID)
	form.Set("client_secret", c.Secret)
	form.Set("scope", MicrosoftScopes)
	endpoint := strings.TrimSuffix(t.Login, "/") + "/" + url.PathEscape(c.Tenant) + "/oauth2/v2.0/token"
	return postToken(ctx, t.HTTP, endpoint, form, t.now, microsoftTokenError)
}

// microsoftTokenError maps an error of Microsoft's token endpoint (design D4):
// a refused client secret is the owner's to fix, a refused grant the user's.
func microsoftTokenError(a tokenAnswer) string {
	desc := a.Description
	switch {
	case a.Error == "invalid_client", strings.Contains(desc, "AADSTS7000215"), strings.Contains(desc, "AADSTS7000222"),
		strings.Contains(desc, "AADSTS700016"):
		return ReasonMicrosoftClient
	case a.Error == "invalid_grant", a.Error == "interaction_required", a.Error == "consent_required", a.Error == "unauthorized_client":
		return ReasonUnauthorized
	}
	return ""
}

// Exchange trades an authorization code for tokens.
func (t *MicrosoftToken) Exchange(ctx context.Context, c MicrosoftClient, code, verifier, redirectURI string) (*Token, error) {
	return t.post(ctx, c, url.Values{"grant_type": {"authorization_code"}, "code": {code}, "code_verifier": {verifier}, "redirect_uri": {redirectURI}})
}

// Refresh gets a new access token, and usually a new refresh token that
// replaces the old one (Microsoft rotates them).
func (t *MicrosoftToken) Refresh(ctx context.Context, c MicrosoftClient, refresh string) (*Token, error) {
	return t.post(ctx, c, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}})
}
