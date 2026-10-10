package oidc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Outbound requests (design D1): only to the configured issuer's discovery
// document and the token and key endpoints it names, with a 10-second timeout
// and redirects disabled.

// ClientTimeout bounds every request to the provider.
const ClientTimeout = 10 * time.Second

// maxBody caps provider responses.
const maxBody = 1 << 20

// NewHTTPClient returns the client used for provider requests: 10-second
// timeout, no redirects. base may be nil (http.DefaultTransport).
func NewHTTPClient(base http.RoundTripper) *http.Client {
	return &http.Client{
		Timeout:   ClientTimeout,
		Transport: base,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// Metadata is the subset of the discovery document OpenTodo uses.
type Metadata struct {
	Issuer                   string   `json:"issuer"`
	AuthorizationEndpoint    string   `json:"authorization_endpoint"`
	TokenEndpoint            string   `json:"token_endpoint"`
	JWKSURI                  string   `json:"jwks_uri"`
	EndSessionEndpoint       string   `json:"end_session_endpoint,omitempty"`
	CodeChallengeMethods     []string `json:"code_challenge_methods_supported,omitempty"`
	TokenEndpointAuthMethods []string `json:"token_endpoint_auth_methods_supported,omitempty"`
}

// ErrDiscovery wraps discovery failures; the message is safe to show the owner.
var ErrDiscovery = errors.New("discovery failed")

// ValidateIssuer checks that issuer is an absolute https URL without query or fragment.
func ValidateIssuer(issuer string) error {
	u, err := url.Parse(issuer)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return errors.New("issuer must be an https URL such as https://sso.example.com/realms/home")
	}
	return nil
}

func trimSlash(s string) string { return strings.TrimRight(s, "/") }

// Discover fetches <issuer>/.well-known/openid-configuration and checks that it
// names the same issuer and https endpoints.
func Discover(ctx context.Context, c *http.Client, issuer string) (*Metadata, error) {
	if err := ValidateIssuer(issuer); err != nil {
		return nil, err
	}
	var m Metadata
	if err := getJSON(ctx, c, trimSlash(issuer)+"/.well-known/openid-configuration", &m); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDiscovery, err)
	}
	if trimSlash(m.Issuer) != trimSlash(issuer) {
		return nil, fmt.Errorf("%w: the provider reports issuer %q, which differs from the configured %q", ErrDiscovery, m.Issuer, issuer)
	}
	for name, v := range map[string]string{"authorization_endpoint": m.AuthorizationEndpoint, "token_endpoint": m.TokenEndpoint, "jwks_uri": m.JWKSURI} {
		u, err := url.Parse(v)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return nil, fmt.Errorf("%w: %s must be an https URL", ErrDiscovery, name)
		}
	}
	if m.EndSessionEndpoint != "" {
		if u, err := url.Parse(m.EndSessionEndpoint); err != nil || u.Scheme != "https" || u.Host == "" {
			m.EndSessionEndpoint = ""
		}
	}
	if len(m.CodeChallengeMethods) > 0 && !contains(m.CodeChallengeMethods, "S256") {
		return nil, fmt.Errorf("%w: the provider does not support PKCE with S256", ErrDiscovery)
	}
	return &m, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func getJSON(ctx context.Context, c *http.Client, u string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("request to %s failed: %v", hostOf(u), err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s answered HTTP %d", hostOf(u), resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(dst); err != nil {
		return fmt.Errorf("%s returned invalid JSON", hostOf(u))
	}
	return nil
}

// hostOf returns the host of u, for messages that must not echo full URLs.
func hostOf(u string) string {
	if p, err := url.Parse(u); err == nil && p.Host != "" {
		return p.Host
	}
	return "the provider"
}

// HostOf is exported for the settings test response.
func HostOf(u string) string { return hostOf(u) }

// ---- PKCE and random values ----

// RandomString returns n random bytes as base64url.
func RandomString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// PKCEChallenge returns the S256 code challenge of verifier (RFC 7636).
func PKCEChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// AuthCodeURL builds the authorization request.
func AuthCodeURL(m *Metadata, clientID, redirectURI, scopes, state, nonce, verifier string) string {
	q := url.Values{
		"response_type":         {"code"},
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"scope":                 {scopes},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {PKCEChallenge(verifier)},
		"code_challenge_method": {"S256"},
	}
	sep := "?"
	if strings.Contains(m.AuthorizationEndpoint, "?") {
		sep = "&"
	}
	return m.AuthorizationEndpoint + sep + q.Encode()
}

