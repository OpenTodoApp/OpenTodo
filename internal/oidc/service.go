// Package oidc implements single sign-on with one generic OpenID Connect
// provider (OpenSpec change `oidc-login`) using only the standard library:
// discovery, the authorization-code flow with PKCE, identity-token
// verification (RS256, PS256, ES256, EdDSA) and the owner's configuration with
// optional environment overrides.
//
// The package knows nothing about accounts: matching identities to users and
// provisioning live in internal/auth, routes in internal/httpapi.
package oidc

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/settings"
)

// Settings keys in the shared settings table (design D2). The client secret is
// not among them: it lives in <data>/secrets/oidc.json like every other
// server secret, so database snapshots never contain it.
const (
	KeyIssuer         = "oidc.issuer"
	KeyClientID       = "oidc.client_id"
	KeyDisplayName    = "oidc.display_name"
	KeyScopes         = "oidc.scopes"
	KeyAllowProvision = "oidc.allow_provision"
	KeySSOOnly        = "oidc.sso_only"
	KeyProviderLogout = "oidc.provider_logout"
	KeySyncPictures   = "oidc.sync_pictures"
	// KeyClientSecret names the secret in audit events and the secrets file.
	KeyClientSecret = "oidc.client_secret"
)

// DefaultScopes are requested when the owner sets none.
const DefaultScopes = "openid email profile"

// Env holds the optional OPENTODO_OIDC_* overrides. A non-empty string (or
// non-nil pointer) overrides the stored value and locks the field in the UI.
type Env struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	DisplayName  string
	SSOOnly      *bool
}

// Config is the effective provider configuration.
type Config struct {
	Issuer         string
	ClientID       string
	ClientSecret   string
	DisplayName    string
	Scopes         string
	AllowProvision bool
	SSOOnly        bool
	ProviderLogout bool
	// SyncPictures: the `picture` claim becomes the account's profile picture at
	// sign-in, unless the person uploaded one (issue #233). Off by default: it
	// makes the server fetch an address named by the provider.
	SyncPictures bool
	// ManagedBy maps each field name (issuer, clientId, clientSecret,
	// displayName, ssoOnly, ...) to "env" or "settings".
	ManagedBy map[string]string
}

// Enabled reports whether a provider is configured.
func (c Config) Enabled() bool { return c.Issuer != "" && c.ClientID != "" }

// Name is the provider's display name, defaulting to "SSO".
func (c Config) Name() string {
	if strings.TrimSpace(c.DisplayName) != "" {
		return c.DisplayName
	}
	return "SSO"
}

// Update is a settings change from the owner. A nil field is kept as is.
// ClientSecret: nil keeps the stored secret, "" removes it, anything else replaces it.
type Update struct {
	Issuer         *string
	ClientID       *string
	ClientSecret   *string
	DisplayName    *string
	Scopes         *string
	AllowProvision *bool
	SSOOnly        *bool
	ProviderLogout *bool
	SyncPictures   *bool
}

// Change is one setting that an Update changed, for the audit log. Secret
// values are reported as "(changed)".
type Change struct{ Key, From, To string }

// ErrInvalidConfig is returned for a configuration the owner must fix; the
// message names the problem.
type ErrInvalidConfig struct{ Msg string }

func (e *ErrInvalidConfig) Error() string { return e.Msg }

// Service is the provider configuration plus the cached provider and the flow
// state codec. Safe for concurrent use.
type Service struct {
	store   *settings.Store
	secrets *settings.SecretsFile
	env     Env
	client  *http.Client
	now     func() time.Time
	states  *StateCodec

	mu       sync.Mutex
	provider *Provider
}

// Options configure a Service; zero values are production defaults.
type Options struct {
	Env    Env
	Client *http.Client     // default NewHTTPClient(nil)
	Now    func() time.Time // default time.Now
}

