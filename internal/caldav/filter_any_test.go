package caldav

import (
	"strings"
	"testing"
)

// MatchesAnyTodo (OpenSpec change `server-query-costs`) may only claim filters
// that Matches accepts for every served task.
func TestMatchesAnyTodoAgreesWithMatches(t *testing.T) {
	due := "2026-10-15"
	tasks := [][]byte{
		Encode(Task{UID: "a", Title: "Plain", CreatedAt: 1}),
		Encode(Task{UID: "b", Title: "Due", Due: &Due{Date: due}, Extra: "X-FOO:bar"}),
		Encode(Task{UID: "c", Title: "Done", CompletedAt: new(int64(5))}),
	}
	wrap := func(inner string) string {
		return `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` + inner + `</c:calendar-query>`
	}
	for _, tc := range []struct {
		filter string
		any    bool
	}{
		{``, true},
		{`<c:filter/>`, true},
		{`<c:filter><c:comp-filter name="VCALENDAR"/></c:filter>`, true},
		{`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>`, true},
		{`<c:filter><c:comp-filter name="vcalendar"><c:comp-filter name="vtodo"></c:comp-filter></c:comp-filter></c:filter>`, true},
		{`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>`, false},
		{`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"><c:is-not-defined/></c:comp-filter></c:comp-filter></c:filter>`, false},
		{`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"><c:prop-filter name="COMPLETED"><c:is-not-defined/></c:prop-filter></c:comp-filter></c:comp-filter></c:filter>`, false},
		{`<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"><c:time-range start="20261001T000000Z" end="20261101T000000Z"/></c:comp-filter></c:comp-filter></c:filter>`, false},
		{`<c:filter><c:comp-filter name="VTODO"/></c:filter>`, false},
	} {
		root, err := ParseXML(strings.NewReader(wrap(tc.filter)))
		if err != nil {
			t.Fatal(err)
		}
		f := root.Child(NSCalDAV, "filter")
		if got := MatchesAnyTodo(f); got != tc.any {
			t.Fatalf("MatchesAnyTodo(%s) = %v", tc.filter, got)
		}
		if !tc.any {
			continue
		}
		for _, data := range tasks {
			comp, err := Parse(data)
			if err != nil {
				t.Fatal(err)
			}
			if !Matches(f, comp) {
				t.Fatalf("%s: Matches refuses a task that MatchesAnyTodo accepts", tc.filter)
			}
		}
	}
}
