package httpapi

import (
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/assistant"
)

// assistant-disclosure-accuracy: every entry the disclosure lists is in the
// web app's list, so the catalogues translate it and the consent shows it in
// the reader's language.
func TestDisclosureFieldsAreTranslatable(t *testing.T) {
	src, err := os.ReadFile("../../web/src/lib/assistantDisclosure.ts")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range slices.Concat(consentFields, deviceConsentFields) {
		if !strings.Contains(string(src), "msg("+strconv.Quote(f)+")") && !strings.Contains(string(src), "msg('"+f+"')") {
			t.Errorf("%q is not in web/src/lib/assistantDisclosure.ts", f)
		}
	}
}

// assistant-disclosure-accuracy: the disclosure names what each read tool of
// the server's assistant returns. A new read tool must be added here, with the
// disclosure entry that covers it, before it reaches a provider unannounced.
func TestDisclosureCoversEveryReadTool(t *testing.T) {
	covers := map[string]string{
		"list_projects": "workspace, project, section and label names, and project descriptions",
		"list_tasks":    "task titles and descriptions", "get_task": "custom fields, task locations and the links tasks came from",
		"search_tasks": "task titles and descriptions", "today_summary": "task titles and descriptions", "list_slots": "task titles and descriptions",
		"list_icons": "", "list_notes": "notes", "search_notes": "notes", "get_note": "notes",
		"list_routines": "your routines and calendar frames", "get_routine": "your routines and calendar frames",
		"list_routine_runs": "your routines and calendar frames", "get_routine_run": "your routines and calendar frames",
		"list_frames": "your routines and calendar frames", "list_workspaces": "names of members and groups of shared projects and workspaces",
		"list_time_entries": "tracked time and its notes",
	}
	reg := agenttools.New(nil, agenttools.Options{})
	reads := 0
	for _, d := range reg.Definitions(assistant.Caller("u")) {
		if d.Kind != agenttools.KindRead {
			continue
		}
		reads++
		entry, ok := covers[d.Name]
		if !ok {
			t.Errorf("read tool %s is not covered by the disclosure (consentFields)", d.Name)
			continue
		}
		if entry != "" && !slices.Contains(consentFields, entry) {
			t.Errorf("%s: %q is not in consentFields", d.Name, entry)
		}
	}
	if reads < len(covers)-2 {
		t.Fatalf("only %d read tools listed", reads)
	}
}
