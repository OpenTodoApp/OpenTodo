package notify

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

func TestInAppSweepKeepsUnreadAndRecent(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES('u','u@example.com','h',1)`); err != nil {
		t.Fatal(err)
	}
	n := NewInApp(db, nil)
	now := time.Now()
	old := now.Add(-Retention - time.Hour).UnixMilli()
	if _, err := db.Exec(`INSERT INTO notifications(id,user_id,kind,payload,created_at,read_at) VALUES
		('old-read','u','assigned','{}',?,?), ('old-unread','u','assigned','{}',?,NULL), ('new-read','u','assigned','{}',?,?)`,
		old, old, old, now.UnixMilli(), now.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	removed, err := n.Sweep(ctx)
	if err != nil || removed != 1 {
		t.Fatalf("sweep = %d, %v", removed, err)
	}
	list, unread, err := n.List(ctx, "u")
	if err != nil || len(list) != 2 || unread != 1 {
		t.Fatalf("after sweep = %+v unread %d, %v", list, unread, err)
	}
	// Emitting through Multi with nil and Nop members is safe.
	Multi{nil, Nop{}, n}.Assigned(ctx, Assigned{AssigneeID: "u", ActorID: "x", TaskID: "t"})
	if _, unread, _ := n.List(ctx, "u"); unread != 2 {
		t.Fatalf("unread = %d", unread)
	}
	if err := n.MarkRead(ctx, "someone-else", "old-unread"); err != ErrNotFound {
		t.Fatalf("foreign mark = %v", err)
	}
}

// task-dependencies (task 6.1): the unblocked event is stored for the assignee.
func TestInAppStoresUnblocked(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES('bob','b@example.com','h',1)`); err != nil {
		t.Fatal(err)
	}
	n := NewInApp(db, nil)
	Multi{nil, Nop{}, n}.Unblocked(ctx, Unblocked{AssigneeID: "bob", ActorID: "alice", ActorName: "Alice", TaskID: "t", TaskTitle: "Book flights", BlockerID: "b", BlockerTitle: "Confirm dates"})
	list, unread, err := n.List(ctx, "bob")
	if err != nil || len(list) != 1 || unread != 1 || list[0].Kind != KindUnblocked {
		t.Fatalf("list = %+v unread %d, %v", list, unread, err)
	}
	if !strings.Contains(string(list[0].Payload), `"blockerTitle":"Confirm dates"`) {
		t.Fatalf("payload = %s", list[0].Payload)
	}
}

// reliable-background-jobs, one-job-model: the 90-day retention is applied
// when the oldest read notification passes it (NextSweep is the housekeeping
// job's deadline), not only when the server starts; every kind is stored by
// one helper.
func TestInAppSweepAtTheRetentionDeadline(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,created_at) VALUES('u','u@example.com','h',1)`); err != nil {
		t.Fatal(err)
	}
	n := NewInApp(db, nil)
	ctx, cancel := context.WithCancel(context.Background())
	n.Mentioned(ctx, Mentioned{RecipientID: "u", ActorID: "x", TaskID: "t"})
	if list, _, _ := n.List(ctx, "u"); len(list) != 1 || list[0].Kind != KindMentioned {
		t.Fatalf("mentioned not stored: %+v", list)
	}
	old := time.Now().Add(-Retention - time.Hour).UnixMilli()
	if _, err := db.Exec(`INSERT INTO notifications(id,user_id,kind,payload,created_at,read_at) VALUES('old-read','u','assigned','{}',?,?)`, old, old); err != nil {
		t.Fatal(err)
	}
	at, ok, err := n.NextSweep(ctx)
	if err != nil || !ok || !at.Equal(time.UnixMilli(old).Add(Retention)) {
		t.Fatalf("next sweep %v %v %v, want 90 days after the read notification", at, ok, err)
	}
	if c, err := n.Sweep(ctx); err != nil || c != 1 {
		t.Fatalf("swept %d, %v", c, err)
	}
	// Only the unread one is left: nothing to sweep, ever.
	if _, ok, err := n.NextSweep(ctx); ok || err != nil {
		t.Fatalf("unread notifications have a deadline: %v %v", ok, err)
	}
	cancel()
	if list, _, _ := n.List(context.Background(), "u"); len(list) != 1 {
		t.Fatalf("unread notification removed: %+v", list)
	}
}
