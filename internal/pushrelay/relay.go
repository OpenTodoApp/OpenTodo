package pushrelay

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Options configure a Relay.
type Options struct {
	Keys *Keyring
	APNs Sender
	Now  func() time.Time
	// ClientIP is the caller's address for the per-address limits; the
	// connection's remote address when nil.
	ClientIP func(*http.Request) string
	// Log receives error classes only, never request data (discarded when nil).
	Log *slog.Logger
}

// Relay is the push relay's HTTP handler and its in-memory state.
type Relay struct {
	keys *Keyring
	apns Sender
	now  func() time.Time
	ip   func(*http.Request) string
	log  *slog.Logger
	// Separate LRUs (design D6): address counters are created for any request,
	// even garbage, so they live apart and can never evict a device's counters,
	// which are only created after a valid signature, and are never evicted:
	// while the device LRU is full, a device without counters is refused until
	// the UTC day ends (takeNoEvict).
	addrLim, devLim, instLim *limiter
	stats                    *Stats
	mux                      *http.ServeMux
}

// New builds a relay.
func New(o Options) *Relay {
	r := &Relay{keys: o.Keys, apns: o.APNs, now: o.Now, ip: o.ClientIP, log: o.Log, addrLim: newLimiter(LRUKeys), devLim: newLimiter(LRUKeys), instLim: newLimiter(1), stats: &Stats{}}
	if r.now == nil {
		r.now = time.Now
	}
	if r.ip == nil {
		r.ip = RemoteIP
	}
	if r.log == nil {
		r.log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	r.mux = http.NewServeMux()
	r.mux.HandleFunc(RouteRegister, r.handleRegister)
	r.mux.HandleFunc(RouteWake, r.handleWake)
	r.mux.HandleFunc(RouteHealth, r.handleHealth)
	return r
}

// RemoteIP is the connection's remote address without its port.
func RemoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Stats are the relay's hourly counters.
func (r *Relay) Stats() *Stats { return r.stats }

// ServeHTTP answers the three routes, 404 and 405 for anything else, and
// never logs the request.
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	defer func() {
		if v := recover(); v != nil {
			if v == http.ErrAbortHandler {
				panic(v)
			}
			r.log.Error("relay error", "class", "panic")
			writeErr(w, http.StatusInternalServerError, "internal")
		}
	}()
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if _, pattern := r.mux.Handler(req); pattern == "" {
		if req.URL.Path == "/v1/register" || req.URL.Path == "/v1/wake" || req.URL.Path == "/v1/health" {
			writeErr(w, http.StatusMethodNotAllowed, CodeMethod)
			return
		}
		writeErr(w, http.StatusNotFound, CodeNotFound)
		return
	}
	r.mux.ServeHTTP(w, req)
}

func writeErr(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (r *Relay) refuse(w http.ResponseWriter, limit string, retryAfter int64) {
	r.stats.Add("limit." + limit)
	w.Header().Set("Retry-After", strconv.FormatInt(max(retryAfter, 1), 10))
	writeErr(w, http.StatusTooManyRequests, CodeLimit)
}

// readStrict decodes exactly one JSON object of at most MaxBody bytes with no
// unknown field.
func readStrict(w http.ResponseWriter, req *http.Request, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, req.Body, MaxBody))
	if err != nil {
		return false
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if dec.Decode(v) != nil {
		return false
	}
	_, err = dec.Token()
	return errors.Is(err, io.EOF)
}

func (r *Relay) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]int{"protocol": Protocol})
}

type registerIn struct {
	Token       *string `json:"token"`
	Environment *string `json:"environment"`
	WakeKey     *string `json:"wakeKey"`
}

func (r *Relay) handleRegister(w http.ResponseWriter, req *http.Request) {
	now := r.now()
	if name, after := r.addrLim.take(now, "ra", addressKey(r.ip(req)), registerAddrWindows); name != "" {
		r.refuse(w, name, after)
		return
	}
	var in registerIn
	if !readStrict(w, req, &in) || in.Token == nil || in.Environment == nil || in.WakeKey == nil {
		r.stats.Add("register.invalid")
		writeErr(w, http.StatusBadRequest, CodeInvalid)
		return
	}
	tok, tokErr := decodeToken(*in.Token)
	env, envOK := ParseEnvironment(*in.Environment)
	key, keyErr := base64.RawURLEncoding.DecodeString(*in.WakeKey)
	if tokErr != nil || !envOK || keyErr != nil || len(key) != WakeKeySize {
		r.stats.Add("register.invalid")
		writeErr(w, http.StatusBadRequest, CodeInvalid)
		return
	}
	d := Device{Token: tok, Env: env, WakeKey: key, IssuedAt: time.Unix(now.Unix(), 0)}
	h, err := r.keys.Seal(d)
	if err != nil {
		r.log.Error("relay error", "class", "seal")
		writeErr(w, http.StatusInternalServerError, "internal")
		return
	}
	r.stats.Add("register.ok")
	writeJSON(w, http.StatusOK, map[string]any{"handle": h, "expiresAt": d.ExpiresAt().Unix()})
}

