// Command opentodo-push-relay is the OpenTodo push relay (OpenSpec change
// ios-push-relay): it holds the iPhone app's Apple push key and forwards
// content-free wake-ups from OpenTodo servers to Apple. The protocol is
// internal/pushrelay/PROTOCOL.md; running it is docs/push-relay.md.
//
// Its configuration is its own environment, never the OpenTodo server's:
//
//	PUSH_RELAY_APNS_KEY_FILE    the .p8 key file from Apple (required)
//	PUSH_RELAY_APNS_KEY_ID      its Key ID (required)
//	PUSH_RELAY_APNS_TEAM_ID     the Team ID (required)
//	PUSH_RELAY_APNS_TOPIC       the app's bundle ID (default app.open-todo.ios)
//	PUSH_RELAY_SEAL_KEYS_FILE   the sealing keys, a JSON array, newest last (required)
//	PUSH_RELAY_ADDR             the listen address (default :8080)
//	PUSH_RELAY_CLIENT_IP_HEADER a header the proxy in front sets to the
//	                            caller's address, such as X-Forwarded-For
//	                            (its last entry is used); the connection's
//	                            address when unset
//	PUSH_RELAY_TRUSTED_PROXIES  addresses or CIDR ranges, comma-separated,
//	                            whose header is believed; loopback always is.
//	                            From any other peer, and when the header's
//	                            value is not an IP address, the connection's
//	                            address counts
//
// The per-address limits are only as good as the address: run the relay
// behind one proxy that sets the header (the reference deployment's Caddy on
// the same host), and do not publish its port past that proxy.
//
// It logs nothing per request: once an hour it writes one line of counters
// to standard output, and errors by class.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/pushrelay"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	if err := run(ctx, os.Getenv, os.Stdout, nil, ticker.C, nil); err != nil {
		fmt.Fprintln(os.Stderr, "opentodo-push-relay:", err)
		os.Exit(1)
	}
}

// config is the relay's environment.
type config struct {
	keyFile, keyID, teamID, topic, sealFile, addr, ipHeader string
	trusted                                                 []netip.Prefix
}

func readConfig(getenv func(string) string) (config, error) {
	c := config{
		keyFile: strings.TrimSpace(getenv("PUSH_RELAY_APNS_KEY_FILE")), keyID: strings.TrimSpace(getenv("PUSH_RELAY_APNS_KEY_ID")),
		teamID: strings.TrimSpace(getenv("PUSH_RELAY_APNS_TEAM_ID")), topic: strings.TrimSpace(getenv("PUSH_RELAY_APNS_TOPIC")),
		sealFile: strings.TrimSpace(getenv("PUSH_RELAY_SEAL_KEYS_FILE")), addr: strings.TrimSpace(getenv("PUSH_RELAY_ADDR")),
		ipHeader: strings.TrimSpace(getenv("PUSH_RELAY_CLIENT_IP_HEADER")),
	}
	if c.addr == "" {
		c.addr = ":8080"
	}
	for _, v := range strings.Split(getenv("PUSH_RELAY_TRUSTED_PROXIES"), ",") {
		if v = strings.TrimSpace(v); v == "" {
			continue
		}
		p, err := netip.ParsePrefix(v)
		if err != nil {
			a, aerr := netip.ParseAddr(v)
			if aerr != nil {
				return c, fmt.Errorf("PUSH_RELAY_TRUSTED_PROXIES: %q is not an address or a CIDR range", v)
			}
			p = netip.PrefixFrom(a.Unmap(), a.Unmap().BitLen())
		}
		c.trusted = append(c.trusted, p.Masked())
	}
	var missing []string
	for name, v := range map[string]string{"PUSH_RELAY_APNS_KEY_FILE": c.keyFile, "PUSH_RELAY_APNS_KEY_ID": c.keyID,
		"PUSH_RELAY_APNS_TEAM_ID": c.teamID, "PUSH_RELAY_SEAL_KEYS_FILE": c.sealFile} {
		if v == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return c, fmt.Errorf("set %s", strings.Join(missing, ", "))
	}
	return c, nil
}

