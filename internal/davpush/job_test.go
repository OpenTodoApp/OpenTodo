package davpush

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/push"
)

// slowSender answers after a delay, or never until the request's context ends.
type slowSender struct {
	delay time.Duration
	sent  atomic.Int64
	mu    sync.Mutex
	to    []string
}

func (s *slowSender) SendMessage(ctx context.Context, endpoint string, _ push.Message) (int, error) {
	s.sent.Add(1)
	s.mu.Lock()
	s.to = append(s.to, endpoint)
	s.mu.Unlock()
	select {
	case <-time.After(s.delay):
		return 201, nil
	case <-ctx.Done():
		return 0, ctx.Err()
	}
}

// budgetJob: users u1..uN, each with subs subscriptions and a change pending.
func budgetJob(t *testing.T, users, subs int, send Sender) *Job {
	t.Helper()
	s, _ := testStore(t)
	ctx := context.Background()
	for u := 1; u <= users; u++ {
		uid := fmt.Sprintf("u%d", u)
		if u > 1 {
			if _, err := s.db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,'x','member',1)`, uid, uid+"@example.com"); err != nil {
				t.Fatal(err)
			}
			if _, err := s.db.Exec(`INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES(?,?,'Phone',?,1)`, "ap"+uid, uid, "h"+uid); err != nil {
				t.Fatal(err)
			}
		}
		ap := "ap1"
		if u > 1 {
			ap = "ap" + uid
		}
		for i := range subs {
			if _, _, err := s.Register(ctx, uid, ap, "inbox", reg(fmt.Sprintf("https://up.example.net/%s/%d", uid, i)), s.Expiry(time.Time{}), 1); err != nil {
				t.Fatal(err)
			}
		}
	}
	return &Job{
		Store:   s,
		Enabled: func(context.Context) bool { return true },
		Cursor:  func(context.Context, string) (int64, error) { return 2, nil },
		Changes: func(context.Context, string, string, int64) (Changes, error) {
			return Changes{Cursor: 2, SyncToken: "t2", Calendars: map[string]bool{"inbox": true}}, nil
		},
		Send: send,
	}
}

// TestUserBudgetBoundsOneAccount (security read of caldav-push): an account
// whose push resources answer slowly stops after its budget; the rest of its
// subscriptions wait for the next run.
func TestUserBudgetBoundsOneAccount(t *testing.T) {
	send := &slowSender{delay: 100 * time.Millisecond}
	j := budgetJob(t, 1, 5, send)
	j.UserBudget = 50 * time.Millisecond
	j.RunOnce(context.Background())
	if n := send.sent.Load(); n != 1 {
		t.Fatalf("sends in one run = %d, want 1", n)
	}
}

// TestRunBudgetBoundsTheRun: push resources that never answer cannot hold the
// run past its limit, and accounts are served by several workers at once.
func TestRunBudgetBoundsTheRun(t *testing.T) {
	send := &slowSender{delay: time.Hour}
	j := budgetJob(t, 20, 3, send)
	j.RunLimit = 200 * time.Millisecond
	start := time.Now()
	j.RunOnce(context.Background())
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("run took %v", took)
	}
	// Each worker was stuck in its first send: as many accounts as workers were tried.
	if n := send.sent.Load(); n != int64(push.SendWorkers) {
		t.Fatalf("sends = %d, want %d (one per worker)", n, push.SendWorkers)
	}
}
