package importer

import (
	"context"
	"testing"
)

// A job reads as finished only once the user can start the next import: by the
// time its final status is stored (and the summary sent), the slot is free.
func TestFinishedJobFreesTheSlotFirst(t *testing.T) {
	for _, tc := range []struct {
		name, data string
		opts       Options
		want       string
	}{
		{"done", "title\nOne\n", Options{}, StatusDone},
		{"failed", "title,due\nOne,not a date\n", Options{Errors: "abort"}, StatusFailed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			var stored string
			var startErr error
			h.svc.SetSummaryObserver(func(ctx context.Context, sum Summary) {
				j, err := h.svc.Job(ctx, h.uid, sum.JobID)
				if err != nil {
					t.Error(err)
					return
				}
				stored = j.Status
				if startErr = h.svc.acquire(h.uid, "next"); startErr == nil {
					h.svc.releaseJob(h.uid, "next")
				}
			})
			if j := h.run(tc.data, tc.opts); j.Status != tc.want {
				t.Fatalf("status = %q (%s), want %q", j.Status, j.Message, tc.want)
			}
			if stored != tc.want {
				t.Fatalf("stored status at summary = %q, want %q", stored, tc.want)
			}
			if startErr != nil {
				t.Fatalf("next import once the job read %q: %v", stored, startErr)
			}
		})
	}
}

// Freeing a finished job's slot never frees a newer job's.
func TestReleaseJobKeepsANewerJob(t *testing.T) {
	h := newHarness(t)
	if err := h.svc.acquire(h.uid, "newer"); err != nil {
		t.Fatal(err)
	}
	h.svc.releaseJob(h.uid, "older")
	if err := h.svc.acquire(h.uid, "third"); err == nil {
		t.Fatal("releasing an older job freed the newer job's slot")
	}
}
