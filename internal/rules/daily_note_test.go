package rules

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// daily-notes 4.1, 4.2: "What I finished today", "Converges with a device" and
// "Setting off" for the Get the daily note step.
func TestDailyNoteStep(t *testing.T) {
	h, _, env := routineHarness(t)
	env.DailyNotes = true
	h.project("alice", "journal", "Journal", "")
	h.write("alice", "phone", "user_prefs", "me", map[string]any{"daily_notes": true, "daily_notes_project": "journal", "daily_notes_template": ""})
	h.routine("alice", "done", "Done today", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"daily_note","in":{}},
		{"id":"b","kind":"append_to_note","in":{"of":{"ref":"a"},"text":{"literal":"Done: water the plants"}}}]`)
	res := h.runNow("alice", "done", "", false)
	if res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	day := h.clock.UTC().Format("2006-01-02")
	id := opsync.DailyNoteID("alice", day)
	n := h.getNote("alice", id)
	if strOf(n["day"]) != day || strOf(n["project_id"]) != "journal" || strOf(n["title"]) == "" {
		t.Fatalf("daily note %v", n)
	}
	if strOf(n["description"]) == "" || len(appendedOf(n)) != 1 {
		t.Fatalf("template text or the appended line missing: %v", n)
	}

	// Converges with a device: the phone, offline, had created the same day's
	// note with the same text; after it syncs there is still one note.
	h.write("alice", "phone", "note", id, map[string]any{"title": strOf(n["title"]), "day": day, "description": strOf(n["description"])})
	count := 0
	for _, e := range h.notes("alice") {
		if strOf(e["day"]) == day {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("%d notes for %s", count, day)
	}
	// A second run finds the same note and adds to it.
	if res := h.runNow("alice", "done", "", false); res.Run.Outcome != OutcomeApplied || len(appendedOf(h.getNote("alice", id))) != 2 {
		t.Fatalf("second run %+v", res.Run)
	}

	// Setting off: the run fails at the step and writes nothing.
	env.DailyNotes = false
	h.write("alice", "phone", "user_prefs", "me", map[string]any{"daily_notes": false})
	res = h.runNow("alice", "done", "", false)
	if res.Run.Outcome != OutcomeFailed || res.Run.Writes != 0 || !strings.Contains(strings.ToLower(res.Run.Reason), "daily") {
		t.Fatalf("off: %+v %v", res.Run, statuses(res))
	}
}

// daily-notes "Routine and offline device": the routine creates the day's note on
// the server while the phone, offline, had created the same day and typed into it.
// The server writes `day` and the text in one batch, at one clock, which is what
// a device reads as the day's creation and folds under a body named after the day and the text
// (web/src/lib/richtext.ts foldBack), the name the phone's own creation used; so the
// phone's document is kept and the template text is there once.
func TestDailyNoteRoutineAndOfflineDevice(t *testing.T) {
	h, _, env := routineHarness(t)
	env.DailyNotes = true
	h.write("alice", "phone", "user_prefs", "me", map[string]any{"daily_notes": true, "daily_notes_template": ""})
	h.routine("alice", "open", "Open the day", `{"kind":"manual"}`, "", `[{"id":"a","kind":"daily_note","in":{}}]`)
	day := h.clock.UTC().Format("2006-01-02")
	id := opsync.DailyNoteID("alice", day)
	if res := h.runNow("alice", "open", "", false); res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	n := h.getNote("alice", id)
	template := strOf(n["description"])
	if template == "" {
		t.Fatalf("no template text: %v", n)
	}

	// The creation's clock: `day` and `description` written by one op batch.
	ops, _, _, err := h.sync.Pull(h.ctx, "alice", 0, "other", 1000)
	if err != nil {
		t.Fatal(err)
	}
	clock := map[string]opsync.Op{}
	for _, o := range ops {
		if o.Entity == "note" && o.EntityID == id {
			clock[o.Field] = o
		}
	}
	if d, ok := clock["day"]; !ok || d.TS != clock["description"].TS || d.Device != clock["description"].Device {
		t.Fatalf("day %+v and description %+v are not one write", clock["day"], clock["description"])
	}

	// The phone's batch arrives: its own creation of the day (refused by nothing),
	// then the document and its projection with the line typed offline.
	doc := "yjs:v1:" + base64.StdEncoding.EncodeToString([]byte("the phone's document"))
	typed := template + "\n\nCall the bank"
	h.write("alice", "phone", "note", id, map[string]any{"title": strOf(n["title"]), "day": day, "description": template})
	h.clock = h.clock.Add(time.Minute)
	h.write("alice", "phone", "note", id, map[string]any{"notes_doc": doc, "description": typed})

	count := 0
	for _, e := range h.notes("alice") {
		if strOf(e["day"]) == day {
			count++
		}
	}
	got := h.getNote("alice", id)
	if count != 1 || strOf(got["day"]) != day {
		t.Fatalf("%d notes for %s, day %v", count, day, got["day"])
	}
	if strOf(got["notes_doc"]) != doc {
		t.Fatalf("the phone's document was not kept: %v", got["notes_doc"])
	}
	text := strOf(got["description"])
	if strings.Count(text, template) != 1 || !strings.Contains(text, "Call the bank") {
		t.Fatalf("want the template once and the typed line, got %q", text)
	}
}
