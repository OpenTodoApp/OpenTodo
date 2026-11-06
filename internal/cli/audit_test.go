package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestAuditVerify (audit-hash-chain): `ot audit verify` reports an intact chain
// and exits 1 with audit_chain_broken after an event was edited in the
// database.
func TestAuditVerify(t *testing.T) {
	h := newHarness(t)
	h.login()
	out := h.mustRun("audit", "verify")
	if !strings.Contains(out, "Audit chain intact") || !strings.Contains(out, "Head: ") {
		t.Fatalf("intact = %q", out)
	}
	js := h.mustRun("audit", "verify", "--json")
	mustMatch(t, loadSchemas(t), "audit verify", js, loadSchemas(t)["audit_verification"])
	var v auditVerification
	if err := json.Unmarshal([]byte(js), &v); err != nil || !v.OK || v.Checked == 0 || len(v.Head.Hash) != 64 {
		t.Fatalf("verify --json = %q (%v)", js, err)
	}

	if _, err := h.db.Exec("UPDATE audit_events SET outcome = 'failure' WHERE id = (SELECT MIN(id) FROM audit_events)"); err != nil {
		t.Fatal(err)
	}
	code, _, errb := h.run("audit", "verify")
	if code != ExitServer || !strings.Contains(errb, "hash chain is broken at event") {
		t.Fatalf("broken: exit %d %q", code, errb)
	}
	code, stdout, _ := h.run("audit", "verify", "--json")
	if code != ExitServer || !strings.Contains(stdout, `"reason":"mismatch"`) {
		t.Fatalf("broken --json: exit %d %q", code, stdout)
	}
}
