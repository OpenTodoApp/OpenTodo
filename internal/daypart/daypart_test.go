package daypart

import (
	"encoding/json"
	"testing"
)

func TestFieldsNeverEveningWithPart(t *testing.T) {
	want := map[string][2]string{
		Morning: {`"morning"`, "false"}, Afternoon: {`"afternoon"`, "false"},
		Evening: {"null", "true"}, None: {"null", "false"},
	}
	for part, w := range want {
		f := Fields(part)
		if string(f["day_part"]) != w[0] || string(f["evening"]) != w[1] {
			t.Errorf("%q: %s/%s, want %s/%s", part, f["day_part"], f["evening"], w[0], w[1])
		}
		if string(f["evening"]) == "true" && string(f["day_part"]) != "null" {
			t.Errorf("%q writes evening with a part", part)
		}
		// Reading the pair back gives the part.
		if got := OfRow(f); got != part {
			t.Errorf("OfRow(Fields(%q)) = %q", part, got)
		}
	}
}

// An older client turns This Evening on over Morning: it reads as Evening, and
// turning it off again shows Morning (design D2).
func TestOldClientEvening(t *testing.T) {
	row := map[string]json.RawMessage{"day_part": json.RawMessage(`"morning"`), "evening": json.RawMessage("true")}
	if OfRow(row) != Evening {
		t.Fatalf("evening over morning reads %q", OfRow(row))
	}
	row["evening"] = json.RawMessage("false")
	if OfRow(row) != Morning {
		t.Fatalf("after the old client clears evening: %q", OfRow(row))
	}
	if Of("night", false) != None {
		t.Fatal("an unknown stored value should read as no part")
	}
}

func TestParse(t *testing.T) {
	for in, want := range map[string]string{"morning": Morning, "Afternoon": Afternoon, "evening": Evening, "none": None, "": None} {
		if got, ok := Parse(in); !ok || got != want {
			t.Errorf("Parse(%q) = %q, %v", in, got, ok)
		}
	}
	if _, ok := Parse("night"); ok {
		t.Fatal("night accepted")
	}
}
