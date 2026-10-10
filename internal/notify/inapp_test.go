package notify

import (
	"context"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
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
