package vault

import (
	"strings"
	"time"
)

// The cases of the shared sync vectors (design D2): the scenarios of the
// markdown-vault requirements "Merge and conflict rules", "Task lines",
// "Completion and recurrence in files", "Labels, sections, subtasks and notes",
// "What the file does not round-trip", "Vault limits" and "Encrypted accounts
// in the vault", and of obsidian-vault-sync's ownership and placeholder rules.

type vxDef struct {
	name, desc string
	setup      func(c *vxCase)
	run        func(r *vxRec)
}

func ms(day string) int64 {
	t, _ := time.Parse("2006-01-02 15:04", day)
	return t.UnixMilli()
}

// home seeds Home with three tasks and the Inbox with one.
func home(r *vxRec) {
	r.project("p-home", "Home", nil)
	r.task("t-water", "Water the plants", "p-home", nil)
	r.task("t-rent", "Pay rent", "p-home", map[string]any{"position": 2000})
	r.task("t-call", "Call the plumber", "p-home", map[string]any{"position": 3000})
	r.task("t-inbox", "Buy stamps", "", nil)
}

var vxCases = []vxDef{
	{name: "first-write", desc: "the first sync writes one file per project, folder notes for parents and the Inbox; a second sync with no change writes nothing",
		run: func(r *vxRec) {
			r.project("p-home", "Home", map[string]any{"icon": "house"})
			r.project("p-work", "Work", map[string]any{"position": 2000, "color": "#3b82f6"})
			r.project("p-launch", "Launch", map[string]any{"parent_id": "p-work"})
			r.project("p-odd", "Q4/Q1: plans?", map[string]any{"position": 3000})
			r.project("p-gone", "Old", map[string]any{"position": 4000, "archived": true})
			r.task("t-one", "One", "", nil)
			r.task("t-two", "Two", "", map[string]any{"position": 500})
			r.task("t-plumber", "Book the plumber", "p-home", map[string]any{"priority": 2, "due": map[string]any{"date": "2026-11-05", "time": "09:00"}})
			r.task("t-ship", "Ship it", "p-launch", map[string]any{"deadline": "2026-11-20", "estimate_minutes": 90})
			r.task("t-done", "Done before", "p-home", map[string]any{"completed_at": ms("2026-10-30 08:00")})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.sync(vxOpts{name: "idle"})
		}},
	{name: "file-edits", desc: "a ticked line, a changed line and a new line reach the app; a new tag creates a label",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [x] Water the plants ✅ 2026-11-01")
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] ⏫ Pay rent #bills 📅 2026-11-26")
			r.write("Home.md", r.read("Home.md")+"- [ ] Order compost 📅 2026-11-03 🔽\n")
			r.sync(vxOpts{name: "edits"})
			r.sync(vxOpts{name: "idle"})
		}},
	{name: "conflicts", desc: "different fields changed on both sides both win; the same field keeps the app's value and the file's line goes to the conflict file",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [ ] Water the plants 🔺")
			r.put("task", "t-water", map[string]any{"title": "Water the ferns"})
			r.replace("Home.md", "- [ ] Call the plumber", "- [ ] Call the gas man")
			r.put("task", "t-call", map[string]any{"title": "Call the electrician"})
			r.sync(vxOpts{name: "both sides"})
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] Pay the rent")
			r.sync(vxOpts{name: "second conflict file entry"})
		}},
	{name: "line-removal", desc: "a removed line trashes its task and subtasks; a task changed in the app is written back; a removed completed line is only cleared",
		run: func(r *vxRec) {
			r.project("p-home", "Home", nil)
			r.task("t-old", "Old idea", "p-home", nil)
			r.task("t-sub", "Sub idea", "p-home", map[string]any{"parent_id": "t-old"})
			r.task("t-keep", "Water plants", "p-home", map[string]any{"position": 2000})
			r.task("t-done", "Done thing", "p-home", map[string]any{"position": 3000})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.put("task", "t-done", map[string]any{"completed_at": ms("2026-11-02 09:00")})
			r.sync(vxOpts{name: "completed in the app"})
			var keep []string
			for _, l := range strings.Split(r.read("Home.md"), "\n") {
				if !strings.Contains(l, "idea") && !strings.Contains(l, "Water plants") && !strings.Contains(l, "Done thing") {
					keep = append(keep, l)
				}
			}
			r.write("Home.md", strings.Join(keep, "\n"))
			r.put("task", "t-keep", map[string]any{"priority": 1})
			r.sync(vxOpts{name: "removed"})
		}},
	{name: "trashed-while-edited", desc: "a line edited in the file whose task was trashed in the app goes to the conflict file",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "Pay rent", "Pay the rent")
			r.put("task", "t-rent", map[string]any{"deleted_at": ms("2026-11-02 09:00")})
			r.sync(vxOpts{name: "edited and trashed"})
		}},
	{name: "project-files", desc: "a renamed file renames its project, a new file becomes a project, a deleted file is written back, a file moved into a folder nests its project",
		run: func(r *vxRec) {
			r.project("p-home", "Home", nil)
			r.project("p-work", "Work", map[string]any{"position": 2000})
			r.project("p-launch", "Launch", map[string]any{"parent_id": "p-work"})
			r.task("t-ship", "Ship", "p-launch", nil)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.write("Household.md", r.read("Home.md"))
			r.remove("Home.md")
			r.write("Garden.md", "- [ ] Dig\n- [ ] Plant\n- [ ] Water\n")
			r.remove("Work/Launch.md")
			r.sync(vxOpts{name: "rename, new, deleted"})
			r.write("Household/Garden.md", r.read("Garden.md"))
			r.remove("Garden.md")
			r.sync(vxOpts{name: "moved into a folder"})
		}},
	{name: "archived-projects", desc: "a project archived in the app: an unchanged file is removed, an edited one becomes a conflict file",
		run: func(r *vxRec) {
			r.project("p-home", "Home", nil)
			r.project("p-work", "Work", map[string]any{"position": 2000})
			r.task("t-a", "Mow", "p-home", nil)
			r.task("t-b", "Report", "p-work", nil)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Work.md", "Report", "Write the report")
			r.put("project", "p-home", map[string]any{"archived": true})
			r.put("project", "p-work", map[string]any{"archived": true})
			r.sync(vxOpts{name: "archived"})
		}},
	{name: "front-matter", desc: "colour, icon, flow and status in the front matter merge per key; unknown values stay as written; foreign keys are kept",
		run: func(r *vxRec) {
			r.project("p-home", "Home", nil)
			r.project("p-work", "Work", map[string]any{"position": 2000, "flow_mode": "sequential"})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "opentodo-color: \"#22c55e\"\n", "opentodo-color: \"#ef4444\"\nopentodo-icon: house\nopentodo-flow: area\nopentodo-status: maintenance\naliases: [flat]\n")
			r.replace("Work.md", "opentodo-flow: sequential\n", "opentodo-flow: waterfall\nopentodo-color: red\n")
			r.sync(vxOpts{name: "edited"})
			r.put("project", "p-home", map[string]any{"status": "active", "icon": nil})
			r.sync(vxOpts{name: "app changes"})
		}},
	{name: "recurring", desc: "ticking a recurring line completes the occurrence as a record and moves the series to its next date",
		run: func(r *vxRec) {
			r.task("t-bins", "Bins", "", map[string]any{"due": map[string]any{"date": "2026-11-02"}, "recurrence": "every week", "deadline": "2026-11-03"})
			r.task("t-water", "Water", "", map[string]any{"position": 2000, "due": map[string]any{"date": "2026-11-01", "time": "08:00"}, "recurrence": "every 3 days after completion"})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Inbox.md", "- [ ] Bins", "- [x] Bins")
			r.replace("Inbox.md", "- [ ] Water", "- [x] Water ✅ 2026-11-02")
			r.sync(vxOpts{name: "ticked"})
			r.sync(vxOpts{name: "idle"})
		}},
	{name: "recurrence-edits", desc: "a 🔁 rule written in the file is canonicalised; 'when done' reads as after completion; a rule that does not parse is reported",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] Pay rent 📅 2026-11-30 🔁 Every Month")
			r.replace("Home.md", "- [ ] Water the plants", "- [ ] Water the plants 📅 2026-11-03 🔁 every 2 days when done")
			r.replace("Home.md", "- [ ] Call the plumber", "- [ ] Call the plumber 🔁 every blursday")
			r.sync(vxOpts{name: "rules"})
		}},
	{name: "sections-subtasks-notes", desc: "a heading makes a section, an indented line a subtask, indented prose a note; prose stays where it is",
		run: func(r *vxRec) {
			home(r)
			r.put("section", "s-weekend", map[string]any{"name": "Weekend", "project_id": "p-home", "position": 1000, "deleted_at": nil})
			r.task("t-hike", "Hike", "p-home", map[string]any{"section_id": "s-weekend", "description": "Bring water\n\n- [ ] boots"})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			text := r.read("Home.md")
			text = strings.Replace(text, "- [ ] Water the plants 🆔 t-water", "Things for the flat.\n\n- [ ] Water the plants 🆔 t-water\n  - [ ] Fill the can\n  Use rain water.", 1)
			text += "\n## Garden\n\n- [ ] Rake leaves\n- [ ] Plant bulbs\n"
			r.write("Home.md", text)
			r.sync(vxOpts{name: "structure"})
			r.sync(vxOpts{name: "idle"})
		}},
	{name: "reorder", desc: "moving one line in a file is one position op",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			text := r.read("Home.md")
			lines := strings.Split(text, "\n")
			var water, rest []string
			for _, l := range lines {
				if strings.Contains(l, "Water the plants") {
					water = append(water, l)
					continue
				}
				rest = append(rest, l)
			}
			out := strings.Join(rest, "\n")
			out = strings.Replace(out, "- [ ] Call the plumber", water[0]+"\n- [ ] Call the plumber", 1)
			r.write("Home.md", out)
			r.sync(vxOpts{name: "moved"})
			r.write("Home.md", r.read("Home.md")+"- [ ] New at the end\n")
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] First new\n- [ ] Pay rent")
			r.sync(vxOpts{name: "new lines placed"})
		}},
	{name: "inline-fields", desc: "time, tz, deadline, estimate, evening, daypart, energy, span and someday round-trip and reach the app",
		run: func(r *vxRec) {
			home(r)
			r.task("t-fields", "Fields", "p-home", map[string]any{"position": 4000, "due": map[string]any{"date": "2026-11-04", "time": "14:30", "tz": "Europe/Berlin"}, "evening": true, "energy": "deep", "estimate_minutes": 150, "start": "someday"})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [ ] Water the plants 📅 2026-11-05 [time:: 07:15] [daypart:: morning] [energy:: Low] [estimate:: 1h 30m]")
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] Pay rent 📅 2026-11-08 🛫 2026-11-06 [span:: TRUE] [deadline:: 2026-11-09]")
			r.replace("Home.md", "[evening:: true]", "")
			r.sync(vxOpts{name: "edited"})
		}},
	{name: "bad-values", desc: "values that do not parse are reported and the task keeps its value; an unknown id stays as text; a duplicate id becomes a new task",
		setup: func(c *vxCase) { c.Shared = []string{"p-shared"} },
		run: func(r *vxRec) {
			home(r)
			r.project("p-shared", "Shared", map[string]any{"position": 2000})
			r.task("t-theirs", "Theirs", "p-shared", nil)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [ ] Water the plants 📅 2026-02-30 ⏫ [time:: 25:00] [daypart:: noon] [energy:: huge] [span:: maybe] [estimate:: forever]")
			r.replace("Home.md", "- [ ] Pay rent", "- [ ] Pay rent ⛔ t-theirs 🔽")
			r.replace("Home.md", "- [ ] Call the plumber 🆔 t-call", "- [ ] Call the plumber ⛔ t-water 🆔 t-call\n- [ ] Ghost 🆔 not-a-task\n- [ ] Copy 🆔 t-call")
			r.sync(vxOpts{name: "bad values"})
		}},
	{name: "unknown-and-read-only", desc: "Obsidian Tasks fields the vault does not map stay on the line; read-only fields edited in the file are written back from the app",
		run: func(r *vxRec) {
			home(r)
			r.put("task", "t-call", map[string]any{"origin": map[string]any{"kind": "github", "url": "https://github.com/acme/flat/issues/7"}, "location": map[string]any{"name": "Shop", "lat": 1.5, "lng": 2.5}})
			r.put("time_entry", "e-1", map[string]any{"task_id": "t-call", "started_at": ms("2026-11-01 10:00"), "ended_at": ms("2026-11-01 11:20"), "deleted_at": nil})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [ ] Water the plants ⏳ 2026-11-04 [[Garden]] [mood:: calm]")
			r.replace("Home.md", "[tracked:: 1h20m]", "[tracked:: 5h]")
			r.sync(vxOpts{name: "edited"})
			r.sync(vxOpts{name: "idle"})
		}},
	{name: "labels", desc: "tags match labels by slug, a label renamed in the app still matches the file's old tag, an unknown tag creates a label",
		run: func(r *vxRec) {
			r.put("label", "l-errand", map[string]any{"name": "Errand", "color": "#64748b", "position": 1000, "deleted_at": nil})
			r.put("label", "l-deep", map[string]any{"name": "Deep Work", "color": "#64748b", "position": 2000, "deleted_at": nil})
			r.task("t-a", "Shop", "", map[string]any{"labels": []string{"l-errand"}})
			r.task("t-b", "Write", "", map[string]any{"labels": []string{"l-deep"}, "position": 2000})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.put("label", "l-errand", map[string]any{"name": "Errands"})
			r.replace("Inbox.md", "- [ ] Shop #errand", "- [ ] Shop #errand #new-tag #Deep-Work")
			r.sync(vxOpts{name: "tags"})
		}},
	{name: "inbox-to-project", desc: "a line moved from the Inbox into a project file moves its task; blank lines and CRLF line ends are read as the vault writes them",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			line := ""
			for _, l := range strings.Split(r.read("Inbox.md"), "\n") {
				if strings.Contains(l, "Buy stamps") {
					line = l
				}
			}
			r.replace("Inbox.md", line+"\n", "")
			r.write("Home.md", strings.ReplaceAll(r.read("Home.md")+line+"\n", "\n", "\r\n"))
			r.sync(vxOpts{name: "moved"})
		}},
	{name: "limits", desc: "a file over the task-line limit and a note over 64 KB stop the sync before anything is written or sent",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.write("Big.md", strings.Repeat("- [ ] x\n", MaxFileLines+1))
			r.sync(vxOpts{name: "too many lines"})
			r.remove("Big.md")
			r.replace("Home.md", "- [ ] Pay rent 🆔 t-rent", "- [ ] Pay rent 🆔 t-rent\n  "+strings.Repeat("a", MaxNoteBytes+1))
			r.sync(vxOpts{name: "note too long"})
		}},
	{name: "read-only-and-dry-run", desc: "a read-only sync writes the app's changes and pushes nothing, keeping the file's edits pending; a dry run changes nothing",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "Pay rent", "Pay the rent")
			r.task("t-new", "From the app", "", map[string]any{"position": 2000})
			r.sync(vxOpts{name: "dry run", dryRun: true})
			r.sync(vxOpts{name: "read-only", readOnly: true})
			r.sync(vxOpts{name: "pending edit pushed"})
		}},
	{name: "generation", desc: "after the server is restored from a backup the vault pulls from zero and sends again what it knew",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors", generation: "g1"})
			r.sync(vxOpts{name: "restored", generation: "g2", reset: true})
		}},
	{name: "encrypted", desc: "an encrypted account: content is opened in the files and sealed when sent, a value that does not open is the placeholder and never sent, a shared project is never sealed",
		setup: func(c *vxCase) { c.Encrypted = true; c.Shared = []string{"p-shared"} },
		run: func(r *vxRec) {
			var c fakeCrypter
			seal := func(entity, id, pt string) string { s, _ := c.Seal(entity, id, "", pt); return s }
			r.project("p-home", seal("project", "p-home", "Home"), nil)
			r.project("p-shared", "Shared", map[string]any{"position": 2000})
			r.task("t-pass", seal("task", "t-pass", "Renew passport"), "p-home", map[string]any{"description": seal("task", "t-pass", "Bring photos")})
			r.task("t-bad", seal("task", "other", "Wrong binding"), "p-home", map[string]any{"position": 2000})
			r.task("t-ours", "Shared task", "p-shared", nil)
			r.put("label", "l-x", map[string]any{"name": seal("label", "l-x", "Errand"), "position": 1000, "deleted_at": nil, "color": "#64748b"})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "Renew passport", "Renew passports #errand")
			r.replace("Home.md", "Encrypted item 🆔 t-bad", "Encrypted item 🔺 🆔 t-bad")
			r.replace("Shared.md", "Shared task", "Shared task edited")
			r.write("Home.md", r.read("Home.md")+"- [ ] New secret\n")
			r.sync(vxOpts{name: "edits"})
		}},
	{name: "owner-refused", desc: "a folder another installation owns is refused before any request, with its lease running and after it ended",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init by the laptop", init: true, device: "vault:vectors", owner: vxLaptop})
			r.replace("Home.md", "Pay rent", "Pay the rent")
			r.sync(vxOpts{name: "the phone is refused, lease running", owner: vxPhone})
			r.sync(vxOpts{name: "the phone is refused, lease ended", owner: vxPhone, advance: 10 * time.Minute})
			r.sync(vxOpts{name: "the laptop syncs and renews", owner: vxLaptop})
		}},
	{name: "owner-older-state", desc: "a state written before ownership is owned by the first installation that syncs it",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init without an owner", init: true, device: "vault:vectors"})
			r.sync(vxOpts{name: "the phone takes it", owner: vxPhone})
			r.sync(vxOpts{name: "the laptop is refused", owner: vxLaptop})
		}},
	{name: "take-over", desc: "taking over starts a new vault device: lines that differ from the server go to the conflict file, new lines are created once, nothing is trashed",
		run: func(r *vxRec) {
			home(r)
			r.sync(vxOpts{name: "init by the laptop", init: true, device: "vault:vectors", owner: vxLaptop})
			r.replace("Home.md", "Pay rent", "Pay the rent")
			r.replace("Home.md", "- [ ] Water the plants", "- [x] Water the plants")
			r.write("Home.md", r.read("Home.md")+"- [ ] Buy bulbs\n")
			r.put("task", "t-rent", map[string]any{"title": "Pay rent in cash"})
			r.put("task", "t-call", map[string]any{"deleted_at": ms("2026-11-02 09:00")})
			r.task("t-later", "Added on the server", "p-home", map[string]any{"position": 500})
			r.sync(vxOpts{name: "the phone takes over", owner: vxPhone, takeOver: true, device: "vault:phone"})
			r.sync(vxOpts{name: "idle", owner: vxPhone})
			r.sync(vxOpts{name: "the laptop is refused", owner: vxLaptop})
		}},
	{name: "icloud-placeholder", desc: "a file iCloud has not downloaded yet is skipped and its tasks are untouched; once it arrives its edits merge",
		run: func(r *vxRec) {
			home(r)
			r.project("p-work", "Work", map[string]any{"position": 2000})
			r.task("t-report", "Write the report", "p-work", nil)
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			work := r.read("Work.md")
			r.remove("Work.md")
			r.write(".Work.md.icloud", "placeholder")
			r.task("t-slides", "Make slides", "p-work", map[string]any{"position": 2000})
			r.sync(vxOpts{name: "not downloaded"})
			r.remove(".Work.md.icloud")
			r.write("Work.md", strings.Replace(work, "Write the report", "Write the annual report", 1))
			r.sync(vxOpts{name: "downloaded with an edit"})
		}},
	{name: "time-zone", desc: "completion dates and conflict times are the machine's local dates",
		setup: func(c *vxCase) { c.Loc = "Pacific/Auckland" },
		run: func(r *vxRec) {
			home(r)
			r.put("task", "t-rent", map[string]any{"completed_at": ms("2026-11-01 20:00")})
			r.sync(vxOpts{name: "init", init: true, device: "vault:vectors"})
			r.replace("Home.md", "- [ ] Water the plants", "- [x] Water the plants ✅ 2026-11-03")
			r.replace("Home.md", "Call the plumber", "Call the gas man")
			r.put("task", "t-call", map[string]any{"title": "Call the electrician"})
			r.write("Home.md", r.read("Home.md")+"- [ ] Created ➕ 2026-10-30\n")
			r.sync(vxOpts{name: "edits"})
		}},
}
