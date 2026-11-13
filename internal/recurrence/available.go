package recurrence

import (
	"bytes"
	"encoding/json"
)

// Available reports whether a series still produces occurrences for lists,
// projections, reminders and the Today limit, given its stored
// habit_graduated_at (OpenSpec change habits-home, design D7): a graduated
// habit does not, until Resume continues it as a new piece. The web
// counterpart is the graduated check in web/src/lib/occurrences.ts
// occurrencesInRange and web/src/lib/habits.ts isGraduated.
func Available(graduatedAt json.RawMessage) bool {
	v := bytes.TrimSpace(graduatedAt)
	return len(v) == 0 || bytes.Equal(v, []byte("null"))
}
