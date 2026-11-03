package push

import (
	"context"
	"fmt"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestLocationRemindersAreNeverScheduled pins location-reminders D6: the server
// never pushes, dismisses or counts a location reminder, not even one whose
// fire_at a concurrent edit merged in, and it never takes a slot of the
// bounded pages from a reminder that is due.
func TestLocationRemindersAreNeverScheduled(t *testing.T) {
	e := newTestEnv(t)
	f := newFakePush(t)
	ctx := context.Background()
	s := e.service()
	if _, _, err := s.Upsert(ctx, "u1", "", f.input("phone", false)); err != nil {
		t.Fatal(err)
	}
	now := e.clock.UnixMilli()
	e.apply(t, "u1", map[string]map[string]any{
		"task:open": {"title": "Buy stamps", "completed_at": nil, "deleted_at": nil},
		"task:done": {"title": "Parcel", "completed_at": now - 5000, "deleted_at": nil},
	})
	for _, task := range []string{"open", "done"} {
		e.apply(t, "u1", map[string]map[string]any{
			"reminder:loc-" + task: {"task_id": task, "kind": "arrive", "radius_m": 150, "fire_at": nil, "offset_minutes": nil},
		})
	}
	// A merged mix: a location reminder carrying a firing time in the past,
	// written straight into the store like two devices' LWW could leave it.
	const mixed = 600 // more than a page of the scan
	for i := 0; i < mixed; i++ {
		id := fmt.Sprintf("mix-%04d", i)
		for field, v := range map[string]string{"task_id": `"open"`, "kind": `"leave"`, "radius_m": `150`, "fire_at": fmt.Sprint(now - int64(60_000-i))} {
			if _, err := e.db.Exec(`INSERT INTO scope_fields(scope_id, entity, entity_id, field, value, ts, device) VALUES(?, 'reminder', ?, ?, ?, 1, 'x')`,
				opsync.PersonalScope("u1"), id, field, v); err != nil {
				t.Fatal(err)
			}
		}
	}
	e.reminder(t, "u1", "r-open", "open", now-1000)
	n, err := s.Tick(ctx)
	if err != nil || n != 1 {
		t.Fatalf("tick recorded %d, %v", n, err)
	}
	if got := f.received(); len(got) != 1 || got[0].ReminderID != "r-open" {
		t.Fatalf("pushed = %+v", got)
	}
	cands, err := s.candidates(ctx, now, -1)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 0 {
		t.Fatalf("location reminders scanned: %d", len(cands))
	}
	if _, ok, err := s.NextDue(ctx); err != nil || ok {
		t.Fatalf("NextDue counts location reminders: %v %v", ok, err)
	}
	for _, id := range []string{"loc-open", "loc-done", "mix-0000"} {
		r, _ := e.sync.Get(ctx, "u1", "reminder", id)
		if r == nil || !opsync.IsNull(r["dismissed_at"]) || !opsync.IsNull(r["delivered_at"]) {
			t.Fatalf("%s = dismissed %s delivered %s, want untouched", id, r["dismissed_at"], r["delivered_at"])
		}
	}
}
