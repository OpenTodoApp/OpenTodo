package importer

import (
	"strings"
	"testing"
	"unicode/utf16"
)

const ofHeader2 = "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes\r\n"

func TestOmniFocusHierarchyFlagsAndDates(t *testing.T) {
	file := "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags\r\n" +
		"2,Project,Move house,active,,,,,,,0,,\r\n" +
		"2.1,Action,Pack,,Move house,,,,,,0,,\r\n" +
		"2.1.1,Action,Buy boxes,,Move house,Errands,,next tuesday,,30m,1,,\"Errands, Phone\"\r\n"
	p, err := parseWith(t, []byte(file), nil)
	if err != nil || p.Format != omnifocusFormat {
		t.Fatalf("%v %v", p, err)
	}
	if len(p.Rows) != 3 {
		t.Fatalf("rows = %+v", p.Rows)
	}
	project, pack, boxes := p.Rows[0], p.Rows[1], p.Rows[2]
	if project.Kind != KindProject || project.Title != "Move house" {
		t.Fatalf("project = %+v", project)
	}
	if pack.ProjectSourceID != project.SourceID || pack.ParentSourceID != "" {
		t.Fatalf("Pack = %+v", pack)
	}
	if boxes.ProjectSourceID != project.SourceID || boxes.ParentSourceID != pack.SourceID {
		t.Fatalf("Buy boxes = %+v", boxes)
	}
	if boxes.Priority != 1 || strings.Join(boxes.Labels, "|") != "Errands|Phone" || boxes.EstimateMinutes != 30 {
		t.Fatalf("flag and tags = %+v", boxes)
	}
	if boxes.Due != nil || !strings.Contains(strings.Join(boxes.Warnings, "|"), `due date "next tuesday" not understood`) {
		t.Fatalf("unreadable date = %+v", boxes)
	}
	found := false
	for _, n := range p.Notes {
		found = found || strings.Contains(n, "no repeat rules")
	}
	if !found {
		t.Fatalf("notes = %v", p.Notes)
	}
}

// The same item keeps its source id in a later export where it moved in the
// outline (Task IDs are positions), so a second import skips it.
func TestOmniFocusStableSourceIDs(t *testing.T) {
	a := ofHeader2 + "1,Project,Home,active,,,,,,,0,\r\n1.1,Action,Fix tap,,Home,,,,,,0,\r\n"
	b := ofHeader2 + "1,Project,Work,active,,,,,,,0,\r\n2,Project,Home,active,,,,,,,0,\r\n2.1,Action,New,,Home,,,,,,0,\r\n2.2,Action,Fix tap,,Home,,,,,,0,\r\n"
	pa, err := parseWith(t, []byte(a), nil)
	if err != nil {
		t.Fatal(err)
	}
	pb, err := parseWith(t, []byte(b), nil)
	if err != nil {
		t.Fatal(err)
	}
	if pa.Rows[1].SourceID != pb.Rows[3].SourceID || pa.Rows[0].SourceID != pb.Rows[1].SourceID {
		t.Fatalf("ids moved: %s %s / %s %s", pa.Rows[0].SourceID, pa.Rows[1].SourceID, pb.Rows[1].SourceID, pb.Rows[3].SourceID)
	}
}

// Both header variants and the UTF-16 export are recognised; Asana's CSV,
// which also starts with Task ID, is not.
func TestOmniFocusDetect(t *testing.T) {
	utf := utf16.Encode([]rune(ofHeader2 + "1,Project,Home,active,,,,,,,0,\r\n"))
	le := []byte{0xFF, 0xFE}
	for _, u := range utf {
		le = append(le, byte(u), byte(u>>8))
	}
	for name, data := range map[string][]byte{
		"context": []byte(ofHeader2),
		"tags":    []byte("Task ID,Type,Name,Status,Project,Context,Start Date,Planned Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags\n"),
		"utf-16":  le,
	} {
		if !(omnifocusProfile{}).Detect(data) {
			t.Errorf("%s: not detected", name)
		}
	}
	p, err := parseWith(t, le, nil)
	if err != nil || p.Format != omnifocusFormat || len(p.Rows) != 1 || p.Rows[0].Title != "Home" {
		t.Fatalf("utf-16: %+v %v", p, err)
	}
	asana := "Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Due Date,Parent task\n1,2026-01-01,,,x,,,,\n"
	if (omnifocusProfile{}).Detect([]byte(asana)) {
		t.Fatal("Asana CSV detected as OmniFocus")
	}
}
