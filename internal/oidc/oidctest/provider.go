// Package oidctest is an in-process OpenID Connect provider for tests: it
// serves discovery, an authorization endpoint that "logs in" a configurable
// user without any page, a token endpoint that checks PKCE and client
// authentication, a JWKS endpoint and an end-session endpoint, all over TLS.
// It is never linked into the server binary.
package oidctest

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/oidc"
)

// User is who the provider signs in at the next authorization request.
type User struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

// Provider is a running fake identity provider.
type Provider struct {
	Server       *httptest.Server
	ClientID     string
	ClientSecret string

	RSA   *rsa.PrivateKey
	EC    *ecdsa.PrivateKey
	Ed    ed25519.PrivateKey
	mu    sync.Mutex
	user  User
	alg   string
	codes map[string]grant
	// AuthorizeError, when set, is returned to the client as ?error=.
	AuthorizeError string
	// IssuerOverride, when set, is reported in discovery (mismatch tests).
	IssuerOverride string
	// MutateClaims, when set, edits the identity-token claims before signing.
	MutateClaims func(map[string]any)
	// LastAuthorize is the query of the most recent authorization request.
	LastAuthorize url.Values
	// TokenRequests counts token endpoint calls; JWKSRequests key-set fetches.
	TokenRequests, JWKSRequests int
	// LastClientAuth is "basic" or "post".
	LastClientAuth string
}

type grant struct {
	clientID, redirectURI, challenge, nonce string
	user                                    User
}

// TB is the part of testing.TB the provider needs, so a manual smoke run can
// start it outside a test too.
type TB interface {
	Helper()
	Fatal(args ...any)
	Cleanup(func())
}

// New starts a provider; it is closed with the test.
func New(t TB) *Provider {
	t.Helper()
	p := &Provider{ClientID: "opentodo", ClientSecret: "s3cret-value-1234", alg: "RS256", codes: map[string]grant{},
		user: User{Subject: "user-1", Email: "member@example.com", EmailVerified: true, Name: "Member"}}
	var err error
	if p.RSA, err = rsa.GenerateKey(rand.Reader, 2048); err != nil {
		t.Fatal(err)
	}
	if p.EC, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader); err != nil {
		t.Fatal(err)
	}
	if _, p.Ed, err = ed25519.GenerateKey(rand.Reader); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", p.discovery)
	mux.HandleFunc("GET /authorize", p.authorize)
	mux.HandleFunc("POST /token", p.token)
	mux.HandleFunc("GET /jwks", p.jwks)
	mux.HandleFunc("GET /logout", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	p.Server = httptest.NewTLSServer(mux)
	t.Cleanup(p.Server.Close)
	return p
}

// Issuer is the provider's issuer URL.
func (p *Provider) Issuer() string { return p.Server.URL }

// HTTPClient trusts the provider's certificate and never follows redirects,
// like the server's own client.
func (p *Provider) HTTPClient() *http.Client { return oidc.NewHTTPClient(p.Server.Client().Transport) }

// SetUser chooses who signs in next.
func (p *Provider) SetUser(u User) {
	p.mu.Lock()
	p.user = u
	p.mu.Unlock()
}

// SetAlg chooses the signing algorithm (RS256, PS256, ES256, EdDSA).
func (p *Provider) SetAlg(alg string) {
	p.mu.Lock()
	p.alg = alg
	p.mu.Unlock()
}

func (p *Provider) discovery(w http.ResponseWriter, r *http.Request) {
	iss := p.Issuer()
	if p.IssuerOverride != "" {
		iss = p.IssuerOverride
	}
	writeJSON(w, map[string]any{
		"issuer":                                iss,
		"authorization_endpoint":                p.Issuer() + "/authorize",
		"token_endpoint":                        p.Issuer() + "/token",
		"jwks_uri":                              p.Issuer() + "/jwks",
		"end_session_endpoint":                  p.Issuer() + "/logout",
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post"},
		"id_token_signing_alg_values_supported": []string{"RS256", "PS256", "ES256", "EdDSA"},
	})
}

func (p *Provider) authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p.mu.Lock()
	p.LastAuthorize = q
	u := p.user
	errCode := p.AuthorizeError
	p.mu.Unlock()
	back, err := url.Parse(q.Get("redirect_uri"))
	if err != nil || q.Get("response_type") != "code" || q.Get("code_challenge_method") != "S256" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	v := url.Values{"state": {q.Get("state")}}
	if errCode != "" {
		v.Set("error", errCode)
	} else {
		code := oidc.RandomString(16)
		p.mu.Lock()
		p.codes[code] = grant{clientID: q.Get("client_id"), redirectURI: q.Get("redirect_uri"), challenge: q.Get("code_challenge"), nonce: q.Get("nonce"), user: u}
		p.mu.Unlock()
		v.Set("code", code)
	}
	back.RawQuery = v.Encode()
	http.Redirect(w, r, back.String(), http.StatusFound)
}

