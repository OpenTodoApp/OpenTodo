package vault

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestOwnership covers "One syncing device per vault folder" (OpenSpec change
// obsidian-vault-sync): an older state is taken by the first installation, a
// folder another one owns is refused before any request, and taking over keeps
// the server's values, lists differing lines and creates nothing twice.
func TestOwnership(t *testing.T) {
	dir := t.TempDir()
	f := &fake{log: append(project("p-home", "Home"), task("t1", "Pay rent", "p-home", nil)...)}
	laptop := &Owner{Kind: "cli", Install: "laptop", Label: "laptop"}
	phone := &Owner{Kind: "obsidian", Install: "phone", Label: "Obsidian on iPhone"}
	now := time.Date(2026, 11, 2, 9, 0, 0, 0, time.UTC)
	run := func(o *Owner, takeOver bool) (*Report, error) {
		return Sync(context.Background(), Options{Dir: dir, Transport: f, Loc: time.UTC, Owner: o, TakeOver: takeOver, Now: func() time.Time { return now }})
	}
	// An older state: no owner, so the laptop becomes the owner.
	if _, err := Sync(context.Background(), Options{Dir: dir, Transport: f, Loc: time.UTC, State: NewState("default", "http://x"), Now: func() time.Time { return now }}); err != nil {
		t.Fatal(err)
	}
	if _, err := run(laptop, false); err != nil {
		t.Fatal(err)
	}
	st, _ := LoadState(dir)
	if st.Owner == nil || st.Owner.Install != "laptop" || st.LeaseUntil != now.Add(Lease).UnixMilli() {
		t.Fatalf("owner %+v lease %d", st.Owner, st.LeaseUntil)
	}
	// The phone is refused before any request.
	f.received = nil
	exchanges := len(f.log)
	_, err := run(phone, false)
	var oe *OwnedError
	if !errors.As(err, &oe) || !oe.Running() || !strings.Contains(err.Error(), "laptop") {
		t.Fatalf("err = %v", err)
	}
	if len(f.received) != 0 || len(f.log) != exchanges {
		t.Fatal("a refused sync talked to the server")
	}
	// The laptop is retired; the phone takes over.
	home := filepath.Join(dir, "Home.md")
	b, _ := os.ReadFile(home)
	text := strings.Replace(string(b), "Pay rent", "Pay the rent", 1) + "- [ ] Buy bulbs\n"
	if err := os.WriteFile(home, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	device := st.Device
	now = now.Add(time.Hour)
	rep, err := run(phone, true)
	if err != nil {
		t.Fatal(err)
	}
	st, _ = LoadState(dir)
	if st.Owner.Install != "phone" || st.Device == device || rep.Created != 1 || rep.Conflicts != 1 {
		t.Fatalf("take-over: owner %+v device %s report %+v", st.Owner, st.Device, rep)
	}
	if got := fieldsSent(f, "t1"); len(got) != 0 {
		t.Errorf("take-over pushed the file's values: %v", got)
	}
	conf, _ := os.ReadFile(filepath.Join(dir, "Home.conflict.md"))
	if !strings.Contains(string(conf), "Pay the rent 🆔 t1") {
		t.Errorf("conflict file:\n%s", conf)
	}
	if rep, err := run(phone, false); err != nil || rep.Created != 0 {
		t.Errorf("second sync: %+v %v", rep, err)
	}
}

// TestICloudPlaceholder: a file iCloud has not downloaded is skipped and its
// tasks are untouched; once it arrives it is read again.
func TestICloudPlaceholder(t *testing.T) {
	dir := t.TempDir()
	f := &fake{log: append(project("p-work", "Work"), task("t1", "Report", "p-work", nil)...)}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	work := filepath.Join(dir, "Work.md")
	b, _ := os.ReadFile(work)
	_ = os.Remove(work)
	if err := os.WriteFile(filepath.Join(dir, ".Work.md.icloud"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	f.received = nil
	rep, err := runFake(t, dir, f, nil)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Trashed != 0 || len(f.received) != 0 || rep.Written != 0 {
		t.Fatalf("placeholder: %+v sent %v", rep, f.received)
	}
	if _, err := os.Stat(work); err == nil {
		t.Fatal("Work.md written beside its placeholder")
	}
	_ = os.Remove(filepath.Join(dir, ".Work.md.icloud"))
	if err := os.WriteFile(work, []byte(strings.Replace(string(b), "Report", "Annual report", 1)), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := runFake(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	if fieldsSent(f, "t1")["title"] != `"Annual report"` {
		t.Errorf("edit after the download not sent: %v", f.received)
	}
}
