package importer

import (
	"fmt"
	"testing"
)

// #1659: a project completed (status 3) or canceled (status 2) in Things came in as
// an open project with a warning. It is archived instead, as OmniFocus's done and
// dropped projects are; an open one (status 0) stays active.
func TestThingsFinishedProjectsAreArchived(t *testing.T) {
	for status, archived := range map[int]bool{0: false, 2: true, 3: true} {
		t.Run(fmt.Sprint("status ", status), func(t *testing.T) {
			data := thingsVariant(t, fmt.Sprintf("UPDATE TMTask SET status = %d WHERE type = 1", status))
			p, err := parseWith(t, data, nil)
			if err != nil {
				t.Fatal(err)
			}
			projects := 0
			for _, r := range p.Rows {
				if r.Kind != KindProject {
					continue
				}
				projects++
				if r.Archived != archived {
					t.Errorf("%s: archived %v, want %v", r.Title, r.Archived, archived)
				}
				want := 0
				if archived {
					want = 1
				}
				if len(r.Warnings) != want || (archived && r.Warnings[0] != "finished project imported as an archived project") {
					t.Errorf("%s: warnings %q", r.Title, r.Warnings)
				}
			}
			if projects == 0 {
				t.Fatal("the fixture has no project")
			}
		})
	}
}
