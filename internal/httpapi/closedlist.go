package httpapi

import (
	"context"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/closedlist"
)

// closedListInfo is the closed_list object of GET /api/v1/me (OpenSpec change
// today-closed-list, design D7): the Today limit (0 = off) and the dates and ids
// of today's focus and taken slots as stored on the personal review row. Ids
// and dates only, never content. The client fills the slots itself with its
// own logical today.
func (s *Server) closedListInfo(ctx context.Context, userID string) map[string]any {
	out := map[string]any{"limit": 0, "focus_date": "", "focus": "", "slots_date": "", "slots": ""}
	if prefs, err := s.sync.Get(ctx, userID, "user_prefs", "me"); err == nil {
		var raw any
		if v, ok := prefs["today_limit"]; ok {
			_ = json.Unmarshal(v, &raw)
		}
		out["limit"] = closedlist.ReadLimit(raw)
	}
	if row, err := s.sync.Get(ctx, userID, "review", "me"); err == nil {
		for _, f := range []string{"focus_date", "focus", "slots_date", "slots"} {
			out[f] = idOf(row[f])
		}
	}
	return out
}
