package pushrelay

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

// The APNs client (design D4, D5): HTTP/2 to Apple, a provider token (ES256
// JWT) signed again every APNsTokenRenewal, and payloads built from the kind
// alone. It makes no request to any other host.

// The APNs hosts of each environment.
const (
	ProductionHost  = "https://api.push.apple.com"
	DevelopmentHost = "https://api.sandbox.push.apple.com"
	// DefaultTopic is the iPhone app's bundle ID.
	DefaultTopic = "app.open-todo.ios"
	// PayloadVersion is "v" in every payload.
	PayloadVersion = 1
	apnsTimeout    = 10 * time.Second
)

// The two payloads (design D5). Nothing a caller sends reaches them.
var (
	refreshPayload = []byte(`{"aps":{"content-available":1},"v":1}`)
	duePayload     = []byte(`{"aps":{"alert":{"title-loc-key":"PUSH_DUE_TITLE","loc-key":"PUSH_DUE_BODY"},"mutable-content":1,"sound":"default","category":"opentodo.reminder"},"v":1}`)
)

// Outcome is what Apple made of a push.
type Outcome int

const (
	// Delivered: Apple accepted the push.
	Delivered Outcome = iota
	// Dead: Apple says the token is no longer valid for the app.
	Dead
	// Transient: try again later (Apple unreachable, throttled, 5xx).
	Transient
)

// Sender sends one wake-up to a device; the relay's only outbound path.
type Sender interface {
	Send(ctx context.Context, d Device, kind string) (Outcome, string)
}

// APNsConfig configures the client.
type APNsConfig struct {
	Key    *ecdsa.PrivateKey // the .p8 key
	KeyID  string
	TeamID string
	Topic  string // DefaultTopic when empty
	// Hosts overrides the base URL of an environment (tests).
	Hosts map[Environment]string
	// Client overrides the HTTP client (tests); its requests still go only to
	// the hosts above.
	Client *http.Client
	Now    func() time.Time
}

// APNs sends pushes to Apple.
type APNs struct {
	cfg    APNsConfig
	client *http.Client
	mu     sync.Mutex
	jwt    string
	jwtAt  time.Time
}

// NewAPNs builds the client.
func NewAPNs(cfg APNsConfig) (*APNs, error) {
	if cfg.Key == nil || cfg.KeyID == "" || cfg.TeamID == "" {
		return nil, errors.New("pushrelay: the APNs key, Key ID and Team ID are required")
	}
	if cfg.Topic == "" {
		cfg.Topic = DefaultTopic
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	hosts := map[Environment]string{Production: ProductionHost, Development: DevelopmentHost}
	for e, h := range cfg.Hosts {
		hosts[e] = h
	}
	cfg.Hosts = hosts
	allowed := map[string]bool{}
	for _, h := range hosts {
		u, err := url.Parse(h)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return nil, fmt.Errorf("pushrelay: APNs host %q must be an https URL", h)
		}
		allowed[u.Host] = true
	}
	base := cfg.Client
	if base == nil {
		base = &http.Client{Transport: &http.Transport{
			Proxy:               nil,
			ForceAttemptHTTP2:   true,
			TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
			MaxIdleConnsPerHost: 4,
			IdleConnTimeout:     5 * time.Minute,
		}}
	}
	rt := base.Transport
	if rt == nil {
		rt = http.DefaultTransport
	}
	client := &http.Client{Timeout: apnsTimeout, Transport: onlyHosts{allowed: allowed, next: rt},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return &APNs{cfg: cfg, client: client}, nil
}

// onlyHosts refuses every request to a host that is not Apple's.
type onlyHosts struct {
	allowed map[string]bool
	next    http.RoundTripper
}

// errOtherHost is a request the relay must never make.
var errOtherHost = errors.New("pushrelay: refused a request to a host other than APNs")

func (o onlyHosts) RoundTrip(r *http.Request) (*http.Response, error) {
	if !o.allowed[r.URL.Host] {
		return nil, errOtherHost
	}
	return o.next.RoundTrip(r)
}

// ParseP8 reads Apple's .p8 key file (PKCS #8, P-256).
func ParseP8(data []byte) (*ecdsa.PrivateKey, error) {
	b, _ := pem.Decode(data)
	if b == nil {
		return nil, errors.New("pushrelay: the APNs key file is not PEM")
	}
	k, err := x509.ParsePKCS8PrivateKey(b.Bytes)
	if err != nil {
		return nil, fmt.Errorf("pushrelay: the APNs key: %w", err)
	}
	ek, ok := k.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("pushrelay: the APNs key is not an ECDSA key")
	}
	return ek, nil
}

