package calsync

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/settings"
)

// Google's OAuth endpoints and the scope calendar sync asks for (design D13).
const (
	GoogleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	GoogleTokenURL = "https://oauth2.googleapis.com/token"
	GoogleScope    = "https://www.googleapis.com/auth/calendar"
	// GoogleClientIDKey is the owner's client id in the settings table.
	GoogleClientIDKey = "calendar_sync.google_client_id"
	// StateTTL bounds a pending Google sign-in.
	StateTTL = 10 * time.Minute
)

// GoogleClient is the owner's OAuth client.
type GoogleClient struct {
	ID, Secret string
	// FromEnv is set when OPENTODO_GOOGLE_* configure it.
	FromEnv bool
}

// Complete reports whether both values are there.
func (g GoogleClient) Complete() bool { return g.ID != "" && g.Secret != "" }

// GoogleConfig resolves the Google client: the environment, else the settings
// table and the secrets file.
type GoogleConfig struct {
	Env     config.GoogleConfig
	Store   *settings.Store
	Secrets *Secrets
}

// Client returns the configured client (maybe incomplete).
func (g *GoogleConfig) Client(ctx context.Context) (GoogleClient, error) {
	if g.Env.Set() {
		return GoogleClient{ID: g.Env.ClientID, Secret: g.Env.ClientSecret, FromEnv: true}, nil
	}
	var c GoogleClient
	if _, err := g.Store.Get(ctx, GoogleClientIDKey, &c.ID); err != nil {
		return c, err
	}
	secret, err := g.Secrets.Get(GoogleSecretKey)
	c.Secret = secret
	return c, err
}

// Save stores the owner's client; a nil secret keeps the stored one, an empty
// one removes it.
func (g *GoogleConfig) Save(ctx context.Context, id string, secret *string) error {
	if err := g.Store.Set(ctx, GoogleClientIDKey, strings.TrimSpace(id)); err != nil {
		return err
	}
	if secret == nil {
		return nil
	}
	if *secret == "" {
		return g.Secrets.Delete(GoogleSecretKey)
	}
	return g.Secrets.Set(GoogleSecretKey, strings.TrimSpace(*secret))
}

// PKCE returns a new code verifier and its S256 challenge.
func PKCE() (verifier, challenge string) {
	verifier = ids.Secret(48)
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:])
}

// StateHash is how a state is stored (never the state itself).
func StateHash(state string) string { return hash16(state) + hash16("calsync\x00"+state) }

// AuthorizationURL is Google's consent page for this client, asking for a
// refresh token.
func AuthorizationURL(authURL, clientID, redirectURI, state, challenge string) string {
	q := url.Values{
		"client_id": {clientID}, "redirect_uri": {redirectURI}, "response_type": {"code"}, "scope": {GoogleScope},
		"access_type": {"offline"}, "prompt": {"consent"}, "include_granted_scopes": {"true"},
		"state": {state}, "code_challenge": {challenge}, "code_challenge_method": {"S256"},
	}
	return authURL + "?" + q.Encode()
}

// Token is an answer of Google's token endpoint.
type Token struct {
	Access  string
	Refresh string
	Expires time.Time
}

// TokenEndpoint talks to Google's token endpoint.
type TokenEndpoint struct {
	HTTP *http.Client
	URL  string
	now  func() time.Time
}

func (t *TokenEndpoint) post(ctx context.Context, form url.Values) (*Token, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.URL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, &Error{Reason: ReasonInvalid}
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := t.HTTP.Do(req)
	if err != nil {
		return nil, &Error{Reason: transportReason(err)}
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return nil, &Error{Reason: transportReason(err)}
	}
	var out struct {
		Access    string `json:"access_token"`
		Refresh   string `json:"refresh_token"`
		ExpiresIn int64  `json:"expires_in"`
		Error     string `json:"error"`
	}
	_ = json.Unmarshal(body, &out)
	switch {
	case out.Error == "invalid_grant", out.Error == "unauthorized_client", out.Error == "invalid_client":
		return nil, &Error{Reason: ReasonUnauthorized}
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, &Error{Reason: ReasonRateLimited, Until: retryAfter(resp.Header, time.Now())}
	case resp.StatusCode != http.StatusOK || out.Access == "":
		return nil, statusError(resp.StatusCode)
	}
	now := time.Now
	if t.now != nil {
		now = t.now
	}
	if out.ExpiresIn <= 0 {
		out.ExpiresIn = 3600
	}
	return &Token{Access: out.Access, Refresh: out.Refresh, Expires: now().Add(time.Duration(out.ExpiresIn) * time.Second)}, nil
}

// Exchange trades an authorization code for tokens.
func (t *TokenEndpoint) Exchange(ctx context.Context, c GoogleClient, code, verifier, redirectURI string) (*Token, error) {
	return t.post(ctx, url.Values{"grant_type": {"authorization_code"}, "code": {code}, "code_verifier": {verifier},
		"redirect_uri": {redirectURI}, "client_id": {c.ID}, "client_secret": {c.Secret}})
}

// Refresh gets a new access token; a revoked grant is ReasonUnauthorized.
func (t *TokenEndpoint) Refresh(ctx context.Context, c GoogleClient, refresh string) (*Token, error) {
	return t.post(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {c.ID}, "client_secret": {c.Secret}})
}

// tokenCache keeps access tokens in memory per connection (never stored).
type tokenCache struct {
	mu sync.Mutex
	m  map[string]Token
}

func (c *tokenCache) get(id string, now time.Time) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	t, ok := c.m[id]
	if !ok || now.Add(time.Minute).After(t.Expires) {
		return "", false
	}
	return t.Access, true
}

func (c *tokenCache) put(id string, t Token) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]Token{}
	}
	c.m[id] = t
}

func (c *tokenCache) drop(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.m, id)
}
