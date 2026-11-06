package importer

import (
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// fuzzState is an account with a project, a label, a section and an open task,
// so planned rows meet existing names, ids and fingerprints.
func fuzzState() *State {
	return &State{
		UserID:   "user-1",
		Projects: entities(`{"id":"p1","name":"Work","deleted_at":null}`, `{"id":"p2","name":"Old","deleted_at":1}`),
		Labels:   entities(`{"id":"l1","name":"home","deleted_at":null}`),
		Sections: entities(`{"id":"s1","project_id":"p1","name":"Doing","deleted_at":null}`),
		Tasks:    entities(`{"id":"t1","title":"Offer","project_id":null,"due":{"date":"2026-11-03"},"completed_at":null,"deleted_at":null}`),
	}
}

// FuzzBuildPlan reads a file and plans it against an account, as a preview
// and a job do. Whatever the file, planning must not panic, stays within the
// preview limit, accounts for every row, and plans only changes the op log
// accepts: a known entity, a valid id, and fields that pass sync.Validate, few
// enough to travel in one batch.
func FuzzBuildPlan(f *testing.F) {
	for _, b := range importSeeds(f) {
		f.Add(b, uint8(255), uint8(0))
	}
	f.Add([]byte(ownExportWithEntries()), uint8(255), uint8(0))
	f.Add([]byte(ownExportWithEntries()), uint8(255), uint8(0b11000))
	f.Add([]byte("title,project,section,labels,due\nOffer,,,home,2026-11-03\nx,Work,Doing,\"a,b\",tomorrow\n"), uint8(255), uint8(0b01101))
	names := ProfileNames()
	sections := []string{"section", "label", "ignore"}
	f.Fuzz(func(t *testing.T, data []byte, format, mode uint8) {
		opts := Options{Sections: sections[int(mode&3)%3]}
		if mode&4 != 0 {
			opts.Duplicates = "import"
		}
		if mode&8 != 0 {
			opts.Existing = "overwrite"
		}
		if mode&16 != 0 {
			opts.TargetProject = "p1"
		}
		if int(format) < len(names) {
			opts.Format = names[format]
		}
		if err := opts.Normalize(); err != nil {
			t.Fatal(err)
		}
		opts.exportedAt, opts.maxBytes = time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC), 4<<20
		parsed, err := Parse(data, opts)
		if err != nil {
			return
		}
		plan := BuildPlan(parsed, opts, fuzzState(), time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC), counter())
		checkPlan(t, parsed, plan)
	})
}

func checkPlan(t *testing.T, parsed *Parsed, plan *Plan) {
	t.Helper()
	tot := plan.Totals
	if tot.Rows != len(parsed.Rows) || tot.Create+tot.Update+tot.Skip+tot.Error > tot.Rows {
		t.Fatalf("totals %+v for %d rows", tot, len(parsed.Rows))
	}
	if len(plan.Rows) > MaxPreviewRows || plan.Truncated != (len(parsed.Rows) > MaxPreviewRows) {
		t.Fatalf("%d preview rows (truncated %v) for %d rows", len(plan.Rows), plan.Truncated, len(parsed.Rows))
	}
	if len(plan.Errors()) != tot.Error || tot.Entities != len(plan.changes) {
		t.Fatalf("%d errors, %d changes for totals %+v", len(plan.Errors()), len(plan.changes), tot)
	}
	for _, c := range plan.changes {
		if len(c.fields) == 0 || len(c.fields) > opsync.MaxOpsPerRequest {
			t.Fatalf("%s %s: %d fields", c.entity, c.id, len(c.fields))
		}
		for _, fl := range c.fields {
			op := opsync.Op{ID: "fuzz", Entity: c.entity, EntityID: c.id, Field: fl.name, Value: fl.value, TS: 1, Device: Device}
			if err := opsync.Validate(op); err != nil {
				t.Fatalf("%s %s: field %s = %s: %v", c.entity, c.id, fl.name, fl.value, err)
			}
		}
	}
}
