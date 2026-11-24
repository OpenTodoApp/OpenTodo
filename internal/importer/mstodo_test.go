package importer

import (
	"strings"
	"testing"
)

// Scenario tests of OpenSpec change mstodo-graph-fidelity; the golden preview of
// testdata/microsoft-todo-json/graph.json pins the whole mapping.

func msTodoTaskJSON(fields string) string {
	return `{"value":[{"displayName":"Work","wellknownListName":"none","id":"l1","tasks":[{"id":"t1","title":"Task","importance":"normal","isReminderOn":false,` + fields + `}]}]}`
}

func TestMicrosoftToDoRecurrencePatterns(t *testing.T) {
	due := func(d string) string {
		return `"dueDateTime":{"dateTime":"` + d + `T00:00:00.0000000","timeZone":"UTC"},`
	}
	for _, c := range []struct{ name, fields, want string }{
		{"every 2 weeks on days", due("2026-11-02") + `"recurrence":{"pattern":{"type":"weekly","interval":2,"daysOfWeek":["monday","thursday"],"firstDayOfWeek":"sunday"},"range":{"type":"noEnd"}}`,
			"every 2 weeks on monday, thursday"},
		{"weekdays", due("2026-11-02") + `"recurrence":{"pattern":{"type":"weekly","interval":1,"daysOfWeek":["monday","tuesday","wednesday","thursday","friday"]},"range":{"type":"noEnd"}}`,
			"every weekday"},
		{"second thursday", due("2026-11-12") + `"recurrence":{"pattern":{"type":"relativeMonthly","interval":1,"daysOfWeek":["thursday"],"index":"second"},"range":{"type":"noEnd"}}`,
			"every 2nd thursday"},
		{"last friday", due("2026-11-27") + `"recurrence":{"pattern":{"type":"relativeMonthly","interval":1,"daysOfWeek":["friday"],"index":"last"},"range":{"type":"noEnd"}}`,
			"every last friday"},
		{"first weekday", due("2026-12-01") + `"recurrence":{"pattern":{"type":"relativeMonthly","interval":1,"daysOfWeek":["monday","tuesday","wednesday","thursday","friday"],"index":"first"},"range":{"type":"noEnd"}}`,
			"every 1st weekday"},
		{"every 3 months", due("2026-12-01") + `"recurrence":{"pattern":{"type":"absoluteMonthly","interval":3,"dayOfMonth":1},"range":{"type":"noEnd"}}`,
			"every 3 months"},
		{"yearly on a date", due("2026-11-04") + `"recurrence":{"pattern":{"type":"absoluteYearly","interval":1,"month":11,"dayOfMonth":4},"range":{"type":"noEnd"}}`,
			"every year"},
		{"every 2 years", due("2026-11-04") + `"recurrence":{"pattern":{"type":"absoluteYearly","interval":2,"month":11,"dayOfMonth":4},"range":{"type":"noEnd"}}`,
			"every 2 years"},
		{"fourth thursday of november", due("2026-11-26") + `"recurrence":{"pattern":{"type":"relativeYearly","interval":1,"month":11,"daysOfWeek":["thursday"],"index":"fourth"},"range":{"type":"noEnd"}}`,
			"every 4th thursday of november"},
		{"until", due("2026-11-03") + `"recurrence":{"pattern":{"type":"daily","interval":1},"range":{"type":"endDate","startDate":"2026-11-03","endDate":"2026-12-31"}}`,
			"every day until 2026-12-31"},
		{"count", due("2026-11-03") + `"recurrence":{"pattern":{"type":"daily","interval":3},"range":{"type":"numbered","numberOfOccurrences":4}}`,
			"every 3 days for 4 times"},
		{"no end", due("2026-11-03") + `"recurrence":{"pattern":{"type":"daily","interval":1},"range":{"type":"noEnd","endDate":"0001-01-01","numberOfOccurrences":0}}`,
			"every day"},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"notStarted",`+c.fields), ""), "Task")
			if r.Recurrence != c.want || len(r.Warnings) > 0 {
				t.Fatalf("rule %q, warnings %v; want %q", r.Recurrence, r.Warnings, c.want)
			}
		})
	}
}

func TestMicrosoftToDoRecurrenceTheGrammarCannotSay(t *testing.T) {
	for name, pattern := range map[string]string{
		"two weekdays of the month":          `{"type":"relativeMonthly","interval":1,"daysOfWeek":["monday","friday"],"index":"first"}`,
		"every 2 months on the 2nd thursday": `{"type":"relativeMonthly","interval":2,"daysOfWeek":["thursday"],"index":"second"}`,
		"weeks counted from sunday":          `{"type":"weekly","interval":2,"daysOfWeek":["sunday","monday"],"firstDayOfWeek":"sunday"}`,
		"unknown type":                       `{"type":"hourly","interval":1}`,
	} {
		t.Run(name, func(t *testing.T) {
			r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"notStarted","dueDateTime":{"dateTime":"2026-11-02T00:00:00","timeZone":"UTC"},"recurrence":{"pattern":`+pattern+`,"range":{"type":"noEnd"}}`), ""), "Task")
			if r.Recurrence != "" || !hasWarning(r, "not supported") {
				t.Fatalf("rule %q, warnings %v", r.Recurrence, r.Warnings)
			}
		})
	}
}