// providerToken returns the cached JWT, signing a new one when it is older
// than APNsTokenRenewal or was refused.
func (a *APNs) providerToken(force bool) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.cfg.Now()
	if !force && a.jwt != "" && now.Sub(a.jwtAt) < APNsTokenRenewal {
		return a.jwt, nil
	}
	enc := base64.RawURLEncoding
	head, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": a.cfg.KeyID})
	claims, _ := json.Marshal(map[string]any{"iss": a.cfg.TeamID, "iat": now.Unix()})
	signing := enc.EncodeToString(head) + "." + enc.EncodeToString(claims)
	sum := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, a.cfg.Key, sum[:])
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	a.jwt, a.jwtAt = signing+"."+enc.EncodeToString(sig), now
	return a.jwt, nil
}

// minResign is the least time between two provider tokens: Apple refuses
// updates more often than that (TooManyProviderTokenUpdates).
const minResign = 20 * time.Minute

// forgetToken drops a refused provider token, unless it was signed less than
// minResign ago: it is then kept until that much time has passed.
func (a *APNs) forgetToken() {
	a.mu.Lock()
	if a.cfg.Now().Sub(a.jwtAt) >= minResign {
		a.jwt = ""
	}
	a.mu.Unlock()
}

// Send pushes the fixed payload of kind to d. The reason is Apple's, cleaned
// for the counter line, or a class of its own.
func (a *APNs) Send(ctx context.Context, d Device, kind string) (Outcome, string) {
	jwt, err := a.providerToken(false)
	if err != nil {
		return Transient, "token"
	}
	now := a.cfg.Now()
	body, pushType, priority, expires := duePayload, "alert", "10", now.Add(10*time.Minute)
	if kind == KindRefresh {
		body, pushType, priority, expires = refreshPayload, "background", "5", now.Add(time.Hour)
	}
	ctx, cancel := context.WithTimeout(ctx, apnsTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.cfg.Hosts[d.Env]+"/3/device/"+hex.EncodeToString(d.Token), bytes.NewReader(body))
	if err != nil {
		return Transient, "request"
	}
	req.Header.Set("authorization", "bearer "+jwt)
	req.Header.Set("apns-topic", a.cfg.Topic)
	req.Header.Set("apns-push-type", pushType)
	req.Header.Set("apns-priority", priority)
	req.Header.Set("apns-expiration", strconv.FormatInt(expires.Unix(), 10))
	if kind == KindRefresh {
		req.Header.Set("apns-collapse-id", "refresh")
	}
	req.Header.Set("content-type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		if errors.Is(err, errOtherHost) {
			return Transient, "host"
		}
		return Transient, "unreachable"
	}
	defer resp.Body.Close()
	var out struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&out)
	reason := cleanReason(out.Reason)
	switch {
	case resp.StatusCode == http.StatusOK:
		return Delivered, ""
	case resp.StatusCode == http.StatusGone,
		resp.StatusCode == http.StatusBadRequest && (reason == "BadDeviceToken" || reason == "DeviceTokenNotForTopic"):
		return Dead, reasonOr(reason, strconv.Itoa(resp.StatusCode))
	case resp.StatusCode == http.StatusForbidden && (reason == "ExpiredProviderToken" || reason == "InvalidProviderToken"):
		a.forgetToken()
	}
	return Transient, reasonOr(reason, strconv.Itoa(resp.StatusCode))
}

// cleanReason keeps Apple's reason only when it is a short word, so nothing
// odd reaches the counter line.
func cleanReason(s string) string {
	if len(s) == 0 || len(s) > 40 {
		return ""
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z') {
			return ""
		}
	}
	return s
}

func reasonOr(r, fallback string) string {
	if r != "" {
		return r
	}
	return fallback
}
