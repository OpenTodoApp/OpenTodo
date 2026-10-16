package host

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/push"
	"github.com/pixari/opentodo/internal/tenant"
)

// TestSchedulerIgnoresIdleTenants (4.1): with 10,000 registered tenants and
// no work due within the hour, an hour of scheduler passes opens none.
func TestSchedulerIgnoresIdleTenants(t *testing.T) {
	if testing.Short() {
		t.Skip("registers 10,000 tenants")
	}
	f := newFixture(t, nil)
	ctx := context.Background()
	now := f.clock.Now()
	tx, err := f.h.reg.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10000; i++ {
		name := fmt.Sprintf("t%05d", i)
		if _, err := tx.Exec(`INSERT INTO tenants(name,state,created_at,updated_at) VALUES(?,?,?,?)`, name, StateActive, now.UnixMilli(), now.UnixMilli()); err != nil {
			t.Fatal(err)
		}
		// Some have work, all of it later than the hour under test.
		if i%3 == 0 {
			if _, err := tx.Exec(`INSERT INTO due(tenant,kind,at) VALUES(?,?,?)`, name, KindReminders, now.Add(61*time.Minute+time.Duration(i)*time.Second).UnixMilli()); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	for elapsed := time.Duration(0); elapsed < time.Hour; elapsed += schedulerMax {
		f.h.tick(ctx)
		f.clock.Advance(schedulerMax)
	}
	if open, opens := f.h.pool.stats(); open != 0 || opens != 0 {
		t.Fatalf("opened %d tenants (%d open)", opens, open)
	}
	// Past the hour the first one is due and is the only one opened.
	f.clock.Advance(time.Minute + time.Millisecond)
	f.h.tick(ctx)
	if _, opens := f.h.pool.stats(); opens != 1 || !f.h.pool.isOpen("t00000") {
		t.Fatalf("opens after the hour: %d", opens)
	}
}

// TestReminderInClosedTenant (4.1): a reminder due in a closed tenant is
// pushed by the shared scheduler, recorded through the op log, and the
// tenant may close again.
func TestReminderInClosedTenant(t *testing.T) {
	var pushes atomic.Int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pushes.Add(1)
		w.WriteHeader(http.StatusCreated)
	}))
	defer fake.Close()
	f := newFixture(t, func(_ *config.Config, o *Options) {
		o.Tenant = func(_ string, to *tenant.Options) {
			to.Web = http.NotFoundHandler()
			to.PushOptions = func(po *push.Options) { po.AllowHTTP, po.Client = true, http.DefaultClient }
		}
	})
	ctx := context.Background()
	c := f.client("alice")
	uid := c.register("alice@example.com", f.create("alice", config.Limits{}))

	// A device subscribes, and a reminder fires two minutes from now.
	tn, release, err := f.h.pool.acquire(ctx, "alice")
	if err != nil {
		t.Fatal(err)
	}
	ua, _ := ecdh.P256().GenerateKey(rand.Reader)
	var in push.SubscriptionInput
	in.DeviceID, in.Endpoint = "phone", fake.URL+"/push/phone"
	in.Keys.P256DH = base64.RawURLEncoding.EncodeToString(ua.PublicKey().Bytes())
	in.Keys.Auth = base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef"))
	if _, _, err := tn.Push.Upsert(ctx, uid, "", in); err != nil {
		t.Fatal(err)
	}
	release()
	fire := time.Now().Add(2 * time.Minute).UnixMilli()
	now := time.Now().UnixMilli()
	ops := append(taskOps("task-1", "Call the plumber"),
		map[string]any{"id": "r1", "entity": "reminder", "entityId": "rem-1", "field": "task_id", "value": "task-1", "ts": now, "device": "dev"},
		map[string]any{"id": "r2", "entity": "reminder", "entityId": "rem-1", "field": "fire_at", "value": fire, "ts": now, "device": "dev"},
		map[string]any{"id": "r3", "entity": "reminder", "entityId": "rem-1", "field": "created_at", "value": now, "ts": now, "device": "dev"})
	c.sync("dev", ops)

	// Idle: the tenant closes and leaves its next due time in the index.
	f.clock.Advance(11 * time.Minute)
	if n := f.h.pool.sweep(); n != 1 {
		t.Fatalf("swept %d", n)
	}
	due, order, err := f.h.reg.DueBefore(ctx, time.UnixMilli(fire), 10)
	if err != nil || len(order) != 1 || due["alice"][0] != KindReminders {
		t.Fatalf("index: %v %v %v", due, order, err)
	}
	// Before the reminder is due nothing opens it.
	f.clock.Set(time.UnixMilli(fire).Add(-time.Minute))
	f.h.tick(ctx)
	if f.h.pool.isOpen("alice") || pushes.Load() != 0 {
		t.Fatal("opened before the reminder was due")
	}
	// At its time (the push service compares with the real clock, so the
	// reminder is made due for it too) the scheduler opens the tenant and pushes.
	tn2, release2, err := f.h.pool.acquire(ctx, "alice")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tn2.DB.Exec(`UPDATE scope_fields SET value = ? WHERE entity = 'reminder' AND field = 'fire_at'`, fmt.Sprint(time.Now().Add(-time.Second).UnixMilli())); err != nil {
		t.Fatal(err)
	}
	release2()
	f.h.pool.evict("alice")
	f.clock.Set(time.UnixMilli(fire).Add(time.Second))
	f.h.tick(ctx)
	if pushes.Load() != 1 {
		t.Fatalf("pushes = %d, want 1", pushes.Load())
	}
	// Recorded through the op log: the device sees delivered_at from "server".
	got := c.sync("dev2", nil)["ops"].([]any)
	found := false
	for _, o := range got {
		m := o.(map[string]any)
		if m["entity"] == "reminder" && m["field"] == "delivered_at" && m["device"] == "server" {
			found = true
		}
	}
	if !found {
		t.Fatal("delivery not recorded as an op")
	}
	// Nothing more is due for reminders; the tenant closes when idle.
	f.h.tick(ctx)
	if pushes.Load() != 1 {
		t.Fatalf("pushed again: %d", pushes.Load())
	}
	f.clock.Advance(11 * time.Minute)
	f.h.pool.sweep()
	if f.h.pool.isOpen("alice") {
		t.Fatal("still open after idle")
	}
}