func TestMicrosoftToDoCompletedRepeatHasNoRule(t *testing.T) {
	r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"completed","completedDateTime":{"dateTime":"2026-10-26T00:00:00.0000000","timeZone":"UTC"},
		"recurrence":{"pattern":{"type":"daily","interval":1},"range":{"type":"noEnd"}}`), ""), "Task")
	if !r.Completed || r.Recurrence != "" || len(r.Warnings) > 0 {
		t.Fatalf("completed %v, rule %q, warnings %v", r.Completed, r.Recurrence, r.Warnings)
	}
}

func TestMicrosoftToDoStatuses(t *testing.T) {
	for status, completed := range map[string]bool{"notStarted": false, "inProgress": false, "waitingOnOthers": false, "deferred": false, "completed": true} {
		r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"`+status+`"`), ""), "Task")
		if r.Completed != completed || len(r.Warnings) > 0 {
			t.Errorf("%s: completed %v, warnings %v", status, r.Completed, r.Warnings)
		}
	}
	if r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"paused"`), ""), "Task"); r.Completed || !hasWarning(r, `status "paused"`) {
		t.Errorf("unknown status: completed %v, warnings %v", r.Completed, r.Warnings)
	}
}

func TestMicrosoftToDoOutlookHTMLBody(t *testing.T) {
	body := `<html>\r\n<head>\r\n<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\">\r\n<style type=\"text/css\" style=\"display:none;\">\r\nP {margin-top:0;margin-bottom:0;}\r\n</style>\r\n</head>\r\n<body dir=\"ltr\"><div>Call &amp; ask</div><ul><li>one</li><li>&lt;b&gt;two&lt;/b&gt;</li></ul><!-- x > y --><script type=\"text/javascript\">alert(1)</script><STYLE>p{}</STYLE><p>end</p></body></html>`
	r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"notStarted","body":{"contentType":"html","content":"`+body+`"}`), ""), "Task")
	want := "Call & ask\n\n- one\n- <b>two</b>\nend"
	if r.Description != want {
		t.Fatalf("description %q, want %q", r.Description, want)
	}
	for _, leak := range []string{"margin", "alert", "x > y", "Content-Type", "p{}"} {
		if strings.Contains(r.Description, leak) {
			t.Errorf("description keeps %q", leak)
		}
	}
	// An unterminated style or comment drops the rest rather than showing it.
	if got := htmlToText(`text<style>p{color:red}`); got != "text" {
		t.Errorf("unterminated style: %q", got)
	}
	if got := htmlToText(`text<!-- open`); got != "text" {
		t.Errorf("unterminated comment: %q", got)
	}
}

func TestMicrosoftToDoDueReturnedInUTC(t *testing.T) {
	// Graph returns the local midnight of the chosen day converted to UTC: a task
	// due 15 April in an account at UTC+2 comes back as 2023-04-14T22:00 UTC.
	fields := `"status":"notStarted","dueDateTime":{"dateTime":"2023-04-14T22:00:00.0000000","timeZone":"UTC"},
		"startDateTime":{"dateTime":"2023-04-12T22:00:00.0000000","timeZone":"UTC"}`
	for _, zone := range []string{"Europe/Berlin", "Africa/Johannesburg", "UTC", "America/New_York"} {
		r := taskRow(t, parseIn(t, msTodoTaskJSON(fields), zone), "Task")
		if r.Due == nil || r.Due.Date != "2023-04-15" || r.Due.Time != "" || r.Start != "2023-04-13" {
			t.Errorf("%s: due %+v, start %q; want 2023-04-15 and 2023-04-13", zone, r.Due, r.Start)
		}
	}
	// A value at exactly midnight is the written day in any import zone, also
	// east of UTC+12, where midnight UTC is already the afternoon. Monthly and
	// yearly rules that restate that day still convert there.
	for _, c := range []struct{ zone, due, recurrence, want string }{
		{"America/Los_Angeles", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"}`, "", ""},
		{"Pacific/Auckland", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"}`, "", ""},
		{"Pacific/Kiritimati", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"}`, "", ""},
		{"America/Los_Angeles", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"Tokyo Standard Time"}`, "", ""},
		{"Pacific/Auckland", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"}`,
			`{"pattern":{"type":"absoluteYearly","interval":1,"month":11,"dayOfMonth":3},"range":{"type":"noEnd"}}`, "every year"},
		{"Pacific/Kiritimati", `{"dateTime":"2026-11-03T00:00:00.0000000","timeZone":"UTC"}`,
			`{"pattern":{"type":"absoluteMonthly","interval":2,"dayOfMonth":3},"range":{"type":"noEnd"}}`, "every 2 months"},
	} {
		fields := `"status":"notStarted","dueDateTime":` + c.due
		if c.recurrence != "" {
			fields += `,"recurrence":` + c.recurrence
		}
		r := taskRow(t, parseIn(t, msTodoTaskJSON(fields), c.zone), "Task")
		if r.Due == nil || r.Due.Date != "2026-11-03" || r.Recurrence != c.want || len(r.Warnings) > 0 {
			t.Errorf("%s %s: due %+v, rule %q, warnings %v", c.zone, c.due, r.Due, r.Recurrence, r.Warnings)
		}
	}
}

