package recurrence10

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestReadable(t *testing.T) {
	for _, rule := range []string{"every 2 weeks", "every saturday", "every monday, friday for 3 times", "every 2nd tuesday", "every 3 days after completion"} {
		if !Readable(rule) {
			t.Errorf("1.0 reads %q", rule)
		}
	}
	for _, rule := range []string{"every 2 weeks on saturday", "every week on monday", "every 3 weeks on monday, friday"} {
		if Readable(rule) {
			t.Errorf("1.0 does not read %q", rule)
		}
	}
}

// TestNotLinked: the frozen grammar is test data, not code a binary runs.
func TestNotLinked(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	for _, cmd := range []string{"../../../cmd/opentodo", "../../../cmd/ot"} {
		out, err := exec.Command(gobin, "list", "-deps", cmd).CombinedOutput()
		if err != nil {
			t.Fatalf("go list %s: %v\n%s", cmd, err, out)
		}
		if bytes.Contains(out, []byte("internal/recurrence/recurrence10")) {
			t.Fatalf("%s links internal/recurrence/recurrence10", cmd)
		}
	}
}
