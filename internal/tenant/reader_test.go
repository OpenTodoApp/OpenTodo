package tenant

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The reader pool opens and closes with the tenant, so a database file
// replaced while the tenant was closed (how a restore is applied) is what the
// reads see after reopening (OpenSpec change database-concurrency).
func TestReaderFollowsTheDatabaseAcrossReopen(t *testing.T) {
	ctx := context.Background()
	dir, other := t.TempDir(), t.TempDir()
	open := func(d string) *Tenant {
		tn, err := Open(ctx, testConfig(d), Options{Version: "test", Web: http.NotFoundHandler()})
		if err != nil {
			t.Fatal(err)
		}
		return tn
	}
	write := func(tn *Tenant, title string) {
		if _, err := tn.Sync.Apply(ctx, "u1", []opsync.Op{{ID: "op-" + title, Entity: "task", EntityID: "t1", Field: "title",
			Value: json.RawMessage(`"` + title + `"`), TS: 100, Device: "A"}}); err != nil {
			t.Fatal(err)
		}
	}
	title := func(tn *Tenant) string {
		e, err := tn.Sync.Get(ctx, "u1", "task", "t1")
		if err != nil || e == nil {
			t.Fatalf("get: %v, %v", e, err)
		}
		return string(e["title"])
	}
	tn := open(dir)
	write(tn, "current")
	if got := title(tn); got != `"current"` {
		t.Fatalf("title = %s", got)
	}
	// The backup to restore: another database with another title.
	bk := open(other)
	write(bk, "restored")
	snap := filepath.Join(t.TempDir(), "snap.db")
	if _, err := bk.DB.Exec(`VACUUM INTO ?`, snap); err != nil {
		t.Fatal(err)
	}
	bk.Close()
	tn.Close()
	if err := tn.Reader.Ping(); err == nil {
		t.Fatal("reader pool still open after Close")
	}
	for _, suffix := range []string{"-wal", "-shm"} {
		os.Remove(store.DBPath(dir) + suffix)
	}
	if err := os.Rename(snap, store.DBPath(dir)); err != nil {
		t.Fatal(err)
	}
	tn = open(dir)
	defer tn.Close()
	if got := title(tn); got != `"restored"` {
		t.Fatalf("title after restore = %s, want the restored database's", got)
	}
}
