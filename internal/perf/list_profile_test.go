//go:build perf

package perf

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// BenchmarkListProject is the work of server-list-project in one process, on the
// fixture TestServerBudgets measured: the project's tasks, their body versions and
// the JSON body. The perf job runs it with -cpuprofile, so a profile from the
// runner itself says what that budget's time goes to (#1656: the same code reads
// 83 to 161 ms on different runners, 117 ms on a developer machine).
func BenchmarkListProject(b *testing.B) {
	dir := os.Getenv("PERF_FIXTURE")
	if dir == "" {
		b.Skip("PERF_FIXTURE is not set")
	}
	raw, err := os.ReadFile(filepath.Join(dir, "perfseed.json"))
	if err != nil {
		b.Fatal(err)
	}
	var sum struct {
		OwnerID    string `json:"ownerId"`
		BigProject string `json:"bigProject"`
	}
	if err := json.Unmarshal(raw, &sum); err != nil {
		b.Fatal(err)
	}
	db, err := store.Open(dir)
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()
	s := opsync.NewService(db)
	ctx := context.Background()
	match := &opsync.Match{Field: "project_id", Value: json.RawMessage(opsync.QuoteJSON(sum.BigProject))}
	b.ResetTimer()
	for range b.N {
		list, err := s.ListWhere(ctx, sum.OwnerID, "task", false, match)
		if err != nil {
			b.Fatal(err)
		}
		if len(list) < 1000 {
			b.Fatalf("the big project lists %d tasks", len(list))
		}
		if _, err := s.BodyInfos(ctx, sum.OwnerID, "task", ""); err != nil {
			b.Fatal(err)
		}
		if _, err := json.Marshal(map[string]any{"tasks": list}); err != nil {
			b.Fatal(err)
		}
	}
}