// testHooks let the tests point the APNs client at a fake.
type testHooks struct {
	apns   map[pushrelay.Environment]string
	client *http.Client
	now    func() time.Time
	// ready receives the relay once it serves.
	ready func(*pushrelay.Relay)
}

// run serves the relay until ctx ends. ln is the listener (nil: listen on the
// configured address); every tick writes the counter line to out.
func run(ctx context.Context, getenv func(string) string, out io.Writer, ln net.Listener, ticks <-chan time.Time, th *testHooks) error {
	cfg, err := readConfig(getenv)
	if err != nil {
		return err
	}
	keyPEM, err := os.ReadFile(cfg.keyFile)
	if err != nil {
		return errors.New("read the APNs key file")
	}
	key, err := pushrelay.ParseP8(keyPEM)
	if err != nil {
		return err
	}
	seal, err := os.ReadFile(cfg.sealFile)
	if err != nil {
		return errors.New("read the sealing keys file")
	}
	ring, err := pushrelay.ParseKeyring(seal)
	if err != nil {
		return err
	}
	if th == nil {
		th = &testHooks{}
	}
	logger := slog.New(slog.NewTextHandler(out, nil))
	apns, err := pushrelay.NewAPNs(pushrelay.APNsConfig{Key: key, KeyID: cfg.keyID, TeamID: cfg.teamID, Topic: cfg.topic,
		Hosts: th.apns, Client: th.client, Now: th.now})
	if err != nil {
		return err
	}
	relay := pushrelay.New(pushrelay.Options{Keys: ring, APNs: apns, Now: th.now, ClientIP: clientIP(cfg.ipHeader, cfg.trusted), Log: logger})
	srv := &http.Server{
		Handler:           relay,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    8 << 10,
		// net/http's own messages name the remote address: keep their class only.
		ErrorLog: log.New(classOnly{logger}, "", 0),
	}
	if ln == nil {
		if ln, err = net.Listen("tcp", cfg.addr); err != nil {
			return err
		}
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	logger.Info("push relay started", "protocol", pushrelay.Protocol)
	if th.ready != nil {
		th.ready(relay)
	}
	for {
		select {
		case <-ticks:
			writeCounters(out, relay)
		case err := <-errc:
			return err
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = srv.Shutdown(shutdown)
			writeCounters(out, relay)
			return nil
		}
	}
}

// writeCounters writes the hour's counter line.
func writeCounters(out io.Writer, relay *pushrelay.Relay) {
	_, _ = fmt.Fprintln(out, "counters", relay.Stats().Flush())
}

// clientIP reads the caller's address from header (its last entry, the one
// the proxy in front added) when the connection comes from loopback or a
// trusted proxy and the value is an IP address, and from the connection
// otherwise.
func clientIP(header string, trusted []netip.Prefix) func(*http.Request) string {
	if header == "" {
		return pushrelay.RemoteIP
	}
	return func(r *http.Request) string {
		peer := pushrelay.RemoteIP(r)
		pa, err := netip.ParseAddr(peer)
		if err != nil || !trustedPeer(pa.Unmap(), trusted) {
			return peer
		}
		v := r.Header.Values(header)
		if len(v) == 0 {
			return peer
		}
		parts := strings.Split(v[len(v)-1], ",")
		a, err := netip.ParseAddr(strings.TrimSpace(parts[len(parts)-1]))
		if err != nil {
			return peer
		}
		return a.Unmap().String()
	}
}

func trustedPeer(a netip.Addr, trusted []netip.Prefix) bool {
	if a.IsLoopback() {
		return true
	}
	for _, p := range trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// classOnly turns net/http's error log into a class, dropping its text.
type classOnly struct{ log *slog.Logger }

func (c classOnly) Write(p []byte) (int, error) {
	class := "http"
	if strings.Contains(string(p), "TLS handshake") {
		class = "http tls"
	}
	c.log.Error("relay error", "class", class)
	return len(p), nil
}