func (p *Provider) token(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	p.mu.Lock()
	p.TokenRequests++
	g, ok := p.codes[r.PostForm.Get("code")]
	delete(p.codes, r.PostForm.Get("code"))
	alg := p.alg
	p.mu.Unlock()
	id, secret, basic := r.BasicAuth()
	if basic {
		id, _ = url.QueryUnescape(id)
		secret, _ = url.QueryUnescape(secret)
		p.LastClientAuth = "basic"
	} else {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
		p.LastClientAuth = "post"
	}
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	switch {
	case !ok, r.PostForm.Get("grant_type") != "authorization_code":
		tokenError(w, "invalid_grant")
		return
	case id != p.ClientID || secret != p.ClientSecret || g.clientID != p.ClientID:
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, map[string]string{"error": "invalid_client"})
		return
	case g.redirectURI != r.PostForm.Get("redirect_uri"):
		tokenError(w, "invalid_grant")
		return
	case base64.RawURLEncoding.EncodeToString(sum[:]) != g.challenge:
		tokenError(w, "invalid_grant")
		return
	}
	now := time.Now()
	claims := map[string]any{
		"iss": p.Issuer(), "sub": g.user.Subject, "aud": p.ClientID, "exp": now.Add(5 * time.Minute).Unix(),
		"iat": now.Unix(), "nonce": g.nonce, "name": g.user.Name,
	}
	if g.user.Email != "" {
		claims["email"] = g.user.Email
		claims["email_verified"] = g.user.EmailVerified
	}
	if p.MutateClaims != nil {
		p.MutateClaims(claims)
	}
	writeJSON(w, map[string]any{"access_token": "at", "token_type": "Bearer", "expires_in": 300, "id_token": p.Sign(claims, alg)})
}

func tokenError(w http.ResponseWriter, code string) {
	w.WriteHeader(http.StatusBadRequest)
	writeJSON(w, map[string]string{"error": code})
}

func (p *Provider) jwks(w http.ResponseWriter, r *http.Request) {
	p.mu.Lock()
	p.JWKSRequests++
	p.mu.Unlock()
	writeJSON(w, p.JWKS())
}

// JWKS returns the public key set.
func (p *Provider) JWKS() oidc.JWKS {
	enc := base64.RawURLEncoding.EncodeToString
	e := big.NewInt(int64(p.RSA.E)).Bytes()
	x, y := pad32(p.EC.X.Bytes()), pad32(p.EC.Y.Bytes())
	return oidc.JWKS{Keys: []oidc.JWK{
		{Kty: "RSA", Kid: "rsa1", Use: "sig", N: enc(p.RSA.N.Bytes()), E: enc(e)},
		{Kty: "EC", Kid: "ec1", Use: "sig", Alg: "ES256", Crv: "P-256", X: enc(x), Y: enc(y)},
		{Kty: "OKP", Kid: "ed1", Use: "sig", Alg: "EdDSA", Crv: "Ed25519", X: enc(p.Ed.Public().(ed25519.PublicKey))},
	}}
}

func pad32(b []byte) []byte {
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}

// Sign returns a compact JWS of claims with alg and the matching key id.
func (p *Provider) Sign(claims map[string]any, alg string) string {
	kid := map[string]string{"RS256": "rsa1", "PS256": "rsa1", "ES256": "ec1", "EdDSA": "ed1"}[alg]
	return p.SignWith(map[string]any{"alg": alg, "kid": kid, "typ": "JWT"}, claims)
}

// SignWith signs claims under an explicit header (negative tests may pass any
// alg or kid; the signature uses the key for the header's alg when known).
func (p *Provider) SignWith(header, claims map[string]any) string {
	enc := base64.RawURLEncoding.EncodeToString
	hb, _ := json.Marshal(header)
	cb, _ := json.Marshal(claims)
	input := enc(hb) + "." + enc(cb)
	h := sha256.Sum256([]byte(input))
	var sig []byte
	switch header["alg"] {
	case "RS256":
		sig, _ = rsa.SignPKCS1v15(rand.Reader, p.RSA, crypto.SHA256, h[:])
	case "PS256":
		sig, _ = rsa.SignPSS(rand.Reader, p.RSA, crypto.SHA256, h[:], &rsa.PSSOptions{SaltLength: rsa.PSSSaltLengthEqualsHash})
	case "ES256":
		r, s, _ := ecdsa.Sign(rand.Reader, p.EC, h[:])
		sig = append(pad32(r.Bytes()), pad32(s.Bytes())...)
	case "EdDSA":
		sig = ed25519.Sign(p.Ed, []byte(input))
	}
	return input + "." + enc(sig)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
