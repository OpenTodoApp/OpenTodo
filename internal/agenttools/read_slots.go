package agenttools

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// ---- list_slots (OpenSpec change calendar-slots, design D9) ----
//
// A slot is one block on the user's Day and Week grid that holds a checklist of
// small tasks ("Admin" on Wednesday 16:00-16:45). An assistant reads slots and
// the tasks they hold; there is no write tool for slots in this release.

// MaxSlotDays bounds the range list_slots reads.
const MaxSlotDays = 31

// EncryptedSlot stands in for a slot title this server cannot read.
const EncryptedSlot = "Encrypted slot"

func init() {
	register(tool{
		def: readDef("list_slots", "List slots",
			"List the user's calendar slots (one block on the Day and Week grid holding a checklist of small tasks, such as \"Admin\" on Wednesday 16:00-16:45) "+
				"on the days from..to, with floating wall times, the length in minutes and the tasks each holds in order (open first). "+
				"Default: the seven days from today in timezone; at most 31 days. A task in a slot is an ordinary task due on the slot's day without a time.",
			object(nil, map[string]any{
				"from":     map[string]any{"type": "string", "format": "date", "description": "First day (YYYY-MM-DD). Default: today in timezone."},
				"to":       map[string]any{"type": "string", "format": "date", "description": "Last day (YYYY-MM-DD), at most 30 days after from. Default: six days after from."},
				"timezone": timezoneProp,
			})),
		read: (*Registry).listSlots,
	})
}

// slotText is a slot's user-written text.
type slotText struct {
	Title string `json:"title"`
}

type slotTaskOut struct {
	ID        string   `json:"id"`
	Untrusted slotTask `json:"untrusted_text"`
	Done      bool     `json:"done"`
	Estimate  *int     `json:"estimate_minutes"`
}

type slotTask struct {
	Title string `json:"title"`
}

type slotOut struct {
	ID        string        `json:"id"`
	Untrusted slotText      `json:"untrusted_text"`
	Date      string        `json:"date"`
	Start     string        `json:"start"`
	Minutes   int           `json:"minutes"`
	Color     string        `json:"color"`
	Tasks     []slotTaskOut `json:"tasks"`
}

// slotTitle is a slot's title for an assistant: "Slot" when empty, the placeholder when it is ciphertext.
func slotTitle(e opsync.Entity) string {
	t := rawStr(e, "title")
	switch {
	case e2ee.IsCiphertext(t):
		return EncryptedSlot
	case t == "":
		return "Slot"
	}
	return t
}

// slotsOut lists live slots with dates in [from, to] ("" is open) and the tasks
// each shows: listed tasks the user can see, not deleted, due on the slot's day
// or undated (design D2; the zone is the stored date's).
func (r *Registry) slotsOut(ctx context.Context, userID, from, to string) ([]slotOut, error) {
	rows, err := r.list(ctx, userID, "slot", false)
	if err != nil {
		return nil, err
	}
	out := []slotOut{}
	for _, e := range rows {
		date := rawStr(e, "date")
		if date == "" || (from != "" && date < from) || (to != "" && date > to) {
			continue
		}
		s := slotOut{ID: rawStr(e, "id"), Untrusted: slotText{Title: slotTitle(e)}, Date: date, Start: rawStr(e, "start"), Color: rawStr(e, "color"), Tasks: []slotTaskOut{}}
		_ = json.Unmarshal(e["minutes"], &s.Minutes)
		var ids []string
		_ = json.Unmarshal(e["task_ids"], &ids)
		var done []slotTaskOut
		for _, id := range ids {
			t, err := r.get(ctx, userID, "task", id)
			if err != nil {
				return nil, err
			}
			if t == nil || t.Deleted() {
				continue
			}
			var due struct {
				Date string `json:"date"`
			}
			_ = json.Unmarshal(t["due"], &due)
			if due.Date != "" && due.Date != date {
				continue
			}
			item := slotTaskOut{ID: id, Untrusted: slotTask{Title: str(t, "title")}, Done: string(t["completed_at"]) != "null" && len(t["completed_at"]) > 0}
			_ = json.Unmarshal(t["estimate_minutes"], &item.Estimate)
			if item.Done {
				done = append(done, item)
			} else {
				s.Tasks = append(s.Tasks, item)
			}
		}
		s.Tasks = append(s.Tasks, done...)
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Date != out[j].Date {
			return out[i].Date < out[j].Date
		}
		return out[i].Start < out[j].Start
	})
	return out, nil
}

func (r *Registry) listSlots(ctx context.Context, userID string, a args) (map[string]any, error) {
	from, err := a.date("from")
	if err != nil {
		return nil, err
	}
	to, err := a.date("to")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	if from == "" {
		from = r.now().In(loc).Format(time.DateOnly)
	}
	first, _ := time.Parse(time.DateOnly, from)
	if to == "" {
		to = first.AddDate(0, 0, 6).Format(time.DateOnly)
	}
	last, _ := time.Parse(time.DateOnly, to)
	if last.Before(first) {
		return nil, argErr("to: must not be before from")
	}
	if last.After(first.AddDate(0, 0, MaxSlotDays-1)) {
		return nil, argErr("to: at most 31 days from from")
	}
	slots, err := r.slotsOut(ctx, userID, from, to)
	if err != nil {
		return nil, err
	}
	return map[string]any{"slots": slots, "from": from, "to": to, "timezone": loc.String(), "server_time": r.serverTime()}, nil
}

// SlotsResource is opentodo://slots (calendar-slots D9): the user's slots from
// today on, read-only, titles as untrusted text ("Encrypted slot" when unreadable).
func (r *Registry) SlotsResource(ctx context.Context, userID string) (map[string]any, error) {
	slots, err := r.slotsOut(ctx, userID, r.now().UTC().AddDate(0, 0, -1).Format(time.DateOnly), "")
	if err != nil {
		return nil, err
	}
	return noticed(map[string]any{"slots": slots}), nil
}