// decodeToken reads a device token: TokenHexMin to TokenHexMax hex digits.
func decodeToken(s string) ([]byte, error) {
	if len(s) < TokenHexMin || len(s) > TokenHexMax || len(s)%2 != 0 {
		return nil, errors.New("token length")
	}
	return hex.DecodeString(strings.ToLower(s))
}

type wakeIn struct {
	Handle *string `json:"handle"`
	Kind   *string `json:"kind"`
	TS     *int64  `json:"ts"`
	Sig    *string `json:"sig"`
}

func (r *Relay) handleWake(w http.ResponseWriter, req *http.Request) {
	now := r.now()
	if name, after := r.addrLim.take(now, "wa", addressKey(r.ip(req)), wakeAddrWindows); name != "" {
		r.refuse(w, name, after)
		return
	}
	var in wakeIn
	if !readStrict(w, req, &in) || in.Handle == nil || in.Kind == nil || in.TS == nil || in.Sig == nil ||
		(*in.Kind != KindRefresh && *in.Kind != KindDue) {
		r.stats.Add("wake.invalid")
		writeErr(w, http.StatusBadRequest, CodeInvalid)
		return
	}
	kind := *in.Kind
	// A forged handle, an unknown key, a wrong signature and a stale time are
	// one answer: the relay is no oracle (design D4).
	d, err := r.keys.Open(*in.Handle)
	if err != nil || !verifyWake(d, kind, *in.TS, *in.Handle, *in.Sig, now) {
		r.stats.Add("wake." + kind + ".signature")
		writeErr(w, http.StatusUnauthorized, CodeSignature)
		return
	}
	if !now.Before(d.ExpiresAt()) {
		r.stats.Add("wake." + kind + ".expired")
		writeErr(w, http.StatusGone, CodeExpired)
		return
	}
	if name, after := r.instLim.take(now, "instance", nil, instanceWindows); name != "" {
		r.refuse(w, name, after)
		return
	}
	ws := refreshWindows
	if kind == KindDue {
		ws = dueWindows
	}
	// Keyed by the token, not the handle: the caps follow the phone across
	// registrations by anyone (design D6).
	if name, after := r.devLim.takeNoEvict(now, "d"+kind, d.Token, ws); name != "" {
		r.refuse(w, name, after)
		return
	}
	switch out, reason := r.apns.Send(req.Context(), d, kind); out {
	case Delivered:
		r.stats.Add("wake." + kind + ".sent")
		w.WriteHeader(http.StatusAccepted)
	case Dead:
		r.stats.Add("wake." + kind + ".gone")
		r.stats.Add("apns." + reason)
		writeErr(w, http.StatusGone, CodeGone)
	default:
		r.stats.Add("wake." + kind + ".failed")
		r.stats.Add("apns." + reason)
		writeErr(w, http.StatusBadGateway, CodeAPNs)
	}
}

// Stats counts events by name until Flush.
type Stats struct {
	mu sync.Mutex
	m  map[string]int64
}

// Add counts one event.
func (s *Stats) Add(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.m == nil {
		s.m = map[string]int64{}
	}
	s.m[name]++
}

// Flush returns the counters as "name=n" pairs in name order and starts over.
func (s *Stats) Flush() string {
	s.mu.Lock()
	m := s.m
	s.m = nil
	s.mu.Unlock()
	names := make([]string, 0, len(m))
	for k := range m {
		names = append(names, k)
	}
	sort.Strings(names)
	var b strings.Builder
	for i, k := range names {
		if i > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(k + "=" + strconv.FormatInt(m[k], 10))
	}
	return b.String()
}

// NewWakeKey mints a wake key (a server does this at registration).
func NewWakeKey() ([]byte, error) {
	k := make([]byte, WakeKeySize)
	_, err := rand.Read(k)
	return k, err
}
