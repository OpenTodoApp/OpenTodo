package httpapi

import (
	"context"
	"database/sql"
	"log/slog"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/tenant/services"
)

// testSet builds a test server's services the way tenant.Open does
// (services.Build). Without a data directory the test's own temporary one is
// used, so secrets and key files never land in the source tree.
func testSet(t testing.TB, cfg config.Config, db *sql.DB, o services.Options) *services.Set {
	t.Helper()
	if cfg.DataDir == "" {
		cfg.DataDir = t.TempDir()
	}
	if o.Version == "" {
		o.Version = "test"
	}
	if o.Log == nil {
		o.Log = slog.New(slog.DiscardHandler)
	}
	set, err := services.Build(context.Background(), cfg, db, nil, o)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(set.Sync.Notifier().CloseAll)
	return set
}

// asHosted makes the server a hosted tenant's (multi-tenant-host).
func asHosted(s *Server) { s.hosted, s.set.Hosted = true, &services.Hosted{} }
