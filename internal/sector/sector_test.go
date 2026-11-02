package sector

import (
	"encoding/json"
	"maps"
	"os"
	"testing"
)

type vectors struct {
	Valid []struct {
		Value string `json:"value"`
		Valid bool   `json:"valid"`
	} `json:"valid"`
	Cases []struct {
		Today     string            `json:"today"`
		WeekStart int               `json:"week_start"`
		Current   map[string]string `json:"current"`
		Sectors   []struct {
			Sector  string  `json:"sector"`
			Name    *string `json:"name"`
			Carried bool    `json:"carried"`
			Group   *string `json:"group"`
		} `json:"sectors"`
	} `json:"cases"`
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// TestVectors runs the vectors web/src/lib/sectors.test.ts runs.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/sectors.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Valid {
		if Valid(c.Value) != c.Valid {
			t.Errorf("Valid(%q) = %v, want %v", c.Value, !c.Valid, c.Valid)
		}
	}
	for _, c := range v.Cases {
		if got := Current(c.Today, c.WeekStart); !maps.Equal(got, c.Current) {
			t.Errorf("Current(%s, %d) = %v, want %v", c.Today, c.WeekStart, got, c.Current)
		}
		for w, s := range c.Current {
			if got := Resolve(w, c.Today, c.WeekStart); got != s {
				t.Errorf("Resolve(%s, %s, %d) = %q, want %q", w, c.Today, c.WeekStart, got, s)
			}
		}
		for _, s := range c.Sectors {
			if got := Relative(s.Sector, c.Today, c.WeekStart); got != str(s.Name) {
				t.Errorf("Relative(%q, %s, %d) = %q, want %q", s.Sector, c.Today, c.WeekStart, got, str(s.Name))
			}
			if got := Carried(s.Sector, c.Today, c.WeekStart); got != s.Carried {
				t.Errorf("Carried(%q, %s, %d) = %v", s.Sector, c.Today, c.WeekStart, got)
			}
			if got := Group(s.Sector, c.Today, c.WeekStart); got != str(s.Group) {
				t.Errorf("Group(%q, %s, %d) = %q, want %q", s.Sector, c.Today, c.WeekStart, got, str(s.Group))
			}
		}
	}
}

func TestCheckAndResolveSpellings(t *testing.T) {
	if Check("") != nil || Check("2026-W53") != nil || Check("2027-W53") == nil || Check("this week") == nil {
		t.Fatal("Check")
	}
	for _, w := range []string{"next week", "next-week", "NEXT_WEEK"} {
		if got := Resolve(w, "2026-10-28", 1); got != "2026-W45" {
			t.Errorf("Resolve(%q) = %q", w, got)
		}
	}
	p, _ := Parse("2026-Q4")
	s, e := p.Range()
	if s.Format("2006-01-02") != "2026-10-01" || e.Format("2006-01-02") != "2026-12-31" {
		t.Errorf("Range = %v %v", s, e)
	}
}
