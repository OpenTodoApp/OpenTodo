package relay

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

// Limits of the relay (design D4-D6). Tests may lower the deadlines.
const (
	MaxQueued            = 4       // relayed calls in flight per account
	MaxPerMinute         = 60      // relayed calls per account per minute
	MaxValues            = 2000    // values per request
	MaxBytes             = 2 << 20 // bytes of values per request
	MaxStreamsPerAccount = 10
)

// Deadlines of one relayed request: a read waits at most ReadDeadline, a write
// (which the device may ask its user to confirm) at most WriteDeadline.
var (
	ReadDeadline  = 20 * time.Second
	WriteDeadline = 30 * time.Second
)

// Op is what a request asks the device to do.
type Op string

const (
	Decrypt Op = "decrypt"
	Encrypt Op = "encrypt"
)

// Item is one value to decrypt (Value is ciphertext) or encrypt (Value is
// plaintext), bound to its entity, id and field like every content value.
type Item struct {
	Entity string `json:"entity"`
	ID     string `json:"id"`
	Field  string `json:"field"`
	Value  string `json:"value"`
}

// Result is the device's answer for one item: the value, or an error code.
type Result struct {
	Value string `json:"value,omitempty"`
	Error string `json:"error,omitempty"`
}

// Call describes the tool call a request belongs to, for the device's
// confirmation sheet and its list of recent calls. Never a value.
type Call struct {
	Tool  string `json:"tool"`
	Token string `json:"token,omitempty"`
	Write bool   `json:"write"`
}

// Error is a relayed call that could not be answered (mcp-server "Relay
// errors"). Code is the tool error code.
type Error struct {
	Code       string
	RetryAfter int // seconds, for rate_limited
}

func (e *Error) Error() string { return "relay: " + e.Code }

// Error codes.
const (
	CodeUnavailable = "device_unavailable"
	CodeTimeout     = "device_timeout"
	CodeBusy        = "device_busy"
	CodeLimit       = "device_limit"
	CodeDeclined    = "declined_on_device"
	CodeRateLimited = "rate_limited"
	CodeTooLarge    = "relay_too_large"
)

// ErrNotFound is an answer for no pending request of this session.
var ErrNotFound = errors.New("relay: no such request")

// Event is one server-sent event on a relay stream.
type Event struct {
	Name string
	Data string
}

// Stream is one device's open relay stream.
type Stream struct {
	ID          string
	UserID      string
	DeviceID    string
	SessionHash string
	key         *streamKey
	events      chan Event
	done        chan struct{}
	once        sync.Once
	lastSeen    time.Time
}

// Events delivers the stream's events; Done is closed when the stream ends.
func (s *Stream) Events() <-chan Event  { return s.events }
func (s *Stream) Done() <-chan struct{} { return s.done }

// ServerKey is the server's public key for this stream, base64url.
func (s *Stream) ServerKey() string { return b64.EncodeToString(s.key.pub) }

func (s *Stream) close() { s.once.Do(func() { close(s.done) }) }

type pending struct {
	id     string
	stream *Stream
	n      int
	answer chan answer
}

type answer struct {
	results []Result
	code    string
}

// Hub routes relay requests to devices. It holds nothing but streams, request
// ids and counters: values exist only inside one Do call.
type Hub struct {
	mu      sync.Mutex
	now     func() time.Time
	streams map[string][]*Stream // by account
	pending map[string]*pending  // by request id
	queued  map[string]int       // by account
	calls   map[string][]time.Time
}

// NewHub returns an empty hub.
func NewHub() *Hub {
	return &Hub{now: time.Now, streams: map[string][]*Stream{}, pending: map[string]*pending{}, queued: map[string]int{}, calls: map[string][]time.Time{}}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Open registers a device's stream; a stream already open for the same device
// is replaced and the account's oldest is closed beyond MaxStreamsPerAccount.
func (h *Hub) Open(userID, deviceID, sessionHash string, devicePub []byte) (*Stream, error) {
	id := newID()
	key, err := newStreamKey(devicePub, id)
	if err != nil {
		return nil, err
	}
	s := &Stream{ID: id, UserID: userID, DeviceID: deviceID, SessionHash: sessionHash, key: key,
		events: make(chan Event, MaxQueued+2), done: make(chan struct{}), lastSeen: h.now()}
	h.mu.Lock()
	defer h.mu.Unlock()
	kept := h.streams[userID][:0]
	for _, o := range h.streams[userID] {
		if o.DeviceID == deviceID {
			o.close()
			continue
		}
		kept = append(kept, o)
	}
	kept = append(kept, s)
	for len(kept) > MaxStreamsPerAccount {
		kept[0].close()
		kept = kept[1:]
	}
	h.streams[userID] = kept
	return s, nil
}

// Close removes a stream; its pending requests fail as unavailable.
func (h *Hub) Close(s *Stream) {
	s.close()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.drop(s)
}

func (h *Hub) drop(s *Stream) {
	list := h.streams[s.UserID]
	for i, o := range list {
		if o == s {
			h.streams[s.UserID] = append(list[:i:i], list[i+1:]...)
			break
		}
	}
	if len(h.streams[s.UserID]) == 0 {
		delete(h.streams, s.UserID)
	}
}

// CloseDevice ends every stream of a device that opted out.
func (h *Hub) CloseDevice(userID, deviceID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range append([]*Stream(nil), h.streams[userID]...) {
		if s.DeviceID == deviceID {
			s.close()
			h.drop(s)
		}
	}
}

// CloseAccount ends every stream of the account.
func (h *Hub) CloseAccount(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, s := range h.streams[userID] {
		s.close()
	}
	delete(h.streams, userID)
}

// Seen marks a stream as alive (heartbeat), which makes it preferred.
func (h *Hub) Seen(s *Stream) {
	h.mu.Lock()
	s.lastSeen = h.now()
	h.mu.Unlock()
}

// Online reports whether the account has an open relay stream.
func (h *Hub) Online(userID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.streams[userID]) > 0
}

