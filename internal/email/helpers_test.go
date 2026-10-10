package email

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

var quietLog = slog.New(slog.NewTextHandler(io.Discard, nil))

type harness struct {
	t     *testing.T
	ctx   context.Context
	db    *sql.DB
	sync  *opsync.Service
	store *Store
	proc  *Processor
	clock time.Time
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h := &harness{t: t, ctx: context.Background(), db: db, sync: opsync.NewService(db), clock: time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)}
	h.store = NewStore(db, audit.New(db, quietLog))
	h.store.now = func() time.Time { return h.clock }
	h.proc = NewProcessor(h.store, h.sync, "todo", "example.com", quietLog)
	h.proc.now = func() time.Time { return h.clock }
	for _, u := range []string{"alice", "bob"} {
		if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,1)`,
			u, u+"@example.org", u, "x", map[string]string{"alice": "owner", "bob": "member"}[u]); err != nil {
			t.Fatal(err)
		}
	}
	return h
}

// inbox returns the user's inbox, creating it.
func (h *harness) inbox(user string) Inbox {
	h.t.Helper()
	in, err := h.store.Get(h.ctx, user)
	if err != nil {
		h.t.Fatal(err)
	}
	return in
}

// message builds a simple RFC 5322 message to the given secret.
func message(secret, messageID, from, subject, body string) []byte {
	return []byte(strings.Join([]string{
		"Message-ID: " + messageID,
		"From: " + from,
		"To: Todo <todo+" + secret + "@example.com>",
		"Subject: " + subject,
		"Date: Fri, 9 Oct 2026 12:00:00 +0000",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body,
		"",
	}, "\r\n"))
}

// tasks lists the user's live tasks.
func (h *harness) tasks(user string) []opsync.Entity {
	h.t.Helper()
	list, err := h.sync.List(h.ctx, user, "task", false)
	if err != nil {
		h.t.Fatal(err)
	}
	return list
}

func (h *harness) count(q string, args ...any) int {
	h.t.Helper()
	var n int
	if err := h.db.QueryRow(q, args...).Scan(&n); err != nil {
		h.t.Fatal(err)
	}
	return n
}