// EndSessionURL builds the RP-initiated logout request, or "" when the provider
// publishes no end-session endpoint.
func EndSessionURL(m *Metadata, clientID, idTokenHint, postLogoutRedirect string) string {
	if m == nil || m.EndSessionEndpoint == "" {
		return ""
	}
	q := url.Values{"client_id": {clientID}, "post_logout_redirect_uri": {postLogoutRedirect}}
	if idTokenHint != "" {
		q.Set("id_token_hint", idTokenHint)
	}
	sep := "?"
	if strings.Contains(m.EndSessionEndpoint, "?") {
		sep = "&"
	}
	return m.EndSessionEndpoint + sep + q.Encode()
}

// ---- token exchange ----

// ErrExchange wraps token-endpoint failures (never shown to users verbatim).
var ErrExchange = errors.New("oidc: code exchange failed")

// Exchange redeems the authorization code and returns the raw identity token.
// The client authenticates with HTTP basic auth unless the provider only
// lists client_secret_post; a public client (no secret) sends only client_id.
func Exchange(ctx context.Context, c *http.Client, m *Metadata, clientID, clientSecret, code, verifier, redirectURI string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"code_verifier": {verifier},
	}
	basic := clientSecret != "" && (len(m.TokenEndpointAuthMethods) == 0 || contains(m.TokenEndpointAuthMethods, "client_secret_basic"))
	if !basic {
		form.Set("client_id", clientID)
		if clientSecret != "" {
			form.Set("client_secret", clientSecret)
		}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchange, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if basic {
		// RFC 6749 2.3.1: form-encode both parts before basic auth.
		req.SetBasicAuth(url.QueryEscape(clientID), url.QueryEscape(clientSecret))
	}
	resp, err := c.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExchange, err)
	}
	defer resp.Body.Close()
	var out struct {
		IDToken          string `json:"id_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(&out); err != nil {
		return "", fmt.Errorf("%w: HTTP %d with invalid JSON", ErrExchange, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK || out.Error != "" {
		return "", fmt.Errorf("%w: HTTP %d %s %s", ErrExchange, resp.StatusCode, out.Error, out.ErrorDescription)
	}
	if out.IDToken == "" {
		return "", fmt.Errorf("%w: no id_token in the response", ErrExchange)
	}
	return out.IDToken, nil
}

// ---- cached provider (discovery + key set) ----

// discoveryTTL is how long a discovery document is reused.
const discoveryTTL = time.Hour

// jwksMinRefresh rate-limits key-set refreshes caused by unknown key ids, so a
// flood of forged tokens cannot turn into a flood of requests to the provider.
const jwksMinRefresh = 10 * time.Second

// Provider caches one issuer's discovery document and key set.
type Provider struct {
	issuer string
	client *http.Client
	now    func() time.Time

	mu        sync.Mutex
	meta      *Metadata
	metaAt    time.Time
	keys      []JWK
	keysAt    time.Time
	keysTried time.Time
}

// NewProvider returns a lazily-populated cache for issuer.
func NewProvider(issuer string, c *http.Client, now func() time.Time) *Provider {
	if now == nil {
		now = time.Now
	}
	return &Provider{issuer: issuer, client: c, now: now}
}

// Issuer is the configured issuer this cache serves.
func (p *Provider) Issuer() string { return p.issuer }

// Metadata returns the cached discovery document, fetching it when absent or stale.
func (p *Provider) Metadata(ctx context.Context) (*Metadata, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.meta != nil && p.now().Sub(p.metaAt) < discoveryTTL {
		return p.meta, nil
	}
	m, err := Discover(ctx, p.client, p.issuer)
	if err != nil {
		return nil, err
	}
	p.meta, p.metaAt = m, p.now()
	return m, nil
}

// CachedMetadata returns the discovery document only if it is already cached.
func (p *Provider) CachedMetadata() *Metadata {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.meta
}

// Keys returns keys for kid, refreshing the key set once when kid is unknown.
func (p *Provider) Keys(ctx context.Context, kid string) ([]JWK, error) {
	m, err := p.Metadata(ctx)
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if hasKid(p.keys, kid) {
		return p.keys, nil
	}
	if !p.keysTried.IsZero() && p.now().Sub(p.keysTried) < jwksMinRefresh {
		return p.keys, nil
	}
	p.keysTried = p.now()
	var set JWKS
	if err := getJSON(ctx, p.client, m.JWKSURI, &set); err != nil {
		return nil, err
	}
	p.keys, p.keysAt = set.Keys, p.now()
	return p.keys, nil
}

func hasKid(keys []JWK, kid string) bool {
	for _, k := range keys {
		if k.Kid == kid {
			return true
		}
	}
	return false
}

// Verify checks an identity token against this provider's keys.
func (p *Provider) Verify(ctx context.Context, raw, clientID, nonce string, now time.Time) (*Claims, error) {
	m, err := p.Metadata(ctx)
	if err != nil {
		return nil, err
	}
	return VerifyIDToken(raw, func(kid string) ([]JWK, error) { return p.Keys(ctx, kid) },
		VerifyOptions{Issuer: m.Issuer, ClientID: clientID, Nonce: nonce, Now: now})
}
