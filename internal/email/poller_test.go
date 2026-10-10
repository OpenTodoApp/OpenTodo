package email

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"
)

// memSource is an in-memory Source: messages live in a map until Done.
type memSource struct {
	mu       sync.Mutex
	msgs     map[uint32][]byte
	sizes    map[uint32]int64 // overrides len(raw) when set
	done     []uint32
	openErr  error
	fetchErr map[uint32]error
	opens    int
}

func newMemSource() *memSource {
	return &memSource{msgs: map[uint32][]byte{}, sizes: map[uint32]int64{}, fetchErr: map[uint32]error{}}
}

func (s *memSource) Open(ctx context.Context) (Mailbox, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.opens++
	if s.openErr != nil {
		return nil, s.openErr
	}
	return memMailbox{s}, nil
}

type memMailbox struct{ s *memSource }

func (m memMailbox) Unseen(ctx context.Context) ([]Message, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	var out []Message
	for uid := uint32(1); uid < 1000; uid++ {
		raw, ok := m.s.msgs[uid]
		if !ok {
			continue
		}
		size := int64(len(raw))
		if v, ok := m.s.sizes[uid]; ok {
			size = v
		}
		out = append(out, Message{UID: uid, Size: size})
	}
	return out, nil
}

func (m memMailbox) Fetch(ctx context.Context, uid uint32) ([]byte, error) {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	if err := m.s.fetchErr[uid]; err != nil {
		return nil, err
	}
	return m.s.msgs[uid], nil
}

func (m memMailbox) Done(ctx context.Context, uids []uint32) error {
	m.s.mu.Lock()
	defer m.s.mu.Unlock()
	for _, u := range uids {
		delete(m.s.msgs, u)
		m.s.done = append(m.s.done, u)
	}
	return nil
}

func (m memMailbox) Close() error { return nil }

func TestPollerAgainstFakeSource(t *testing.T) {
	h := newHarness(t)
	alice := h.inbox("alice")
	src := newMemSource()
	src.msgs[1] = message(alice.Secret, "<p1@x>", "a@example.org", "Pay rent", "Before the 1st.")
	src.msgs[2] = message(alice.Secret, "<p1@x>", "a@example.org", "Pay rent", "Delivered twice.")
	src.msgs[3] = message("unknownunknownunknownunkno", "<p3@x>", "a@example.org", "Spam", "x")
	src.msgs[4] = []byte("Subject: big\r\n\r\nx")
	src.sizes[4] = MaxMessageBytes + 1
	p := NewPoller(src, h.proc, h.store, time.Minute, quietLog)
	counts, err := p.Poll(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if counts[Created] != 1 || counts[Duplicate] != 1 || counts[UnknownInbox] != 1 || counts[TooLarge] != 1 {
		t.Fatalf("counts = %v", counts)
	}
	if len(src.msgs) != 0 || len(src.done) != 4 {
		t.Fatalf("left %d, done %v", len(src.msgs), src.done)
	}
	if n := len(h.tasks("alice")); n != 1 {
		t.Fatalf("tasks = %d", n)
	}
}

func TestPollerSurvivesSourceErrors(t *testing.T) {
	h := newHarness(t)
	alice := h.inbox("alice")
	src := newMemSource()
	src.openErr = errors.New("dial tcp: connection refused")
	var logBuf bytes.Buffer
	log := slog.New(slog.NewTextHandler(&logBuf, nil))
	p := NewPoller(src, h.proc, h.store, 20*time.Millisecond, log)

	ctx, cancel := context.WithCancel(h.ctx)
	done := make(chan struct{})
	go func() { p.Run(ctx); close(done) }()
	waitFor(t, func() bool { src.mu.Lock(); defer src.mu.Unlock(); return src.opens >= 3 })

	// The mail server comes back with a message: polling resumes by itself.
	src.mu.Lock()
	src.openErr = nil
	src.msgs[1] = message(alice.Secret, "<back@x>", "a@example.org", "Back online", "x")
	src.mu.Unlock()
	waitFor(t, func() bool { src.mu.Lock(); defer src.mu.Unlock(); return len(src.done) == 1 })
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("poller did not stop")
	}
	if n := len(h.tasks("alice")); n != 1 {
		t.Fatalf("tasks = %d", n)
	}
	logs := logBuf.String()
	if !strings.Contains(logs, "email poll failed") || strings.Contains(logs, "Back online") {
		t.Fatalf("logs:\n%s", logs)
	}

	// A fetch error leaves the message for the next poll.
	src.msgs[2] = message(alice.Secret, "<retry@x>", "a@example.org", "Retry", "x")
	src.fetchErr[2] = errors.New("connection reset")
	if _, err := p.Poll(h.ctx); err == nil {
		t.Fatal("fetch error not reported")
	}
	if _, ok := src.msgs[2]; !ok {
		t.Fatal("message dropped after a fetch error")
	}
	delete(src.fetchErr, 2)
	if counts, err := p.Poll(h.ctx); err != nil || counts[Created] != 1 {
		t.Fatalf("retry = %v, %v", counts, err)
	}
}

func TestPollerWithIMAP(t *testing.T) {
	h := newHarness(t)
	alice := h.inbox("alice")
	f := newFakeIMAP(t, "MOVE")
	f.add(1, fixtureTo(t, "multipart_pdf.eml", alice.Secret))
	f.add(2, fixtureTo(t, "html_only.eml", alice.Secret))
	p := NewPoller(f.source(), h.proc, h.store, time.Minute, quietLog)
	counts, err := p.Poll(h.ctx)
	if err != nil || counts[Created] != 2 {
		t.Fatalf("counts = %v, %v", counts, err)
	}
	if n := len(h.tasks("alice")); n != 2 {
		t.Fatalf("tasks = %d", n)
	}
	for uid, m := range f.snapshot() {
		if m.folder != "OpenTodo.Processed" || !m.seen {
			t.Fatalf("message %d not processed: %+v", uid, m)
		}
	}
}

// fixtureTo loads a fixture and points its SECRET placeholder at secret.
func fixtureTo(t *testing.T, name, secret string) []byte {
	raw := fixture(t, name)
	raw = bytes.ReplaceAll(raw, []byte("todo+SECRET@"), []byte("todo+"+secret+"@"))
	return bytes.ReplaceAll(raw, []byte("todo+secret@"), []byte("todo+"+secret+"@"))
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
