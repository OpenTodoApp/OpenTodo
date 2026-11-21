package sync

import (
	"encoding/json"
	"os"
	"testing"
)

type awayVectors struct {
	Parse []struct {
		Value, From, To string
		Valid, Quiet    bool
	}
	Holds []struct {
		Value, Today string
		Away, Quiet  bool
	}
}

func TestAwayVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/away.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v awayVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Parse {
		a, ok := ParseAway(c.Value)
		if ok != c.Valid || (ok && (a.From != c.From || a.To != c.To || a.Quiet != c.Quiet)) {
			t.Errorf("ParseAway(%q) = %+v, %v; want %+v", c.Value, a, ok, c)
		}
		if ok && a.String() != c.Value {
			t.Errorf("String() = %q, want %q", a.String(), c.Value)
		}
	}
	for _, c := range v.Holds {
		a, ok := ParseAway(c.Value)
		if got := ok && a.Holds(c.Today); got != c.Away {
			t.Errorf("%q holds on %s = %v, want %v", c.Value, c.Today, got, c.Away)
		}
		if got := QuietOn(c.Value, c.Today); got != c.Quiet {
			t.Errorf("QuietOn(%q, %s) = %v, want %v", c.Value, c.Today, got, c.Quiet)
		}
	}
}
