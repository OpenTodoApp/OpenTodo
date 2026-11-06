package sync

import (
	"encoding/json"
	"os"
	"testing"
)

// The shared vectors of the client's clock (docs/contracts.md): the property
// test's model of web/src/lib/hlc.ts (propDevice in
// convergence_property_test.go) takes the same steps as hlc.ts in
// web/src/lib/hlc.test.ts and must land on the same timestamps, last stamp and
// offset; Wins must agree with the client's wins on the same comparisons.
func TestHLCVectors(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../web/src/lib/hlc.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Clocks []struct {
			Name  string `json:"name"`
			Skew  int64  `json:"skew"`
			Steps []struct {
				Do         string `json:"do"`
				At         *int64 `json:"at"`
				TS         int64  `json:"ts"`
				Server     int64  `json:"server"`
				Skew       *int64 `json:"skew"`
				Want       *int64 `json:"want"`
				WantLast   *int64 `json:"want_last"`
				WantOffset *int64 `json:"want_offset"`
			} `json:"steps"`
		} `json:"clocks"`
		Wins []struct {
			TS       int64  `json:"ts"`
			Device   string `json:"device"`
			Existing *struct {
				TS     int64  `json:"ts"`
				Device string `json:"device"`
			} `json:"existing"`
			Want bool `json:"want"`
		} `json:"wins"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Clocks) == 0 || len(v.Wins) == 0 {
		t.Fatal("no vectors")
	}
	for _, c := range v.Clocks {
		d := &propDevice{id: "D", skew: c.Skew}
		for i, s := range c.Steps {
			if s.WantLast == nil || s.WantOffset == nil || (s.Do == "stamp" && s.Want == nil) {
				t.Fatalf("%s: step %d has no want values (regenerate the vectors)", c.Name, i)
			}
			if s.Skew != nil {
				d.skew = *s.Skew
			}
			var at int64
			if s.At != nil {
				at = *s.At
			}
			switch s.Do {
			case "stamp":
				if got := d.hlcNow(at); got != *s.Want {
					t.Errorf("%s: step %d stamped %d, want %d", c.Name, i, got, *s.Want)
				}
			case "receive":
				d.receive(s.TS)
			case "observe":
				d.observeServerTime(at, s.Server)
			case "refused":
				d.clockRefused(at, s.Server)
			default:
				t.Fatalf("%s: step %d: unknown step %q", c.Name, i, s.Do)
			}
			if d.last != *s.WantLast || d.offset != *s.WantOffset {
				t.Errorf("%s: step %d (%s): last %d offset %d, want %d and %d", c.Name, i, s.Do, d.last, d.offset, *s.WantLast, *s.WantOffset)
			}
		}
	}
	for _, c := range v.Wins {
		got := true
		if c.Existing != nil {
			got = Wins(c.TS, c.Device, c.Existing.TS, c.Existing.Device)
		}
		if got != c.Want {
			t.Errorf("Wins(%d, %q, %+v) = %v, want %v", c.TS, c.Device, c.Existing, got, c.Want)
		}
	}
}
