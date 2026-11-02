package closedlist

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
)

type vTask struct {
	ID        string  `json:"id"`
	CreatedAt int64   `json:"created_at"`
	Earlier   bool    `json:"earlier"`
	Due       *string `json:"due"`
	Habit     bool    `json:"habit"`
	Blocked   bool    `json:"blocked"`
	Available *bool   `json:"available"`
	Time      *string `json:"time"`
	Deadline  *string `json:"deadline"`
}

type vector struct {
	Name      string `json:"name"`
	Limit     any    `json:"limit"`
	Predicate string `json:"predicate"`
	Review    struct {
		FocusDate string `json:"focus_date"`
		Focus     string `json:"focus"`
		SlotsDate string `json:"slots_date"`
		Slots     string `json:"slots"`
	} `json:"review"`
	Tasks  []vTask `json:"tasks"`
	Expect struct {
		Limit   int      `json:"limit"`
		Slots   []string `json:"slots"`
		Waiting []string `json:"waiting"`
		Chosen  int      `json:"chosen"`
	} `json:"expect"`
	TimeSensitive []struct {
		ID   string  `json:"id"`
		Time *string `json:"time"`
	} `json:"time_sensitive"`
	Take *struct {
		ID    string          `json:"id"`
		Taken json.RawMessage `json:"taken"`
	} `json:"take"`
}

// TestVectors evaluates the vectors shared with web/src/lib/closedList.test.ts.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/closedList.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Today  string   `json:"today"`
		Cases  []vector `json:"cases"`
		Limits [][]any  `json:"limits"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	for _, l := range file.Limits {
		want := int(l[1].(float64))
		if got := ReadLimit(l[0]); got != want {
			t.Errorf("ReadLimit(%v) = %d, want %d", l[0], got, want)
		}
	}
	for _, v := range file.Cases {
		t.Run(v.Name, func(t *testing.T) {
			avail := map[string]bool{}
			var tasks []Task
			for _, x := range v.Tasks {
				task := Task{ID: x.ID, CreatedAt: x.CreatedAt, Earlier: x.Earlier, Habit: x.Habit, Blocked: x.Blocked}
				if x.Due != nil {
					task.Due = *x.Due
				}
				if x.Time != nil {
					task.Time = *x.Time
				}
				if x.Deadline != nil {
					task.Deadline = *x.Deadline
				}
				avail[x.ID] = x.Available == nil || *x.Available
				tasks = append(tasks, task)
			}
			var pred func(Task) bool
			if v.Predicate == "flow" {
				pred = func(t Task) bool { return avail[t.ID] }
			}
			r := Review{FocusDate: v.Review.FocusDate, Focus: v.Review.Focus, SlotsDate: v.Review.SlotsDate, Slots: v.Review.Slots}
			f := Compute(Input{Tasks: tasks, Limit: v.Limit, Today: file.Today, Review: r}, pred)
			got := fmt.Sprint(f.Limit, f.Slots, f.Waiting, f.Chosen)
			want := fmt.Sprint(v.Expect.Limit, v.Expect.Slots, v.Expect.Waiting, v.Expect.Chosen)
			if got != want {
				t.Fatalf("fill = %s, want %s", got, want)
			}
			wantTS := []Sensitive{}
			for _, x := range v.TimeSensitive {
				s := Sensitive{ID: x.ID}
				if x.Time != nil {
					s.Time = *x.Time
				}
				wantTS = append(wantTS, s)
			}
			if got := TimeSensitive(f.WaitingTasks(tasks), file.Today); !reflect.DeepEqual(got, wantTS) {
				t.Fatalf("time sensitive = %v, want %v", got, wantTS)
			}
			if v.Take == nil {
				return
			}
			next, full := Take(f, IDs(r.Slots, r.SlotsDate, file.Today), v.Take.ID)
			if string(v.Take.Taken) == `"full"` {
				if !full {
					t.Fatalf("take = %v, want full", next)
				}
				return
			}
			var wantTaken []string
			if err := json.Unmarshal(v.Take.Taken, &wantTaken); err != nil {
				t.Fatal(err)
			}
			if full || !reflect.DeepEqual(next, wantTaken) {
				t.Fatalf("take = %v (full %v), want %v", next, full, wantTaken)
			}
		})
	}
}
