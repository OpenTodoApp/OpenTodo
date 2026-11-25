package pushrelay_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay/relaytest"
)

var start = time.Date(2026, 11, 25, 10, 0, 0, 0, time.UTC)

func post(t *testing.T, e *relaytest.Env, path string, body any) (int, map[string]any, http.Header) {
	t.Helper()
	var r io.Reader
	switch b := body.(type) {
	case string:
		r = strings.NewReader(b)
	default:
		raw, _ := json.Marshal(b)
		r = bytes.NewReader(raw)
	}
	resp, err := http.Post(e.Server.URL+path, "application/json", r)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out, resp.Header
}

func token() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type device struct {
	handle string
	key    []byte
	token  string
}

func register(t *testing.T, e *relaytest.Env, tok string) device {
	t.Helper()
	key, _ := pushrelay.NewWakeKey()
	status, out, _ := post(t, e, "/v1/register", map[string]string{"token": tok, "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key)})
	if status != 200 {
		t.Fatalf("register: %d %v", status, out)
	}
	return device{handle: out["handle"].(string), key: key, token: tok}
}

func wake(t *testing.T, e *relaytest.Env, d device, kind string) (int, string, http.Header) {
	t.Helper()
	ts := e.Clock.Now().Unix()
	status, out, h := post(t, e, "/v1/wake", map[string]any{"handle": d.handle, "kind": kind, "ts": ts, "sig": pushrelay.Sign(d.key, kind, ts, d.handle)})
	code, _ := out["error"].(string)
	return status, code, h
}

func TestRoutes(t *testing.T) {
	e := relaytest.New(t, start)
	// Health: the protocol and nothing else.
	resp, err := http.Get(e.Server.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || strings.TrimSpace(string(raw)) != `{"protocol":1}` {
		t.Fatalf("health: %d %s", resp.StatusCode, raw)
	}
	// Register: a handle 30 days ahead, and no request to Apple.
	tok := token()
	key, _ := pushrelay.NewWakeKey()
	status, out, _ := post(t, e, "/v1/register", map[string]string{"token": tok, "environment": "development", "wakeKey": base64.RawURLEncoding.EncodeToString(key)})
	if status != 200 || out["expiresAt"] != float64(start.Add(30*24*time.Hour).Unix()) {
		t.Fatalf("register: %d %v", status, out)
	}
	if n := len(e.APNs.Pushes()); n != 0 {
		t.Fatalf("registration made %d requests to Apple", n)
	}
	d := device{handle: out["handle"].(string), key: key, token: tok}
	if strings.Contains(d.handle, tok) {
		t.Fatal("the handle shows the token")
	}
	// Wake: 202, one push to that device.
	if status, code, _ := wake(t, e, d, "refresh"); status != 202 {
		t.Fatalf("wake: %d %q", status, code)
	}
	ps := e.APNs.Pushes()
	if len(ps) != 1 || ps[0].Path != "/3/device/"+tok || ps[0].Proto != "HTTP/2.0" {
		t.Fatalf("pushes %+v", ps)
	}
	// Malformed registrations.
	for name, body := range map[string]any{
		"not hex":          map[string]string{"token": strings.Repeat("z", 64), "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key)},
		"short token":      map[string]string{"token": tok[:62], "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key)},
		"long token":       map[string]string{"token": strings.Repeat("ab", 101), "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key)},
		"short wake key":   map[string]string{"token": tok, "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key[:31])},
		"bad environment":  map[string]string{"token": tok, "environment": "staging", "wakeKey": base64.RawURLEncoding.EncodeToString(key)},
		"missing field":    map[string]string{"token": tok, "environment": "production"},
		"extra field":      map[string]string{"token": tok, "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(key), "server": "x"},
		"not json":         "token=" + tok,
		"two objects":      `{"token":"` + tok + `","environment":"production","wakeKey":"` + base64.RawURLEncoding.EncodeToString(key) + `"} {}`,
		"over 4 KB":        `{"token":"` + tok + `","environment":"production","wakeKey":"` + base64.RawURLEncoding.EncodeToString(key) + `"` + strings.Repeat(" ", 4096) + `}`,
		"wake key padding": map[string]string{"token": tok, "environment": "production", "wakeKey": base64.URLEncoding.EncodeToString(key)},
	} {
		if status, out, _ := post(t, e, "/v1/register", body); status != 400 || out["error"] != "invalid" {
			t.Errorf("%s: %d %v, want 400 invalid", name, status, out)
		}
	}
	// Other routes and methods.
	for _, c := range []struct {
		method, path string
		status       int
		code         string
	}{{"GET", "/v1/register", 405, "method"}, {"POST", "/v1/health", 405, "method"}, {"GET", "/v1/devices", 404, "not-found"},
		{"GET", "/metrics", 404, "not-found"}, {"GET", "/debug/pprof/", 404, "not-found"}, {"GET", "/", 404, "not-found"}} {
		req, _ := http.NewRequest(c.method, e.Server.URL+c.path, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		var out map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&out)
		resp.Body.Close()
		if resp.StatusCode != c.status || out["error"] != c.code {
			t.Errorf("%s %s = %d %v", c.method, c.path, resp.StatusCode, out)
		}
		if resp.Header.Get("Access-Control-Allow-Origin") != "" || resp.Header.Get("Set-Cookie") != "" {
			t.Errorf("%s %s sets CORS or a cookie", c.method, c.path)
		}
	}
}

func TestExpiredAndGone(t *testing.T) {
	e := relaytest.New(t, start)
	d := register(t, e, token())
	e.Clock.Add(30 * 24 * time.Hour)
	if status, code, _ := wake(t, e, d, "due"); status != 410 || code != "expired" {
		t.Fatalf("expired: %d %q", status, code)
	}
	if n := len(e.APNs.Pushes()); n != 0 {
		t.Fatalf("an expired handle reached Apple %d times", n)
	}
}

func TestWakeNeedsSignatureOverHTTP(t *testing.T) {
	e := relaytest.New(t, start)
	d := register(t, e, token())
	other, _ := pushrelay.NewWakeKey()
	ts := start.Unix()
	for name, body := range map[string]map[string]any{
		"without the wake key": {"handle": d.handle, "kind": "refresh", "ts": ts, "sig": pushrelay.Sign(other, "refresh", ts, d.handle)},
		"kind changed":         {"handle": d.handle, "kind": "due", "ts": ts, "sig": pushrelay.Sign(d.key, "refresh", ts, d.handle)},
		"stale":                {"handle": d.handle, "kind": "refresh", "ts": ts - 301, "sig": pushrelay.Sign(d.key, "refresh", ts-301, d.handle)},
	} {
		if status, out, _ := post(t, e, "/v1/wake", body); status != 401 || out["error"] != "signature" {
			t.Errorf("%s: %d %v", name, status, out)
		}
	}
	if n := len(e.APNs.Pushes()); n != 0 {
		t.Fatalf("%d pushes without a valid signature", n)
	}
}

// answer reads one wake's whole answer, for comparing refusals byte for byte.
func answer(t *testing.T, e *relaytest.Env, body map[string]any) string {
	t.Helper()
	raw, _ := json.Marshal(body)
	resp, err := http.Post(e.Server.URL+"/v1/wake", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.Status + " " + resp.Header.Get("Content-Type") + " " + string(b)
}

func TestForgedHandleLooksLikeBadSignature(t *testing.T) {
	old := relaytest.SealKey(1)
	e := relaytest.New(t, start, old, relaytest.SealKey(2))
	d := register(t, e, token())
	ts := start.Unix()
	wrongSig := answer(t, e, map[string]any{"handle": d.handle, "kind": "due", "ts": ts, "sig": pushrelay.Sign([]byte("not the key"), "due", ts, d.handle)})
	// A handle of a key this relay does not hold, sealed elsewhere.
	other := relaytest.New(t, start, relaytest.SealKey(9))
	foreign := register(t, other, token())
	raw, _ := base64.RawURLEncoding.DecodeString(d.handle[3:])
	raw[len(raw)-1] ^= 1
	tampered := "h1." + base64.RawURLEncoding.EncodeToString(raw)
	for name, h := range map[string]string{"forged": "h1." + base64.RawURLEncoding.EncodeToString(make([]byte, 80)), "unknown key": foreign.handle,
		"tampered": tampered, "not a handle": "hello"} {
		got := answer(t, e, map[string]any{"handle": h, "kind": "due", "ts": ts, "sig": pushrelay.Sign(foreign.key, "due", ts, h)})
		if got != wrongSig {
			t.Errorf("%s: %q, want the wrong signature's %q", name, got, wrongSig)
		}
	}
	if !strings.HasPrefix(wrongSig, "401 ") || !strings.Contains(wrongSig, `"signature"`) {
		t.Fatalf("wrong signature answered %q", wrongSig)
	}
}

func TestRelayPayloadsAreFixed(t *testing.T) {
	e := relaytest.New(t, start)
	tok := token()
	d := register(t, e, tok)
	if s, c, _ := wake(t, e, d, "refresh"); s != 202 {
		t.Fatalf("refresh: %d %s", s, c)
	}
	if s, c, _ := wake(t, e, d, "due"); s != 202 {
		t.Fatalf("due: %d %s", s, c)
	}
	ps := e.APNs.Pushes()
	if len(ps) != 2 {
		t.Fatalf("%d pushes", len(ps))
	}
	want := []struct{ body, pushType, priority, collapse, expires string }{
		{`{"aps":{"content-available":1},"v":1}`, "background", "5", "refresh", "3600"},
		{`{"aps":{"alert":{"title-loc-key":"PUSH_DUE_TITLE","loc-key":"PUSH_DUE_BODY"},"mutable-content":1,"sound":"default","category":"opentodo.reminder"},"v":1}`, "alert", "10", "", "600"},
	}
	for i, w := range want {
		p := ps[i]
		if p.Body != w.body {
			t.Errorf("push %d body %s", i, p.Body)
		}
		h := p.Header
		exp, _ := new(big.Int).SetString(h.Get("Apns-Expiration"), 10)
		if h.Get("Apns-Push-Type") != w.pushType || h.Get("Apns-Priority") != w.priority || h.Get("Apns-Collapse-Id") != w.collapse ||
			h.Get("Apns-Topic") != "app.open-todo.ios" || exp == nil || exp.Int64()-start.Unix() != mustInt(w.expires) {
			t.Errorf("push %d headers %v", i, h)
		}
		for k := range h {
			if strings.HasPrefix(strings.ToLower(k), "apns-") && !map[string]bool{"apns-push-type": true, "apns-priority": true, "apns-collapse-id": true, "apns-topic": true, "apns-expiration": true}[strings.ToLower(k)] {
				t.Errorf("push %d carries %s", i, k)
			}
		}
		var v map[string]any
		_ = json.Unmarshal([]byte(p.Body), &v)
		aps := v["aps"].(map[string]any)
		if _, ok := aps["interruption-level"]; ok {
			t.Errorf("push %d sets an interruption level", i)
		}
		if strings.Contains(p.Body, tok) || strings.Contains(p.Body, "http") {
			t.Errorf("push %d carries the token or a URL", i)
		}
	}
}

func mustInt(s string) int64 {
	n, _ := new(big.Int).SetString(s, 10)
	return n.Int64()
}

func TestExtraFieldsRefused(t *testing.T) {
	e := relaytest.New(t, start)
	d := register(t, e, token())
	ts := start.Unix()
	sig := pushrelay.Sign(d.key, "due", ts, d.handle)
	for _, extra := range []string{"title", "url", "sound", "topic", "body", "category", "id", "aps"} {
		body := map[string]any{"handle": d.handle, "kind": "due", "ts": ts, "sig": sig, extra: "Call the bank"}
		if status, out, _ := post(t, e, "/v1/wake", body); status != 400 || out["error"] != "invalid" {
			t.Errorf("with %s: %d %v", extra, status, out)
		}
	}
	for _, kind := range []string{"alert", "", "REFRESH"} {
		body := map[string]any{"handle": d.handle, "kind": kind, "ts": ts, "sig": pushrelay.Sign(d.key, kind, ts, d.handle)}
		if status, out, _ := post(t, e, "/v1/wake", body); status != 400 || out["error"] != "invalid" {
			t.Errorf("kind %q: %d %v", kind, status, out)
		}
	}
	if n := len(e.APNs.Pushes()); n != 0 {
		t.Fatalf("%d pushes from refused wakes", n)
	}
}

func TestLimits(t *testing.T) {
	e := relaytest.New(t, start)
	d := register(t, e, token())
	for i := range 3 {
		if s, c, _ := wake(t, e, d, "refresh"); s != 202 {
			t.Fatalf("refresh %d: %d %s", i+1, s, c)
		}
	}
	s, c, h := wake(t, e, d, "refresh")
	if s != 429 || c != "limit" || h.Get("Retry-After") != "3600" {
		t.Fatalf("4th refresh: %d %s Retry-After %q", s, c, h.Get("Retry-After"))
	}
	if n := len(e.APNs.Pushes()); n != 3 {
		t.Fatalf("%d pushes, want 3", n)
	}
	// due: 4 an hour, 24 a day.
	sent := 0
	for hour := range 8 {
		e.Clock.Set(start.Add(time.Duration(hour) * time.Hour))
		for range 5 {
			if s, _, _ := wake(t, e, d, "due"); s == 202 {
				sent++
			}
		}
		if want := min(4*(hour+1), 24); sent != want {
			t.Fatalf("after hour %d: %d due sent, want %d", hour, sent, want)
		}
	}
	// The next UTC day starts over.
	e.Clock.Set(start.Add(24 * time.Hour))
	if s, _, _ := wake(t, e, d, "due"); s != 202 {
		t.Fatalf("the next day: %d", s)
	}
	// Registrations: 30 an hour per address, then 429 without reading the body.
	e.IP.Store("198.51.100.9")
	for i := range 30 {
		if s, out, _ := post(t, e, "/v1/register", map[string]string{"token": token(), "environment": "production", "wakeKey": base64.RawURLEncoding.EncodeToString(make([]byte, 32))}); s != 200 {
			t.Fatalf("registration %d: %d %v", i+1, s, out)
		}
	}
	if s, out, h := post(t, e, "/v1/register", "garbage"); s != 429 || out["error"] != "limit" || h.Get("Retry-After") == "" {
		t.Fatalf("31st registration: %d %v", s, out)
	}
	// Another address of the same IPv6 /56 shares a bucket.
	e.IP.Store("2001:db8:1:200::1")
	for range 30 {
		post(t, e, "/v1/register", "{}")
	}
	e.IP.Store("2001:db8:1:2ff::9")
	if s, _, _ := post(t, e, "/v1/register", "{}"); s != 429 {
		t.Fatalf("same /56: %d", s)
	}
	e.IP.Store("2001:db8:1:300::1")
	if s, _, _ := post(t, e, "/v1/register", "{}"); s != 400 {
		t.Fatalf("another /56: %d", s)
	}
	// The instance: 50 wakes a second across devices.
	var devs []device
	for i := range 60 {
		e.IP.Store([]string{"192.0.2.50", "192.0.2.51", "192.0.2.52"}[i/20]) // under the registration limit
		devs = append(devs, register(t, e, token()))
	}
	e.Clock.Set(start.Add(48 * time.Hour))
	accepted := 0
	for _, dev := range devs {
		if s, _, _ := wake(t, e, dev, "refresh"); s == 202 {
			accepted++
		}
	}
	if accepted != 50 {
		t.Fatalf("%d wakes in one second, want 50", accepted)
	}
	e.Clock.Add(time.Second)
	if s, _, _ := wake(t, e, devs[59], "refresh"); s != 202 {
		t.Fatalf("the next second: %d", s)
	}
}

func TestLimitsFollowTheTokenAcrossRegistrations(t *testing.T) {
	e := relaytest.New(t, start)
	tok := token()
	own := register(t, e, tok)
	e.IP.Store("198.51.100.66") // a stranger who knows the token
	stranger := register(t, e, tok)
	sent := 0
	for i := range 6 {
		d := own
		if i%2 == 1 {
			d = stranger
		}
		if s, _, _ := wake(t, e, d, "due"); s == 202 {
			sent++
		}
	}
	if sent != 4 {
		t.Fatalf("%d due alerts to one phone in an hour through two registrations, want 4", sent)
	}
	// Upper-case hex is the same token.
	upper := register(t, e, strings.ToUpper(tok))
	if s, _, _ := wake(t, e, upper, "due"); s != 429 {
		t.Fatalf("upper-case token escaped the cap: %d", s)
	}
}

func TestAPNsRequest(t *testing.T) {
	e := relaytest.New(t, start)
	d := register(t, e, token())
	wake(t, e, d, "refresh")
	e.Clock.Add(39 * time.Minute)
	wake(t, e, d, "due")
	e.Clock.Add(2 * time.Minute)
	wake(t, e, d, "due")
	ps := e.APNs.Pushes()
	if len(ps) != 3 {
		t.Fatalf("%d pushes", len(ps))
	}
	jwts := []string{}
	for _, p := range ps {
		auth, ok := strings.CutPrefix(p.Header.Get("Authorization"), "bearer ")
		if !ok {
			t.Fatalf("authorization %q", p.Header.Get("Authorization"))
		}
		jwts = append(jwts, auth)
		parts := strings.Split(auth, ".")
		if len(parts) != 3 {
			t.Fatalf("jwt %q", auth)
		}
		head, _ := base64.RawURLEncoding.DecodeString(parts[0])
		claims, _ := base64.RawURLEncoding.DecodeString(parts[1])
		if string(head) != `{"alg":"ES256","kid":"KEYID12345"}` || !strings.HasPrefix(string(claims), `{"iat":`) || !strings.Contains(string(claims), `"iss":"TEAMID1234"`) {
			t.Fatalf("jwt %s %s", head, claims)
		}
		sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
		sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		if len(sig) != 64 || !ecdsa.Verify(&e.Key.PublicKey, sum[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
			t.Fatal("jwt signature does not verify with the key")
		}
	}
	if jwts[0] != jwts[1] {
		t.Fatal("the provider token was renewed within 40 minutes")
	}
	if jwts[1] == jwts[2] {
		t.Fatal("the provider token was not renewed after 40 minutes")
	}
	// A refused provider token signed less than 20 minutes ago is kept (Apple
	// refuses more frequent updates); one older than that is signed again.
	e.APNs.Answer(func(relaytest.Push) (int, string) { return 403, "ExpiredProviderToken" })
	if s, c, _ := wake(t, e, d, "due"); s != 502 || c != "apns" {
		t.Fatalf("403: %d %s", s, c)
	}
	e.APNs.Answer(nil)
	e.Clock.Add(time.Second)
	wake(t, e, d, "due")
	ps = e.APNs.Pushes()
	if ps[len(ps)-1].Header.Get("Authorization") != ps[len(ps)-2].Header.Get("Authorization") {
		t.Fatal("a provider token signed a minute ago was signed again")
	}
	e.Clock.Add(21 * time.Minute)
	e.APNs.Answer(func(relaytest.Push) (int, string) { return 403, "ExpiredProviderToken" })
	wake(t, e, d, "due")
	e.APNs.Answer(nil)
	e.Clock.Add(time.Second)
	wake(t, e, d, "due")
	ps = e.APNs.Pushes()
	if ps[len(ps)-1].Header.Get("Authorization") == ps[len(ps)-2].Header.Get("Authorization") {
		t.Fatal("a refused provider token was used again")
	}
	// 5xx and throttling are transient.
	e.Clock.Add(time.Hour)
	e.APNs.Answer(func(relaytest.Push) (int, string) { return 503, "ServiceUnavailable" })
	if s, c, _ := wake(t, e, d, "refresh"); s != 502 || c != "apns" {
		t.Fatalf("503: %d %s", s, c)
	}
	if line := e.Relay.Stats().Flush(); !strings.Contains(line, "apns.ServiceUnavailable=1") || !strings.Contains(line, "wake.refresh.failed=1") {
		t.Fatalf("counters %q", line)
	}
}

func TestAPNsGone(t *testing.T) {
	e := relaytest.New(t, start)
	for _, c := range []struct {
		status int
		reason string
	}{{410, "Unregistered"}, {400, "BadDeviceToken"}, {400, "DeviceTokenNotForTopic"}, {410, ""}} {
		d := register(t, e, token())
		e.APNs.Answer(func(relaytest.Push) (int, string) { return c.status, c.reason })
		if s, code, _ := wake(t, e, d, "due"); s != 410 || code != "gone" {
			t.Errorf("%d %s: %d %q, want 410 gone", c.status, c.reason, s, code)
		}
	}
	d := register(t, e, token())
	e.APNs.Answer(func(relaytest.Push) (int, string) { return 400, "BadTopic" })
	if s, code, _ := wake(t, e, d, "due"); s != 502 || code != "apns" {
		t.Errorf("400 BadTopic: %d %q", s, code)
	}
	// An odd reason does not reach the counter line.
	e.APNs.Answer(func(relaytest.Push) (int, string) { return 500, `x y=1` })
	wake(t, e, register(t, e, token()), "refresh")
	if line := e.Relay.Stats().Flush(); strings.Contains(line, "x y") || !strings.Contains(line, "apns.500=") {
		t.Fatalf("counters %q", line)
	}
}

// recorder counts the requests of an http.RoundTripper.
type recorder struct {
	hosts []string
	next  http.RoundTripper
}

func (r *recorder) RoundTrip(req *http.Request) (*http.Response, error) {
	r.hosts = append(r.hosts, req.URL.Host)
	return r.next.RoundTrip(req)
}

func TestNoOtherOutbound(t *testing.T) {
	fake := relaytest.NewAPNs(t)
	rec := &recorder{next: fake.Server.Client().Transport}
	e := relaytest.New(t, start)
	apns, err := pushrelay.NewAPNs(pushrelay.APNsConfig{Key: e.Key, KeyID: "K", TeamID: "T",
		Hosts:  map[pushrelay.Environment]string{pushrelay.Production: fake.Server.URL},
		Client: &http.Client{Transport: rec}})
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := hex.DecodeString(token())
	key, _ := pushrelay.NewWakeKey()
	out, _ := apns.Send(context.Background(), pushrelay.Device{Token: tok, Env: pushrelay.Production, WakeKey: key, IssuedAt: start}, "due")
	if out != pushrelay.Delivered {
		t.Fatalf("send: %v", out)
	}
	if len(rec.hosts) != 1 || "https://"+rec.hosts[0] != fake.Server.URL {
		t.Fatalf("requests to %v", rec.hosts)
	}
	// The default hosts are Apple's and only Apple's.
	if pushrelay.ProductionHost != "https://api.push.apple.com" || pushrelay.DevelopmentHost != "https://api.sandbox.push.apple.com" {
		t.Fatal("APNs hosts changed")
	}
	// A host that is not https is refused at start.
	if _, err := pushrelay.NewAPNs(pushrelay.APNsConfig{Key: e.Key, KeyID: "K", TeamID: "T", Hosts: map[pushrelay.Environment]string{pushrelay.Production: "http://example.com"}}); err == nil {
		t.Fatal("an http APNs host was accepted")
	}
	// Registration and health make no outbound request at all.
	before := len(e.APNs.Pushes())
	register(t, e, token())
	http.Get(e.Server.URL + "/v1/health")
	if len(e.APNs.Pushes()) != before {
		t.Fatal("registration or health reached Apple")
	}
}