func TestMicrosoftToDoBadInterval(t *testing.T) {
	for _, interval := range []string{`"two"`, `0`, `-1`, `99999999999999999999`, `1000`} {
		r := taskRow(t, parseIn(t, msTodoTaskJSON(`"status":"notStarted","dueDateTime":{"dateTime":"2026-11-03T00:00:00","timeZone":"UTC"},
			"recurrence":{"pattern":{"type":"daily","interval":`+interval+`},"range":{"type":"noEnd"}}`), ""), "Task")
		if r.Recurrence != "" || !hasWarning(r, "not supported") {
			t.Errorf("interval %s: rule %q, warnings %v", interval, r.Recurrence, r.Warnings)
		}
	}
}

func TestMicrosoftToDoListKindsAndLinks(t *testing.T) {
	p := parseIn(t, `[{"displayName":"New kind","wellknownListName":"unknownFutureValue","id":"l1","tasks":[{"id":"t1","title":"Task","importance":"normal","status":"notStarted","isReminderOn":false,
		"linkedResources":[{"id":"r1","applicationName":"Teams","externalId":"x1"},{"id":"r2","displayName":"Doc","webUrl":"https://example.com/doc"}]}]}]`, "")
	r := taskRow(t, p, "Task")
	if r.ProjectSourceID == "" {
		t.Fatalf("an unknownFutureValue list must become a project: %+v", r)
	}
	if len(r.Links) != 1 || r.Links[0].URL != "https://example.com/doc" || !hasWarning(r, `"Teams" dropped`) {
		t.Fatalf("links %+v, warnings %v", r.Links, r.Warnings)
	}
}

func TestMicrosoftToDoSharedListNote(t *testing.T) {
	p := parseIn(t, `[{"displayName":"Family","wellknownListName":"none","isShared":true,"isOwner":false,"id":"l1","tasks":[]}]`, "")
	if len(p.Notes) != 1 || !strings.Contains(p.Notes[0], `"Family" is shared`) {
		t.Fatalf("notes %v", p.Notes)
	}
}
