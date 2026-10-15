package digest

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// TestSharedFixture evaluates testdata/stats_fixture.json, which
// web/src/lib/stats.test.ts evaluates too, so the screen and the digest agree.
func TestSharedFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/stats_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Me, Today, Now, Zone string
		WeekStart            int `json:"weekStart"`
		Memberships          []struct {
			ProjectID string `json:"projectId"`
		}
		Tasks []struct {
			ID                               string  `json:"id"`
			ProjectID                        *string `json:"project_id"`
			AssigneeID                       string  `json:"assignee_id"`
			Due, Created, Completed, Deleted string
		}
		Expected map[string]Counts
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	loc, _ := time.LoadLocation(fx.Zone)
	at := func(s string) int64 {
		if s == "" {
			return 0
		}
		v, err := time.ParseInLocation("2006-01-02T15:04", s, loc)
		if err != nil {
			t.Fatal(err)
		}
		return v.UnixMilli()
	}
	var tasks []Task
	for _, x := range fx.Tasks {
		tk := Task{ID: x.ID, AssigneeID: x.AssigneeID, CreatedAt: at("2026-10-01T09:00"), CompletedAt: at(x.Completed), DeletedAt: at(x.Deleted)}
		if x.Created != "" {
			tk.CreatedAt = at(x.Created)
		}
		if x.ProjectID != nil {
			tk.ProjectID = *x.ProjectID
		}
		if x.Due != "" {
			tk.Due = &Due{Date: x.Due}
		}
		tasks = append(tasks, tk)
	}
	shared := map[string]bool{}
	for _, m := range fx.Memberships {
		shared[m.ProjectID] = true
	}
	now := time.UnixMilli(at(fx.Now))
	for kind, period := range map[string]Period{"this-week": ThisWeek(now, loc, fx.WeekStart), "last-week": LastFullWeek(now, loc, fx.WeekStart)} {
		if got := Compute(tasks, shared, fx.Me, period, fx.Today, loc); got != fx.Expected[kind] {
			t.Errorf("%s = %+v, want %+v", kind, got, fx.Expected[kind])
		}
	}
}
