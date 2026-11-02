package sync

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type rotationVectors struct {
	Next []struct {
		Name     string   `json:"name"`
		Rotation []string `json:"rotation"`
		Current  string   `json:"current"`
		Members  []string `json:"members"`
		Next     string   `json:"next"`
	} `json:"next"`
	Valid []struct {
		Name     string   `json:"name"`
		Rotation []string `json:"rotation"`
		Valid    bool     `json:"valid"`
	} `json:"valid"`
}

// TestRotationVectors runs the vectors web/src/lib/rotation.test.ts runs too
// (chore-rotation D2).
func TestRotationVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/rotation.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v rotationVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Next) == 0 || len(v.Valid) == 0 {
		t.Fatal("no vectors")
	}
	for _, c := range v.Next {
		got := NextAssignee(c.Rotation, c.Current, func(id string) bool { return slices.Contains(c.Members, id) })
		if got != c.Next {
			t.Errorf("%s: next = %q, want %q", c.Name, got, c.Next)
		}
	}
	for _, c := range v.Valid {
		if got := ValidRotation(c.Rotation); got != c.Valid {
			t.Errorf("%s: valid = %v, want %v", c.Name, got, c.Valid)
		}
	}
}
