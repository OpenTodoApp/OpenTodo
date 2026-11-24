package backup

import (
	"context"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestRestoreForgetsFocusSession (sync-focus-sessions D6): a restore never brings
// back the Focus session that ran when the backup was taken; the other
// preferences of the row come back.
func TestRestoreForgetsFocusSession(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	uid := seed(t, e)
	ops := []opsync.Op{
		{ID: "f1", Entity: "user_prefs", EntityID: "me", Field: "focus_run", Value: []byte(opsync.QuoteJSON(`{"v":1,"rev":"r1"}`)), TS: 5, Device: "dev"},
		{ID: "f2", Entity: "user_prefs", EntityID: "me", Field: "date_format", Value: []byte(`"iso"`), TS: 5, Device: "dev"},
	}
	if _, err := opsync.NewService(e.db).Apply(ctx, uid, ops); err != nil {
		t.Fatal(err)
	}
	archive := backupOnce(t, e, "restore me")
	e.db.Close()
	if _, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "restore me"}); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"scope_fields", "ops"} {
		if n := count(t, e.dir, "SELECT COUNT(*) FROM "+table+" WHERE field = 'focus_run' AND value <> '\"\"'"); n != 0 {
			t.Fatalf("%s keeps %d focus_run values", table, n)
		}
		if n := count(t, e.dir, "SELECT COUNT(*) FROM "+table+" WHERE field = 'date_format' AND value = '\"iso\"'"); n != 1 {
			t.Fatalf("%s lost date_format (%d rows)", table, n)
		}
	}
}
