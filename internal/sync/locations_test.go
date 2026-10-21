package sync

import (
	"context"
	"testing"
)

// task-locations "Task location": two offline devices set different locations;
// every device ends with one of them, whole, never a mix of members.
func TestLocationConvergesWhole(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("c1", "task", "t1", "title", `"Post the parcel"`, 100, "A"),
		op("c2", "task", "t1", "created_at", `100`, 100, "A"),
	)
	a := op("a1", "task", "t1", "location", `{"name":"Post office","lat":45.46,"lon":9.19}`, 300, "A")
	b := op("b1", "task", "t1", "location", `{"address":"Via Roma 1, Torino"}`, 200, "B")
	mustApply(t, s, "u1", a)
	mustApply(t, s, "u1", b) // older write arriving later loses as a whole
	e, err := s.Get(ctx, "u1", "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if got := string(e["location"]); got != `{"name":"Post office","lat":45.46,"lon":9.19}` {
		t.Fatalf("location = %s", got)
	}
	// Another field written later leaves the location alone.
	mustApply(t, s, "u1", op("c3", "task", "t1", "title", `"Post the parcels"`, 400, "B"))
	e, _ = s.Get(ctx, "u1", "task", "t1")
	if string(e["location"]) == "" || string(e["location"]) == "null" {
		t.Fatalf("location lost: %s", e["location"])
	}
	// Cleared with null.
	mustApply(t, s, "u1", op("c4", "task", "t1", "location", `null`, 500, "A"))
	e, _ = s.Get(ctx, "u1", "task", "t1")
	if string(e["location"]) != "null" {
		t.Fatalf("cleared location = %s", e["location"])
	}
}

// "Location validation": an invalid value is refused and changes nothing.
func TestLocationValidationRefuses(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1", op("c1", "task", "t1", "location", `{"name":"Home"}`, 100, "A"))
	for i, v := range []string{`{"lat":45.46}`, `{"lat":91,"lon":9}`, `{}`, `{"name":"Home","zoom":12}`} {
		res, err := s.Apply(ctx, "u1", []Op{op("bad"+string(rune('a'+i)), "task", "t1", "location", v, int64(200+i), "A")})
		if err == nil && len(res.Rejected) == 0 {
			t.Fatalf("%s was accepted", v)
		}
	}
	e, _ := s.Get(ctx, "u1", "task", "t1")
	if string(e["location"]) != `{"name":"Home"}` {
		t.Fatalf("location changed: %s", e["location"])
	}
}

// "Places": a place is personal and converges per field; a concurrent rename
// and move both survive.
func TestPlaceIsPersonalAndConvergesPerField(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("p1", "place", "pl1", "name", `"Gym"`, 100, "A"),
		op("p2", "place", "pl1", "geo", `{"lat":45.1,"lon":9.1}`, 100, "A"),
		op("p3", "place", "pl1", "created_at", `100`, 100, "A"),
	)
	mustApply(t, s, "u1", op("p4", "place", "pl1", "name", `"Gym (new)"`, 200, "A"))
	mustApply(t, s, "u1", op("p5", "place", "pl1", "geo", `{"lat":45.2,"lon":9.2}`, 210, "B"))
	e, err := s.Get(ctx, "u1", "place", "pl1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["name"]) != `"Gym (new)"` || string(e["geo"]) != `{"lat":45.2,"lon":9.2}` {
		t.Fatalf("place = %s %s", e["name"], e["geo"])
	}
	// Another account never sees it.
	if other, err := s.List(ctx, "u2", "place", true); err != nil || len(other) != 0 {
		t.Fatalf("u2 sees %d places, %v", len(other), err)
	}
}