// New wires a Service over the settings store and <dataDir>/secrets/oidc.json.
func New(store *settings.Store, dataDir string, o Options) *Service {
	if o.Client == nil {
		o.Client = NewHTTPClient(nil)
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	return &Service{store: store, secrets: settings.NewSecretsFile(dataDir, "oidc"), env: o.Env,
		client: o.Client, now: o.Now, states: NewStateCodec(o.Now)}
}

// States returns the flow-state codec.
func (s *Service) States() *StateCodec { return s.states }

// Client is the outbound HTTP client (for the code exchange).
func (s *Service) Client() *http.Client { return s.client }

// Now is the service clock.
func (s *Service) Now() time.Time { return s.now() }

func (s *Service) getString(ctx context.Context, key string) (string, error) {
	var v string
	_, err := s.store.Get(ctx, key, &v)
	return v, err
}

func (s *Service) getBool(ctx context.Context, key string) (bool, error) {
	var v bool
	_, err := s.store.Get(ctx, key, &v)
	return v, err
}

// Config returns the effective configuration: stored values with environment
// overrides applied.
func (s *Service) Config(ctx context.Context) (Config, error) {
	var c Config
	var err error
	c.ManagedBy = map[string]string{}
	str := func(key, name, env string, dst *string) {
		if err != nil {
			return
		}
		if env != "" {
			*dst, c.ManagedBy[name] = env, "env"
			return
		}
		*dst, err = s.getString(ctx, key)
		c.ManagedBy[name] = "settings"
	}
	str(KeyIssuer, "issuer", s.env.Issuer, &c.Issuer)
	str(KeyClientID, "clientId", s.env.ClientID, &c.ClientID)
	str(KeyDisplayName, "displayName", s.env.DisplayName, &c.DisplayName)
	str(KeyScopes, "scopes", "", &c.Scopes)
	if err != nil {
		return c, err
	}
	if strings.TrimSpace(c.Scopes) == "" {
		c.Scopes = DefaultScopes
	}
	if c.AllowProvision, err = s.getBool(ctx, KeyAllowProvision); err != nil {
		return c, err
	}
	if c.ProviderLogout, err = s.getBool(ctx, KeyProviderLogout); err != nil {
		return c, err
	}
	if c.SyncPictures, err = s.getBool(ctx, KeySyncPictures); err != nil {
		return c, err
	}
	c.ManagedBy["allowProvision"], c.ManagedBy["providerLogout"], c.ManagedBy["syncPictures"] = "settings", "settings", "settings"
	if s.env.SSOOnly != nil {
		c.SSOOnly, c.ManagedBy["ssoOnly"] = *s.env.SSOOnly, "env"
	} else {
		if c.SSOOnly, err = s.getBool(ctx, KeySSOOnly); err != nil {
			return c, err
		}
		c.ManagedBy["ssoOnly"] = "settings"
	}
	if s.env.ClientSecret != "" {
		c.ClientSecret, c.ManagedBy["clientSecret"] = s.env.ClientSecret, "env"
	} else {
		sec, err := s.secrets.Load()
		if err != nil {
			return c, err
		}
		c.ClientSecret, c.ManagedBy["clientSecret"] = sec.Value(KeyClientSecret), "settings"
	}
	return c, nil
}

// SSOOnly reports whether SSO-only mode is in force: it needs a configured
// provider, so turning the provider off can never lock members out.
func (s *Service) SSOOnly(ctx context.Context) bool {
	c, err := s.Config(ctx)
	return err == nil && c.Enabled() && c.SSOOnly
}

// Provider returns the cached provider for the configured issuer (a new cache
// when the issuer changed).
func (s *Service) Provider(issuer string) *Provider {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.provider == nil || s.provider.Issuer() != issuer {
		s.provider = NewProvider(issuer, s.client, s.now)
	}
	return s.provider
}

// Reset drops the cached discovery document and key set (after a settings change).
func (s *Service) Reset() {
	s.mu.Lock()
	s.provider = nil
	s.mu.Unlock()
}

// Test runs discovery against issuer (the configured one when empty).
func (s *Service) Test(ctx context.Context, issuer string) (*Metadata, error) {
	if issuer == "" {
		c, err := s.Config(ctx)
		if err != nil {
			return nil, err
		}
		issuer = c.Issuer
	}
	if issuer == "" {
		return nil, &ErrInvalidConfig{Msg: "no issuer is configured"}
	}
	if err := ValidateIssuer(issuer); err != nil {
		return nil, &ErrInvalidConfig{Msg: err.Error()}
	}
	m, err := Discover(ctx, s.client, issuer)
	if err != nil {
		return nil, &ErrInvalidConfig{Msg: err.Error()}
	}
	return m, nil
}

// Save validates and applies an update. A non-empty issuer must pass
// discovery before anything is stored; a field managed by the environment
// cannot be changed. It returns the changes for the audit log.
func (s *Service) Save(ctx context.Context, u Update) ([]Change, error) {
	cur, err := s.Config(ctx)
	if err != nil {
		return nil, err
	}
	locked := func(name string, v *string, envVal string) error {
		if v != nil && envVal != "" && strings.TrimSpace(*v) != envVal {
			return &ErrInvalidConfig{Msg: name + " is set by an OPENTODO_OIDC_* environment variable and cannot be changed here"}
		}
		return nil
	}
	if err := errors.Join(locked("issuer", u.Issuer, s.env.Issuer), locked("clientId", u.ClientID, s.env.ClientID),
		locked("displayName", u.DisplayName, s.env.DisplayName)); err != nil {
		return nil, err
	}
	if u.ClientSecret != nil && s.env.ClientSecret != "" && *u.ClientSecret != s.env.ClientSecret {
		return nil, &ErrInvalidConfig{Msg: "clientSecret is set by OPENTODO_OIDC_CLIENT_SECRET and cannot be changed here"}
	}
	if u.SSOOnly != nil && s.env.SSOOnly != nil && *u.SSOOnly != *s.env.SSOOnly {
		return nil, &ErrInvalidConfig{Msg: "ssoOnly is set by OPENTODO_OIDC_SSO_ONLY and cannot be changed here"}
	}
	next := cur
	trim := func(p *string, dst *string, max int) error {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		if len(v) > max {
			return &ErrInvalidConfig{Msg: fmt.Sprintf("value too long (max %d characters)", max)}
		}
		*dst = v
		return nil
	}
	if err := errors.Join(trim(u.Issuer, &next.Issuer, 500), trim(u.ClientID, &next.ClientID, 500),
		trim(u.DisplayName, &next.DisplayName, 60), trim(u.Scopes, &next.Scopes, 500)); err != nil {
		return nil, err
	}
	next.Issuer = trimSlash(next.Issuer)
	if next.Scopes == "" {
		next.Scopes = DefaultScopes
	}
	if !contains(strings.Fields(next.Scopes), "openid") {
		return nil, &ErrInvalidConfig{Msg: "scopes must include openid"}
	}
	if u.AllowProvision != nil {
		next.AllowProvision = *u.AllowProvision
	}
	if u.SSOOnly != nil {
		next.SSOOnly = *u.SSOOnly
	}
	if u.ProviderLogout != nil {
		next.ProviderLogout = *u.ProviderLogout
	}
	if u.SyncPictures != nil {
		next.SyncPictures = *u.SyncPictures
	}
	if next.Issuer != "" {
		if next.ClientID == "" {
			return nil, &ErrInvalidConfig{Msg: "clientId is required when an issuer is set"}
		}
		if next.Issuer != cur.Issuer || cur.Issuer == "" {
			if _, err := s.Test(ctx, next.Issuer); err != nil {
				return nil, err
			}
		}
	}
	var changes []Change
	setStr := func(key, envVal, from, to string) error {
		if envVal != "" || from == to {
			return nil
		}
		changes = append(changes, Change{Key: key, From: from, To: to})
		return s.store.Set(ctx, key, to)
	}
	setBool := func(key string, envLocked bool, from, to bool) error {
		if envLocked || from == to {
			return nil
		}
		changes = append(changes, Change{Key: key, From: fmt.Sprint(from), To: fmt.Sprint(to)})
		return s.store.Set(ctx, key, to)
	}
	curScopes := cur.Scopes
	if err := errors.Join(
		setStr(KeyIssuer, s.env.Issuer, cur.Issuer, next.Issuer),
		setStr(KeyClientID, s.env.ClientID, cur.ClientID, next.ClientID),
		setStr(KeyDisplayName, s.env.DisplayName, cur.DisplayName, next.DisplayName),
		setStr(KeyScopes, "", curScopes, next.Scopes),
		setBool(KeyAllowProvision, false, cur.AllowProvision, next.AllowProvision),
		setBool(KeySSOOnly, s.env.SSOOnly != nil, cur.SSOOnly, next.SSOOnly),
		setBool(KeyProviderLogout, false, cur.ProviderLogout, next.ProviderLogout),
		setBool(KeySyncPictures, false, cur.SyncPictures, next.SyncPictures),
	); err != nil {
		return nil, err
	}
	if u.ClientSecret != nil && s.env.ClientSecret == "" && *u.ClientSecret != cur.ClientSecret {
		v := strings.TrimSpace(*u.ClientSecret)
		if err := s.secrets.Update(map[string]*string{KeyClientSecret: &v}); err != nil {
			return nil, err
		}
		changes = append(changes, Change{Key: KeyClientSecret, From: "(changed)", To: "(changed)"})
	}
	return changes, nil
}

// MaskSecret shows the last four characters of a secret, or "" when unset.
func MaskSecret(v string) string {
	if v == "" {
		return ""
	}
	if len(v) <= 4 {
		return "••••"
	}
	return "••••" + v[len(v)-4:]
}
