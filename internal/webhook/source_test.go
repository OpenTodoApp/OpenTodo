package webhook

import "testing"

// The server's device carries a per-process suffix (sync-convergence); webhooks
// keep reporting it as source "server".
func TestSourceForServerDevice(t *testing.T) {
	for origin, want := range map[string]string{
		"server": "server", "server:1a2b3c4d": "server", "import": "import", "caldav": "caldav", "phone": "device", "serverless": "device",
	} {
		if got := SourceFor(origin); got != want {
			t.Errorf("SourceFor(%q) = %q, want %q", origin, got, want)
		}
	}
}
