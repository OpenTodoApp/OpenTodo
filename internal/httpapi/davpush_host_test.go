package httpapi

import (
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/davpush"
	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// A host runs a tenant's jobs one after another in one pass (internal/host/
// scheduler.go), so a hosted tenant's CalDAV push run stops sooner than a
// self-hosted server's and leaves the rest to the next pass (caldav-push).
func TestDavPushRunLimitOnHosts(t *testing.T) {
	for _, c := range []struct {
		hosted *services.Hosted
		want   time.Duration
	}{{nil, 0}, {&services.Hosted{}, davpush.HostRunBudget}} {
		db, err := storetest.OpenDir(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		set := testSet(t, config.Config{SessionTTL: time.Hour}, db, services.Options{Hosted: c.hosted})
		if got := set.DavPush.RunLimit; got != c.want {
			t.Errorf("hosted=%v: RunLimit = %v, want %v", c.hosted != nil, got, c.want)
		}
		db.Close()
	}
	if davpush.HostRunBudget >= davpush.RunBudget {
		t.Fatal("a host's budget is not shorter")
	}
}
