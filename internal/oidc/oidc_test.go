package oidc_test

import (
	"context"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/oidc"
	"github.com/pixari/opentodo/internal/oidc/oidctest"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

func baseClaims(p *oidctest.Provider, now time.Time) map[string]any {
	return map[string]any{
		"iss": p.Issuer(), "sub": "abc", "aud": p.ClientID, "exp": now.Add(5 * time.Minute).Unix(),
		"iat": now.Unix(), "nonce": "n-1", "email": "a@example.com", "email_verified": true,
	}
}

func lookup(p *oidctest.Provider) oidc.KeyLookup {
	return func(string) ([]oidc.JWK, error) { return p.JWKS().Keys, nil }
}

func opts(p *oidctest.Provider, now time.Time) oidc.VerifyOptions {
	return oidc.VerifyOptions{Issuer: p.Issuer(), ClientID: p.ClientID, Nonce: "n-1", Now: now}
}

// TestVerifyIDTokenVectors covers every accepted algorithm and the refusals:
// alg none, HMAC confusion, unknown or missing kid, tampering, and each claim
// check (issuer, audience, azp, expiry with leeway, iat, nbf, nonce, sub).
func TestVerifyIDTokenVectors(t *testing.T) {
	p := oidctest.New(t)
	now := time.Now()
	for _, alg := range []string{"RS256", "PS256", "ES256", "EdDSA"} {
		t.Run("accept "+alg, func(t *testing.T) {
			c, err := oidc.VerifyIDToken(p.Sign(baseClaims(p, now), alg), lookup(p), opts(p, now))
			if err != nil {
				t.Fatal(err)
			}
			if c.Subject != "abc" || c.Email != "a@example.com" || !bool(c.EmailVerified) {
				t.Fatalf("claims = %+v", c)
			}
		})
	}
	t.Run("accept within leeway, array audience with azp, string email_verified", func(t *testing.T) {
		cl := baseClaims(p, now)
		cl["exp"] = now.Add(-30 * time.Second).Unix()
		cl["aud"] = []string{p.ClientID, "other"}
		cl["azp"] = p.ClientID
		cl["email_verified"] = "true"
		if _, err := oidc.VerifyIDToken(p.Sign(cl, "RS256"), lookup(p), opts(p, now)); err != nil {
			t.Fatal(err)
		}
	})

	enc := base64.RawURLEncoding.EncodeToString
	hdr := func(h map[string]any) string { b, _ := json.Marshal(h); return enc(b) }
	payload := func(c map[string]any) string { b, _ := json.Marshal(c); return enc(b) }
	// HS256 "signed" with the RSA modulus as the secret: the classic key confusion.
	confusion := func() string {
		in := hdr(map[string]any{"alg": "HS256", "kid": "rsa1"}) + "." + payload(baseClaims(p, now))
		m := hmac.New(sha256.New, p.RSA.N.Bytes())
		m.Write([]byte(in))
		return in + "." + enc(m.Sum(nil))
	}
	mutate := func(f func(map[string]any)) string {
		cl := baseClaims(p, now)
		f(cl)
		return p.Sign(cl, "RS256")
	}
	good := p.Sign(baseClaims(p, now), "RS256")
	parts := strings.Split(good, ".")
	other := baseClaims(p, now)
	other["sub"] = "someone-else"

	cases := map[string]string{
		"alg none":            hdr(map[string]any{"alg": "none", "kid": "rsa1"}) + "." + payload(baseClaims(p, now)) + ".",
		"alg HS256 confusion": confusion(),
		"alg RS512":           p.SignWith(map[string]any{"alg": "RS512", "kid": "rsa1"}, baseClaims(p, now)),
		"missing kid":         p.SignWith(map[string]any{"alg": "RS256"}, baseClaims(p, now)),
		"unknown kid":         p.SignWith(map[string]any{"alg": "RS256", "kid": "nope"}, baseClaims(p, now)),
		"kid of another key":  p.SignWith(map[string]any{"alg": "RS256", "kid": "ec1"}, baseClaims(p, now)),
		"crit header":         p.SignWith(map[string]any{"alg": "RS256", "kid": "rsa1", "crit": []string{"x"}}, baseClaims(p, now)),
		"tampered payload":    parts[0] + "." + payload(other) + "." + parts[2],
		"truncated signature": parts[0] + "." + parts[1] + "." + parts[2][:20],
		"two parts":           parts[0] + "." + parts[1],
		"wrong issuer":        mutate(func(c map[string]any) { c["iss"] = "https://evil.example.com" }),
		"wrong audience":      mutate(func(c map[string]any) { c["aud"] = "someone-else" }),
		"azp mismatch":        mutate(func(c map[string]any) { c["aud"] = []string{p.ClientID, "x"}; c["azp"] = "x" }),
		"multi aud no azp":    mutate(func(c map[string]any) { c["aud"] = []string{p.ClientID, "x"} }),
		"expired":             mutate(func(c map[string]any) { c["exp"] = now.Add(-2 * time.Minute).Unix() }),
		"no exp":              mutate(func(c map[string]any) { delete(c, "exp") }),
		"iat in future":       mutate(func(c map[string]any) { c["iat"] = now.Add(5 * time.Minute).Unix() }),
		"nbf in future":       mutate(func(c map[string]any) { c["nbf"] = now.Add(5 * time.Minute).Unix() }),
		"nonce mismatch":      mutate(func(c map[string]any) { c["nonce"] = "other" }),
		"no nonce":            mutate(func(c map[string]any) { delete(c, "nonce") }),
		"no sub":              mutate(func(c map[string]any) { delete(c, "sub") }),
	}
	for name, tok := range cases {
		t.Run("refuse "+name, func(t *testing.T) {
			if _, err := oidc.VerifyIDToken(tok, lookup(p), opts(p, now)); !errors.Is(err, oidc.ErrInvalidToken) {
				t.Fatalf("err = %v, want ErrInvalidToken", err)
			}
		})
	}
	t.Run("refuse ES256 key advertised for another alg", func(t *testing.T) {
		keys := p.JWKS().Keys
		for i := range keys {
			keys[i].Alg = "RS256"
		}
		tok := p.Sign(baseClaims(p, now), "ES256")
		if _, err := oidc.VerifyIDToken(tok, func(string) ([]oidc.JWK, error) { return keys, nil }, opts(p, now)); err == nil {
			t.Fatal("accepted a key whose alg does not match")
		}
	})
	t.Run("refuse small RSA key", func(t *testing.T) {
		keys := p.JWKS().Keys
		keys[0].N = enc(p.RSA.N.Bytes()[:128]) // 1024-bit modulus
		if _, err := oidc.VerifyIDToken(good, func(string) ([]oidc.JWK, error) { return keys, nil }, opts(p, now)); err == nil {
			t.Fatal("accepted a 1024-bit RSA key")
		}
	})
}

// TestRFC8037Ed25519Vector checks the EdDSA path against the published RFC 8037
// appendix A.4 signature (no kid in that header, so the key is tagged with one
// and the token re-headed is not possible; the raw signature is checked).
func TestRFC8037Ed25519Vector(t *testing.T) {
	x, _ := base64.RawURLEncoding.DecodeString("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")
	jws := "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg"
	parts := strings.Split(jws, ".")
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if !ed25519.Verify(ed25519.PublicKey(x), []byte(parts[0]+"."+parts[1]), sig) {
		t.Fatal("RFC 8037 A.4 vector does not verify")
	}
	// The same key through the JWK path refuses this token because it has no kid.
	key := oidc.JWK{Kty: "OKP", Crv: "Ed25519", X: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}
	if _, err := oidc.VerifyIDToken(jws, func(string) ([]oidc.JWK, error) { return []oidc.JWK{key}, nil }, oidc.VerifyOptions{}); err == nil {
		t.Fatal("token without kid accepted")
	}
}

func TestDiscoveryRejectsIssuerMismatch(t *testing.T) {
	p := oidctest.New(t)
	ctx := context.Background()
	m, err := oidc.Discover(ctx, p.HTTPClient(), p.Issuer()+"/")
	if err != nil {
		t.Fatal(err)
	}
	if m.TokenEndpoint != p.Issuer()+"/token" || m.EndSessionEndpoint == "" {
		t.Fatalf("metadata = %+v", m)
	}
	p.IssuerOverride = "https://other.example.com"
	if _, err := oidc.Discover(ctx, p.HTTPClient(), p.Issuer()); !errors.Is(err, oidc.ErrDiscovery) || !strings.Contains(err.Error(), "differs") {
		t.Fatalf("mismatch err = %v", err)
	}
	if _, err := oidc.Discover(ctx, p.HTTPClient(), "http://sso.example.com"); err == nil {
		t.Fatal("http issuer accepted")
	}
	if _, err := oidc.Discover(ctx, p.HTTPClient(), p.Issuer()+"/missing"); !errors.Is(err, oidc.ErrDiscovery) {
		t.Fatalf("404 discovery err = %v", err)
	}
}

func TestFlowStateRoundTripAndExpiry(t *testing.T) {
	now := time.Now()
	clock := func() time.Time { return now }
	c := oidc.NewStateCodec(clock)
	f := c.New(oidc.ModeLink, "u1", "https://sso.example.com")
	cookie := c.Encode(f)
	got, err := c.Decode(cookie)
	if err != nil || *got != f {
		t.Fatalf("decode = %+v %v", got, err)
	}
	if f.State == f.Nonce || len(f.Verifier) < 43 {
		t.Fatalf("weak values: %+v", f)
	}
	// Wrong state, forged signature, other process key.
	if _, err := c.Consume(cookie, "other"); !errors.Is(err, oidc.ErrStateInvalid) {
		t.Fatalf("wrong state err = %v", err)
	}
	// Change one signature character whose six bits are all used: the last
	// character of a 43-character signature carries two unused bits, so
	// rewriting the tail could leave the decoded bytes unchanged.
	forged := []byte(cookie)
	i := len(forged) - 5
	if forged[i] == 'A' {
		forged[i] = 'B'
	} else {
		forged[i] = 'A'
	}
	if _, err := c.Decode(string(forged)); err == nil {
		t.Fatal("forged signature accepted")
	}
	if _, err := oidc.NewStateCodec(clock).Decode(cookie); err == nil {
		t.Fatal("cookie from another process accepted")
	}
	// Consumed once only.
	if _, err := c.Consume(cookie, f.State); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Consume(cookie, f.State); !errors.Is(err, oidc.ErrStateInvalid) {
		t.Fatalf("replay err = %v", err)
	}
	// Expiry after ten minutes.
	f2 := c.New(oidc.ModeLogin, "", "https://sso.example.com")
	cookie2 := c.Encode(f2)
	now = now.Add(oidc.FlowTTL + time.Second)
	if _, err := c.Consume(cookie2, f2.State); !errors.Is(err, oidc.ErrStateInvalid) {
		t.Fatalf("expired err = %v", err)
	}
}

func TestJWKSRefreshOnUnknownKid(t *testing.T) {
	p := oidctest.New(t)
	now := time.Now()
	clock := now
	prov := oidc.NewProvider(p.Issuer(), p.HTTPClient(), func() time.Time { return clock })
	ctx := context.Background()
	tok := p.Sign(baseClaims(p, now), "ES256")
	if _, err := prov.Verify(ctx, tok, p.ClientID, "n-1", now); err != nil {
		t.Fatal(err)
	}
	if p.JWKSRequests != 1 {
		t.Fatalf("jwks requests = %d", p.JWKSRequests)
	}
	// Known kid: served from the cache.
	if _, err := prov.Verify(ctx, p.Sign(baseClaims(p, now), "RS256"), p.ClientID, "n-1", now); err != nil {
		t.Fatal(err)
	}
	// Unknown kid: one refresh, then rate limited.
	bad := p.SignWith(map[string]any{"alg": "RS256", "kid": "rotated"}, baseClaims(p, now))
	clock = clock.Add(time.Minute)
	for i := 0; i < 3; i++ {
		if _, err := prov.Verify(ctx, bad, p.ClientID, "n-1", now); err == nil {
			t.Fatal("unknown kid accepted")
		}
	}
	if p.JWKSRequests != 2 {
		t.Fatalf("jwks requests after unknown kid = %d, want 2", p.JWKSRequests)
	}
}

func newService(t *testing.T, env oidc.Env, p *oidctest.Provider) (*oidc.Service, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	o := oidc.Options{Env: env}
	if p != nil {
		o.Client = p.HTTPClient()
	}
	return oidc.New(settings.New(db), dir, o), dir
}

func ptr[T any](v T) *T { return &v }

func TestSettingsEnvOverride(t *testing.T) {
	p := oidctest.New(t)
	ctx := context.Background()

	// Without environment: everything comes from Settings, off by default.
	svc, dir := newService(t, oidc.Env{}, p)
	c, err := svc.Config(ctx)
	if err != nil || c.Enabled() || c.Scopes != oidc.DefaultScopes || c.ManagedBy["issuer"] != "settings" {
		t.Fatalf("default config = %+v %v", c, err)
	}
	changes, err := svc.Save(ctx, oidc.Update{Issuer: ptr(p.Issuer()), ClientID: ptr("opentodo"), ClientSecret: ptr("top-secret-9876"), DisplayName: ptr("Home SSO")})
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 4 {
		t.Fatalf("changes = %+v", changes)
	}
	for _, ch := range changes {
		if strings.Contains(ch.From+ch.To, "top-secret") {
			t.Fatalf("secret in change log: %+v", ch)
		}
	}
	c, _ = svc.Config(ctx)
	if !c.Enabled() || c.ClientSecret != "top-secret-9876" || c.Name() != "Home SSO" {
		t.Fatalf("saved config = %+v", c)
	}
	if oidc.MaskSecret(c.ClientSecret) != "••••9876" {
		t.Fatalf("mask = %q", oidc.MaskSecret(c.ClientSecret))
	}
	// The secret lives in the secrets file, never in the settings table.
	sec, err := settings.NewSecretsFile(dir, "oidc").Load()
	if err != nil || sec.Value(oidc.KeyClientSecret) != "top-secret-9876" {
		t.Fatalf("secrets file = %v %v", sec, err)
	}
	// An issuer whose discovery fails is refused and the previous one stays.
	if _, err := svc.Save(ctx, oidc.Update{Issuer: ptr(p.Issuer() + "/nope")}); err == nil {
		t.Fatal("unreachable issuer saved")
	}
	if _, err := svc.Save(ctx, oidc.Update{Issuer: ptr("http://plain.example.com")}); err == nil {
		t.Fatal("http issuer saved")
	}
	if c, _ := svc.Config(ctx); c.Issuer != p.Issuer() {
		t.Fatalf("issuer after failed save = %q", c.Issuer)
	}
	// SSO-only needs an enabled provider.
	if _, err := svc.Save(ctx, oidc.Update{SSOOnly: ptr(true)}); err != nil || !svc.SSOOnly(ctx) {
		t.Fatalf("sso only = %v %v", svc.SSOOnly(ctx), err)
	}
	if _, err := svc.Save(ctx, oidc.Update{Issuer: ptr("")}); err != nil || svc.SSOOnly(ctx) {
		t.Fatalf("sso only without provider = %v %v", svc.SSOOnly(ctx), err)
	}

	// Environment overrides win, are reported, and lock the field.
	svc, _ = newService(t, oidc.Env{Issuer: p.Issuer(), ClientID: "opentodo", ClientSecret: "env-secret", SSOOnly: ptr(false)}, p)
	c, err = svc.Config(ctx)
	if err != nil || !c.Enabled() || c.ClientSecret != "env-secret" || c.ManagedBy["issuer"] != "env" || c.ManagedBy["clientSecret"] != "env" || c.ManagedBy["ssoOnly"] != "env" || c.ManagedBy["displayName"] != "settings" {
		t.Fatalf("env config = %+v %v", c, err)
	}
	var cfgErr *oidc.ErrInvalidConfig
	if _, err := svc.Save(ctx, oidc.Update{Issuer: ptr("https://other.example.com")}); !errors.As(err, &cfgErr) {
		t.Fatalf("changing an env issuer: %v", err)
	}
	if _, err := svc.Save(ctx, oidc.Update{SSOOnly: ptr(true)}); !errors.As(err, &cfgErr) {
		t.Fatalf("changing env sso-only: %v", err)
	}
	// Sending the same value back, and changing an unlocked field, is fine.
	if _, err := svc.Save(ctx, oidc.Update{Issuer: ptr(p.Issuer()), DisplayName: ptr("Office")}); err != nil {
		t.Fatal(err)
	}
	if c, _ := svc.Config(ctx); c.DisplayName != "Office" {
		t.Fatalf("display name = %q", c.DisplayName)
	}
}

func TestExchangeChecksPKCEAndClientAuth(t *testing.T) {
	p := oidctest.New(t)
	ctx := context.Background()
	m, err := oidc.Discover(ctx, p.HTTPClient(), p.Issuer())
	if err != nil {
		t.Fatal(err)
	}
	authorize := func(verifier string) string {
		u := oidc.AuthCodeURL(m, p.ClientID, "https://app.example.com/cb", oidc.DefaultScopes, "st", "n-1", verifier)
		resp, err := p.HTTPClient().Get(u)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		loc, _ := resp.Location()
		return loc.Query().Get("code")
	}
	code := authorize("verifier-verifier-verifier-verifier-verifier-1")
	if _, err := oidc.Exchange(ctx, p.HTTPClient(), m, p.ClientID, p.ClientSecret, code, "wrong-verifier", "https://app.example.com/cb"); err == nil {
		t.Fatal("wrong PKCE verifier accepted")
	}
	code = authorize("verifier-verifier-verifier-verifier-verifier-1")
	if _, err := oidc.Exchange(ctx, p.HTTPClient(), m, p.ClientID, "bad", code, "verifier-verifier-verifier-verifier-verifier-1", "https://app.example.com/cb"); err == nil {
		t.Fatal("bad client secret accepted")
	}
	code = authorize("verifier-verifier-verifier-verifier-verifier-1")
	tok, err := oidc.Exchange(ctx, p.HTTPClient(), m, p.ClientID, p.ClientSecret, code, "verifier-verifier-verifier-verifier-verifier-1", "https://app.example.com/cb")
	if err != nil || tok == "" || p.LastClientAuth != "basic" {
		t.Fatalf("exchange = %q %v (%s)", tok, err, p.LastClientAuth)
	}
	m.TokenEndpointAuthMethods = []string{"client_secret_post"}
	code = authorize("verifier-verifier-verifier-verifier-verifier-2")
	if _, err := oidc.Exchange(ctx, p.HTTPClient(), m, p.ClientID, p.ClientSecret, code, "verifier-verifier-verifier-verifier-verifier-2", "https://app.example.com/cb"); err != nil || p.LastClientAuth != "post" {
		t.Fatalf("post exchange: %v (%s)", err, p.LastClientAuth)
	}
	if q := p.LastAuthorize; q.Get("code_challenge_method") != "S256" || q.Get("nonce") != "n-1" || q.Get("scope") != oidc.DefaultScopes {
		t.Fatalf("authorize query = %v", q)
	}
}
