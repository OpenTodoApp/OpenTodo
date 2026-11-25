package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
	"github.com/OpenTodoApp/opentodo/internal/pushrelay/relaytest"
)

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// relayFiles writes a .p8 key and a sealing-keys file and returns the
// environment that names them.
func relayFiles(t *testing.T) map[string]string {
	t.Helper()
	dir := t.TempDir()
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(k)
	keyFile := filepath.Join(dir, "AuthKey.p8")
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0o600); err != nil {
		t.Fatal(err)
	}
	seal := make([]byte, 32)
	_, _ = rand.Read(seal)
	sealFile := filepath.Join(dir, "seal.json")
	if err := os.WriteFile(sealFile, []byte(`[{"id":1,"key":"`+base64.RawURLEncoding.EncodeToString(seal)+`"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	return map[string]string{"PUSH_RELAY_APNS_KEY_FILE": keyFile, "PUSH_RELAY_APNS_KEY_ID": "KEYID", "PUSH_RELAY_APNS_TEAM_ID": "TEAM",
		"PUSH_RELAY_SEAL_KEYS_FILE": sealFile, "PUSH_RELAY_CLIENT_IP_HEADER": "X-Forwarded-For"}
}

// TestClientIPHeaderOnlyFromTrustedPeers: the header counts only from loopback
// or a trusted proxy, and only when it holds an IP address.
func TestClientIPHeaderOnlyFromTrustedPeers(t *testing.T) {
	env := relayFiles(t)
	env["PUSH_RELAY_TRUSTED_PROXIES"] = "192.0.2.0/24, 2001:db8::5"
	cfg, err := readConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	ip := clientIP("X-Forwarded-For", cfg.trusted)
	for _, c := range []struct{ peer, header, want string }{
		{"127.0.0.1:1", "203.0.113.9", "203.0.113.9"},
		{"[::1]:1", "spoof, 203.0.113.9", "203.0.113.9"},
		{"192.0.2.44:1", "203.0.113.9", "203.0.113.9"},
		{"[2001:db8::5]:1", "2001:db8:aa::1", "2001:db8:aa::1"},
		{"198.51.100.7:1", "203.0.113.9", "198.51.100.7"},
		{"127.0.0.1:1", "not-an-ip", "127.0.0.1"},
		{"127.0.0.1:1", "", "127.0.0.1"},
		{"[2001:db8::6]:1", "203.0.113.9", "2001:db8::6"},
	} {
		r, _ := http.NewRequest("POST", "/v1/wake", nil)
		r.RemoteAddr = c.peer
		if c.header != "" {
			r.Header.Set("X-Forwarded-For", c.header)
		}
		if got := ip(r); got != c.want {
			t.Errorf("peer %s header %q: %q, want %q", c.peer, c.header, got, c.want)
		}
	}
	env["PUSH_RELAY_TRUSTED_PROXIES"] = "nope"
	if _, err := readConfig(func(k string) string { return env[k] }); err == nil {
		t.Fatal("a bad trusted proxy was accepted")
	}
}

func TestConfigRequired(t *testing.T) {
	err := run(context.Background(), func(string) string { return "" }, &bytes.Buffer{}, nil, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "PUSH_RELAY_APNS_KEY_FILE") || !strings.Contains(err.Error(), "PUSH_RELAY_SEAL_KEYS_FILE") {
		t.Fatalf("err %v", err)
	}
}

// TestNoRequestDataInLogs: a day of registrations and wakes, good and bad,
// from many addresses, and the relay's whole output holds counter lines and
// error classes only.
func TestNoRequestDataInLogs(t *testing.T) {
	env := relayFiles(t)
	fake := relaytest.NewAPNs(t)
	clock := relaytest.NewClock(time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC))
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	out := &lockedBuffer{}
	ticks := make(chan time.Time)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, func(k string) string { return env[k] }, out, ln, ticks, &testHooks{
			apns:   map[pushrelay.Environment]string{pushrelay.Production: fake.Server.URL, pushrelay.Development: fake.Server.URL},
			client: fake.Server.Client(), now: clock.Now})
	}()
	base := "http://" + ln.Addr().String()
	send := func(ip, path, body string) map[string]any {
		req, _ := http.NewRequest("POST", base+path, strings.NewReader(body))
		req.Header.Set("X-Forwarded-For", ip)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var m map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&m)
		return m
	}
	var secrets []string // what must never appear in the output
	type dev struct {
		handle string
		key    []byte
	}
	var devs []dev
	for hour := range 24 {
		clock.Set(time.Date(2026, 11, 25, hour, 0, 0, 0, time.UTC))
		ip := fmt.Sprintf("198.51.100.%d", 10+hour)
		ip6 := fmt.Sprintf("2001:db8:%x::%x", hour+1, hour+7)
		secrets = append(secrets, ip, ip6)
		for range 2 {
			tok := make([]byte, 32)
			_, _ = rand.Read(tok)
			key, _ := pushrelay.NewWakeKey()
			th := hex.EncodeToString(tok)
			r := send(ip, "/v1/register", `{"token":"`+th+`","environment":"production","wakeKey":"`+base64.RawURLEncoding.EncodeToString(key)+`"}`)
			h, _ := r["handle"].(string)
			if h == "" {
				t.Fatalf("register: %v", r)
			}
			devs = append(devs, dev{h, key})
			secrets = append(secrets, th, h, base64.RawURLEncoding.EncodeToString(key))
		}
		if hour == 5 {
			fake.Answer(func(relaytest.Push) (int, string) { return 410, "Unregistered" })
		} else if hour == 6 {
			fake.Answer(nil)
		}
		ts := clock.Now().Unix()
		for _, d := range devs[max(0, len(devs)-4):] {
			for _, kind := range []string{"refresh", "due"} {
				sig := pushrelay.Sign(d.key, kind, ts, d.handle)
				secrets = append(secrets, sig)
				send(ip6, "/v1/wake", `{"handle":"`+d.handle+`","kind":"`+kind+`","ts":`+fmt.Sprint(ts)+`,"sig":"`+sig+`"}`)
			}
		}
		// Bad requests: a forged handle, an extra field, garbage.
		send(ip, "/v1/wake", `{"handle":"h1.AAAA","kind":"due","ts":1,"sig":"secret-sig-`+ip+`"}`)
		send(ip, "/v1/wake", `{"handle":"`+devs[0].handle+`","kind":"due","ts":1,"sig":"x","title":"Call the bank"}`)
		send(ip, "/v1/register", `not json from `+ip)
		secrets = append(secrets, "Call the bank", "secret-sig-")
		ticks <- clock.Now()
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	got := out.String()
	for _, s := range secrets {
		if strings.Contains(got, s) {
			t.Fatalf("the output holds %q:\n%s", s, got)
		}
	}
	lines := strings.Split(strings.TrimSpace(got), "\n")
	counters := 0
	for _, l := range lines {
		switch {
		case l == "counters" || strings.HasPrefix(l, "counters "):
			counters++
		case strings.Contains(l, "push relay started"), strings.Contains(l, `msg="relay error" class=`):
		default:
			t.Errorf("unexpected line %q", l)
		}
	}
	if counters != 25 { // one an hour, one at shutdown
		t.Fatalf("%d counter lines:\n%s", counters, got)
	}
	if !strings.Contains(got, "register.ok=2") || !strings.Contains(got, "wake.due.gone=") || !strings.Contains(got, "apns.Unregistered=") || !strings.Contains(got, "wake.due.signature=") {
		t.Fatalf("counters miss events:\n%s", got)
	}
}
