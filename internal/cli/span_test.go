package cli

import (
	"strings"
	"testing"
)

// TestSpanFlags (OpenSpec change multi-day-tasks, task 6.5): --span and
// --no-span set the flag on add and edit, the list's due cell shows a span's
// days, and both flags together exit 2 before any request.
func TestSpanFlags(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.login()
	id := strings.TrimSpace(h.mustRun("add", "Lisbon trip", "--start", "2026-11-03", "--due", "2026-11-05", "--span"))
	if got := h.task(id); got["span"] != true || got["start"] != "2026-11-03" {
		t.Fatalf("created = %v", got)
	}
	if out := h.mustRun("list"); !strings.Contains(out, "2026-11-05 3–5 Nov") {
		t.Fatalf("list:\n%s", out)
	}
	h.mustRun("edit", id, "--no-span")
	if got := h.task(id); got["span"] != false || got["start"] != "2026-11-03" {
		t.Fatalf("no-span = %v", got)
	}
	if out := h.mustRun("list"); strings.Contains(out, "3–5 Nov") || !strings.Contains(out, "starts 2026-11-03") {
		t.Fatalf("list after --no-span:\n%s", out)
	}
	h.mustRun("edit", id, "--start", "2026-10-30", "--due", "2026-11-02", "--span")
	if out := h.mustRun("list"); !strings.Contains(out, "30 Oct – 2 Nov") {
		t.Fatalf("list across months:\n%s", out)
	}
	h.requestLog()
	if code, _, errb := h.run("edit", id, "--span", "--no-span"); code != ExitUsage || !strings.Contains(errb, "--no-span") {
		t.Fatalf("both = %d %q", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("refused flags wrote: %v", w)
	}
}

func TestSpanRange(t *testing.T) {
	s := func(v string) *string { return &v }
	cases := []struct {
		t    task
		want string
	}{
		{task{Span: true, Start: s("2026-11-03"), Due: &due{Date: "2026-11-05"}}, "3–5 Nov"},
		{task{Span: true, Start: s("2026-10-30"), Due: &due{Date: "2026-11-02"}}, "30 Oct – 2 Nov"},
		{task{Span: true, Start: s("2026-12-30"), Due: &due{Date: "2027-01-02"}}, "30 Dec 2026 – 2 Jan 2027"},
		{task{Span: false, Start: s("2026-11-03"), Due: &due{Date: "2026-11-05"}}, ""},
		{task{Span: true, Start: s("someday"), Due: &due{Date: "2026-11-05"}}, ""},
		{task{Span: true, Start: s("2026-11-05"), Due: &due{Date: "2026-11-05"}}, ""},
		{task{Span: true, Start: s("2026-11-03")}, ""},
	}
	for _, c := range cases {
		if got := spanRange(c.t); got != c.want {
			t.Errorf("%+v: %q, want %q", c.t, got, c.want)
		}
	}
}
