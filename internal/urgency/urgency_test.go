package urgency

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

const vectorsPath = "../../web/src/lib/urgency.vectors.json"

type vectorTask struct {
	ID          string     `json:"id"`
	Priority    int        `json:"priority"`
	Due         *zoned.Due `json:"due"`
	Deadline    *string    `json:"deadline"`
	Start       *string    `json:"start"`
	CreatedAt   int64      `json:"created_at"`
	CompletedAt *int64     `json:"completed_at"`
	DeletedAt   *int64     `json:"deleted_at"`
	BlockedBy   []string   `json:"blocked_by"`
}

func (v vectorTask) task() Task {
	t := Task{ID: v.ID, Priority: v.Priority, Due: v.Due, CreatedAt: v.CreatedAt, Completed: v.CompletedAt != nil, Deleted: v.DeletedAt != nil, BlockedBy: v.BlockedBy}
	if v.Deadline != nil {
		t.Deadline = *v.Deadline
	}
	if v.Start != nil {
		t.Start = *v.Start
	}
	return t
}

type vector struct {
	Name          string       `json:"name"`
	Now           string       `json:"now"`
	Zone          string       `json:"zone"`
	DayStart      int          `json:"day_start"`
	Task          vectorTask   `json:"task"`
	Others        []vectorTask `json:"others"`
	RunningTaskID *string      `json:"running_task_id"`
	Expect        *Result      `json:"expect"`
}

func TestVectors(t *testing.T) {
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []vector `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Cases) < 30 {
		t.Fatalf("only %d cases", len(file.Cases))
	}
	for _, v := range file.Cases {
		t.Run(v.Name, func(t *testing.T) {
			loc, err := zoned.Load(v.Zone)
			if err != nil {
				t.Fatal(err)
			}
			now, err := time.Parse(time.RFC3339, v.Now)
			if err != nil {
				t.Fatal(err)
			}
			task := v.Task.task()
			all := []Task{task}
			for _, o := range v.Others {
				all = append(all, o.task())
			}
			g := NewGraph(all)
			c := Context{Today: Today(now, loc, v.DayStart), Loc: loc, DayStart: v.DayStart, Blocks: g.Blocks(task.ID), Blocked: g.Blocked(task),
				Timer: v.RunningTaskID != nil && *v.RunningTaskID == task.ID}
			got, ok := Score(task, c)
			if v.Expect == nil {
				if ok {
					t.Fatalf("got %+v, want no score", got)
				}
				return
			}
			if !ok || got.Score != v.Expect.Score || !reflect.DeepEqual(got.Parts, v.Expect.Parts) {
				t.Fatalf("got %+v (ok %v), want %+v", got, ok, *v.Expect)
			}
		})
	}
}

func TestRampClamps(t *testing.T) {
	for d, want := range map[int]float64{-30: 1, -7: 1, 14: 0.2, 40: 0.2} {
		if got := Ramp(d); got != want {
			t.Errorf("Ramp(%d) = %v, want %v", d, got, want)
		}
	}
}

func TestLessTies(t *testing.T) {
	tie := func() bool { return true }
	if !Less(3, 2, false, tie) || Less(2, 3, false, tie) || !Less(2, 3, true, tie) || !Less(2, 2, false, tie) {
		t.Fatal("Less orders highest first, lowest first when ascending, ties by the chain")
	}
}
