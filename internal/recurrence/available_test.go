package recurrence

import (
	"encoding/json"
	"testing"
)

func TestAvailable(t *testing.T) {
	for _, c := range []struct {
		v    string
		want bool
	}{{"", true}, {"null", true}, {" null ", true}, {"1760000000000", false}} {
		if got := Available(json.RawMessage(c.v)); got != c.want {
			t.Errorf("Available(%q) = %v, want %v", c.v, got, c.want)
		}
	}
}
