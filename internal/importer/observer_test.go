package importer

import (
	"context"
	"sync"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Imports and undo go through sync.Apply, so the post-commit observer (which
// feeds webhooks) sees them, and connected devices are woken after each batch.
func TestImportReachesObserverAndDevices(t *testing.T) {
	h := newHarness(t)
	var mu sync.Mutex
	created := map[string]bool{}
	deleted := 0
	h.sync.SetObserver(func(_ context.Context, changes []opsync.Change) {
		mu.Lock()
		defer mu.Unlock()
		for _, c := range changes {
			if c.Origin != Device {
				t.Errorf("origin = %q, want %q", c.Origin, Device)
			}
			if _, ok := c.Fields["title"]; ok && c.Entity == "task" {
				created[c.EntityID] = true
			}
			if _, ok := c.Fields["deleted_at"]; ok {
				deleted++
			}
		}
	})
	sub := h.sync.Notifier().Subscribe(h.uid, "laptop")
	defer h.sync.Notifier().Unsubscribe(sub)
	job := h.run("title\nOne\nTwo\n", Options{})
	select {
	case <-sub.C():
	case <-time.After(time.Second):
		t.Fatal("device was not woken by the import")
	}
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(created) != 2 || deleted != 2 {
		t.Fatalf("observer saw %d created tasks and %d tombstones", len(created), deleted)
	}
}
