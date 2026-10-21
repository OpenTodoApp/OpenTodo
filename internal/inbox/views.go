package inbox

// The Someday and Anytime views (OpenSpec change agent-planning-fields, design
// D4): the app's rules in web/src/lib/views.ts (isSomeday, inAnytime), ported so
// the assistant tools and `ot list` list what the app lists. Both read
// web/src/lib/views.vectors.json.

// Planned is the part of a task the view rules read.
type Planned struct {
	// Start is "", a date (YYYY-MM-DD) or "someday".
	Start       string
	HasDue      bool
	HasDeadline bool
	Completed   bool
	Deleted     bool
}

// Someday reports an open task parked in Someday.
func Someday(t Planned) bool {
	return !t.Completed && !t.Deleted && t.Start == "someday"
}

// Anytime reports an open task that is neither scheduled nor parked: no do-on
// date, no deadline and no start.
func Anytime(t Planned) bool {
	return !t.Completed && !t.Deleted && !t.HasDue && !t.HasDeadline && t.Start == ""
}
