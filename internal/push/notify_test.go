package push

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// assignee-notifications 2.2: assignment and status pushes reach only the
// devices that opted in, carry a title only with titles opted in, and never an
// encrypted one.

func (f *fakePushService) taskPayloads(t *testing.T, want int) []TaskPayload {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		f.mu.Lock()
		n := len(f.raws)
		raws := append([]string(nil), f.raws...)
		f.mu.Unlock()
		if n >= want || time.Now().After(deadline) {
			out := make([]TaskPayload, 0, n)
			for _, r := range raws {
				var p TaskPayload
				if err := json.Unmarshal([]byte(r), &p); err != nil {
					t.Fatalf("payload %q: %v", r, err)
				}
				out = append(out, p)
			}
			return out
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// settle waits until no background send is running.
func settle(s *Service) {
	for i := 0; i < 500 && len(s.senders) > 0; i++ {
		time.Sleep(10 * time.Millisecond)
	}
}

func TestNotifyOnlyOptedInDevices(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	assigned, status, off := newFakePush(t), newFakePush(t), newFakePush(t)
	in := assigned.input("laptop", true)
	in.Notify = Notify{Assigned: true}
	if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
		t.Fatal(err)
	}
	in = status.input("phone", false)
	in.Notify = Notify{Status: true}
	if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Upsert(ctx, "u1", "", off.input("tablet", true)); err != nil {
		t.Fatal(err)
	}

	s.Assigned(ctx, notify.Assigned{AssigneeID: "u1", ActorName: "Ben", TaskID: "t1", TaskTitle: "Book the venue"})
	s.StatusChanged(ctx, notify.StatusChanged{AssigneeID: "u1", ActorName: "Ben", TaskID: "t1", TaskTitle: "Book the venue", Completed: true})
	a, b := assigned.taskPayloads(t, 1), status.taskPayloads(t, 1)
	settle(s)
	if len(a) != 1 || a[0].Type != "assigned" || a[0].TaskID != "t1" || a[0].ActorName != "Ben" || a[0].Title != "Book the venue" || a[0].Completed != nil {
		t.Fatalf("assigned device = %+v", a)
	}
	if len(b) != 1 || b[0].Type != "status" || b[0].Completed == nil || !*b[0].Completed || b[0].Title != "" {
		t.Fatalf("status device (titles off) = %+v", b)
	}
	if got := off.taskPayloads(t, 0); len(got) != 0 {
		t.Fatalf("device without choices got %+v", got)
	}
	// Another user's event reaches none of u1's devices.
	s.Assigned(ctx, notify.Assigned{AssigneeID: "u2", ActorName: "Ben", TaskID: "t2"})
	settle(s)
	if n := len(assigned.taskPayloads(t, 1)); n != 1 {
		t.Fatalf("u2's event reached u1: %d", n)
	}
}

func TestNotifyNeverCarriesAnEncryptedTitle(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	f := newFakePush(t)
	in := f.input("laptop", true)
	in.Notify = Notify{Assigned: true}
	if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
		t.Fatal(err)
	}
	s.Assigned(ctx, notify.Assigned{AssigneeID: "u1", ActorName: "Ben", TaskID: "t1", TaskTitle: e2ee.Placeholder})
	got := f.taskPayloads(t, 1)
	settle(s)
	if len(got) != 1 || got[0].Title != "" {
		t.Fatalf("payload = %+v", got)
	}
}

func TestNotifyQuietWhileAway(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	f := newFakePush(t)
	in := f.input("laptop", true)
	in.Notify = Notify{Assigned: true}
	if _, _, err := s.Upsert(ctx, "u1", "", in); err != nil {
		t.Fatal(err)
	}
	day := e.clock.UTC().Format("2006-01-02")
	e.apply(t, "u1", map[string]map[string]any{"user_prefs:me": {"away": day + ".." + day + " quiet"}})
	s.Assigned(ctx, notify.Assigned{AssigneeID: "u1", ActorName: "Ben", TaskID: "t1"})
	settle(s)
	if got := f.taskPayloads(t, 0); len(got) != 0 {
		t.Fatalf("pushed while away: %+v", got)
	}
}
