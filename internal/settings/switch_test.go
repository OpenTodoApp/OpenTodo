package settings

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/pixari/opentodo/internal/store"
)

func TestSwitch(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()

	off := NewSwitch(db, "a.enabled", SwitchOptions{})
	on := NewSwitch(db, "b.enabled", SwitchOptions{Default: true})
	if off.On(ctx) || !on.On(ctx) {
		t.Fatal("an unset switch reads as its default")
	}

	var events []bool
	record := func(_ *sql.Tx, before bool) error { events = append(events, before); return nil }
	if before, err := off.Set(ctx, true, record); err != nil || before {
		t.Fatalf("set: before=%v err=%v", before, err)
	}
	if _, err := off.Set(ctx, true, record); err != nil {
		t.Fatal(err)
	}
	if !off.On(ctx) || len(events) != 1 {
		t.Fatalf("on=%v events=%v: the hook runs only on a change", off.On(ctx), events)
	}
	// A fresh switch on the same key reads the stored JSON value.
	if !NewSwitch(db, "a.enabled", SwitchOptions{}).On(ctx) {
		t.Fatal("stored value not read")
	}

	// A failing hook rolls the change back.
	boom := errors.New("boom")
	if _, err := off.Set(ctx, false, func(*sql.Tx, bool) error { return boom }); !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
	if !off.On(ctx) || !NewSwitch(db, "a.enabled", SwitchOptions{}).On(ctx) {
		t.Fatal("a refused change must not be stored or cached")
	}

	// Seed writes only the first time and drops the cache.
	seeded := NewSwitch(db, "c.enabled", SwitchOptions{})
	_ = seeded.On(ctx)
	yes, no := true, false
	if wrote, err := seeded.Seed(ctx, &yes); err != nil || !wrote || !seeded.On(ctx) {
		t.Fatalf("seed: wrote=%v err=%v on=%v", wrote, err, seeded.On(ctx))
	}
	if wrote, _ := seeded.Seed(ctx, &no); wrote || !seeded.On(ctx) {
		t.Fatal("a second seed must not overwrite")
	}
	if wrote, _ := seeded.Seed(ctx, nil); wrote {
		t.Fatal("nil preset wrote")
	}

	// A fixed switch reads the fixed value and refuses changes.
	fixed := NewSwitch(db, "a.enabled", SwitchOptions{Fixed: &no, FixedBy: "OPENTODO_X"})
	if fixed.On(ctx) || !fixed.Locked() || fixed.FixedBy() != "OPENTODO_X" {
		t.Fatal("fixed switch")
	}
	if _, err := fixed.Set(ctx, true, nil); !errors.Is(err, ErrSetByEnvironment) {
		t.Fatalf("err = %v", err)
	}
	if on.Locked() || on.FixedBy() != "" {
		t.Fatal("an unfixed switch is not locked")
	}
}
