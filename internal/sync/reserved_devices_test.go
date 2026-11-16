package sync

import (
	"encoding/json"
	"os"
	"testing"
)

// The client's copy of ReservedDevice (web/src/lib/sync.ts reservedDevice) reads the
// same vectors (reseed-reserved-devices D1).
func TestReservedDeviceVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/reserved_devices.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct{ Reserved, Allowed []string }
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	for _, d := range v.Reserved {
		if !ReservedDevice(d) {
			t.Errorf("ReservedDevice(%q) = false, want true", d)
		}
	}
	for _, d := range v.Allowed {
		if ReservedDevice(d) {
			t.Errorf("ReservedDevice(%q) = true, want false", d)
		}
	}
}