// pick returns the account's most recently active stream (design D4).
func (h *Hub) pick(userID string) *Stream {
	var best *Stream
	for _, s := range h.streams[userID] {
		if best == nil || s.lastSeen.After(best.lastSeen) {
			best = s
		}
	}
	return best
}

// admit applies the per-account minute limit and the queue cap.
func (h *Hub) admit(userID string) error {
	now := h.now()
	recent := h.calls[userID][:0]
	for _, t := range h.calls[userID] {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= MaxPerMinute {
		h.calls[userID] = recent
		retry := int(time.Minute.Seconds()-now.Sub(recent[0]).Seconds()) + 1
		return &Error{Code: CodeRateLimited, RetryAfter: retry}
	}
	if h.queued[userID] >= MaxQueued {
		h.calls[userID] = recent
		return &Error{Code: CodeBusy}
	}
	h.calls[userID] = append(recent, now)
	h.queued[userID]++
	return nil
}

// request is the sealed payload of one request.
type request struct {
	Op       Op     `json:"op"`
	Items    []Item `json:"items"`
	Call     Call   `json:"call"`
	Deadline int64  `json:"deadline"`
}

// Do asks one of the account's devices to decrypt or encrypt items and waits
// for its answer. It never retries on another device (design D4).
func (h *Hub) Do(ctx context.Context, userID string, op Op, items []Item, call Call) ([]Result, error) {
	if len(items) == 0 {
		return nil, nil
	}
	size := 0
	for _, it := range items {
		size += len(it.Value)
	}
	if len(items) > MaxValues || size > MaxBytes {
		return nil, &Error{Code: CodeTooLarge}
	}
	wait := ReadDeadline
	if op == Encrypt {
		wait = WriteDeadline
	}
	h.mu.Lock()
	s := h.pick(userID)
	if s == nil {
		h.mu.Unlock()
		return nil, &Error{Code: CodeUnavailable}
	}
	if err := h.admit(userID); err != nil {
		h.mu.Unlock()
		return nil, err
	}
	p := &pending{id: newID(), stream: s, n: len(items), answer: make(chan answer, 1)}
	h.pending[p.id] = p
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.pending, p.id)
		if h.queued[userID]--; h.queued[userID] <= 0 {
			delete(h.queued, userID)
		}
		h.mu.Unlock()
	}()

	deadline := h.now().Add(wait)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	raw, err := json.Marshal(request{Op: op, Items: items, Call: call, Deadline: deadline.UnixMilli()})
	if err != nil {
		return nil, err
	}
	box, err := s.key.seal(raw, p.id)
	if err != nil {
		return nil, err
	}
	data, _ := json.Marshal(map[string]string{"id": p.id, "box": box})
	select {
	case s.events <- Event{Name: "request", Data: string(data)}:
	default:
		return nil, &Error{Code: CodeBusy}
	}
	timer := time.NewTimer(time.Until(deadline))
	defer timer.Stop()
	select {
	case a := <-p.answer:
		switch a.code {
		case "":
			return a.results, nil
		case CodeLimit, CodeDeclined:
			return nil, &Error{Code: a.code}
		default:
			return nil, &Error{Code: CodeUnavailable}
		}
	case <-s.done:
		return nil, &Error{Code: CodeUnavailable}
	case <-timer.C:
		return nil, &Error{Code: CodeTimeout}
	case <-ctx.Done():
		return nil, &Error{Code: CodeTimeout}
	}
}

// answerBody is the sealed payload of an answer.
type answerBody struct {
	Results []Result `json:"results"`
	Error   string   `json:"error,omitempty"`
}

// Answer delivers a device's sealed answer to a pending request. Only the
// stream the request went to can answer, once: anything else is ErrNotFound.
func (h *Hub) Answer(userID, sessionHash, id, box string) error {
	h.mu.Lock()
	p := h.pending[id]
	if p == nil || p.stream.UserID != userID || p.stream.SessionHash != sessionHash {
		h.mu.Unlock()
		return ErrNotFound
	}
	h.mu.Unlock()
	raw, err := p.stream.key.open(box, id)
	if err != nil {
		return ErrNotFound
	}
	var a answerBody
	if json.Unmarshal(raw, &a) != nil || (a.Error == "" && len(a.Results) != p.n) {
		return ErrNotFound
	}
	h.mu.Lock()
	if h.pending[id] != p {
		h.mu.Unlock()
		return ErrNotFound
	}
	delete(h.pending, id)
	h.mu.Unlock()
	h.Seen(p.stream)
	p.answer <- answer{results: a.Results, code: a.Error}
	return nil
}
