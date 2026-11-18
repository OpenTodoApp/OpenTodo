package sync

import "testing"

// invalid-op-ends D1: an op refused as invalid before the batch gets its field's
// server value back like any refused op, but never for a request limited to
// workspaces, whose reach the op was not checked against.
func TestInvalidRefusedOpsRestoreOnlyWithoutAReach(t *testing.T) {
	f := newSharing(t)
	bad := f.op("task", "t1", "title", `"x"`)
	bad.Device = "A"
	restored := func(res ApplyResult) bool {
		for _, o := range res.Restore {
			if o.EntityID == "t1" && o.Field == "title" && string(o.Value) == `"Milk"` {
				return true
			}
		}
		return false
	}
	res, err := f.s.Apply(WithInvalidRefused(f.ctx, []Op{bad}), "alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !restored(res) {
		t.Fatalf("without a reach the stored title should come back: %+v", res.Restore)
	}
	res, err = f.s.Apply(WithReach(WithInvalidRefused(f.ctx, []Op{bad}), []string{"somewhere-else"}), "alice", nil)
	if err != nil {
		t.Fatal(err)
	}
	if restored(res) {
		t.Fatalf("a request limited to workspaces got a value back: %+v", res.Restore)
	}
}
