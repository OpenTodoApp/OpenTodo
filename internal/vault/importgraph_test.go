package vault

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// TestServerDoesNotLinkVault: the vault is linked into `ot` only (design D11),
// as internal/e2ee/crypt is.
func TestServerDoesNotLinkVault(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	out, err := exec.Command(gobin, "list", "-deps", "../../cmd/opentodo").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	if bytes.Contains(out, []byte("internal/vault")) {
		t.Fatal("the server binary links internal/vault")
	}
	out, err = exec.Command(gobin, "list", "-deps", "../../cmd/ot").CombinedOutput()
	if err != nil {
		t.Fatalf("go list ot: %v\n%s", err, out)
	}
	if !bytes.Contains(out, []byte("internal/vault")) {
		t.Fatal("ot does not link internal/vault")
	}
}
