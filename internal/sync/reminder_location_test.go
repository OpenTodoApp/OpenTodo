package sync

import (
	"errors"
	"testing"
)

// TestValidateLocationReminderValues covers the location kinds and radius_m
// (OpenSpec change location-reminders, design D1) at the field level.
func TestValidateLocationReminderValues(t *testing.T) {
	for _, o := range []Op{
		op("l1", "reminder", "rm1", "kind", `"arrive"`, 1, "A"),
		op("l2", "reminder", "rm1", "kind", `"leave"`, 1, "A"),
		op("l3", "reminder", "rm1", "radius_m", `100`, 1, "A"),
		op("l4", "reminder", "rm1", "radius_m", `5000`, 1, "A"),
		op("l5", "reminder", "rm1", "radius_m", `null`, 1, "A"),
	} {
		if err := Validate(o); err != nil {
			t.Errorf("%s=%s rejected: %v", o.Field, o.Value, err)
		}
	}
	for _, o := range []Op{
		op("y1", "reminder", "rm1", "radius_m", `50`, 1, "A"),
		op("y2", "reminder", "rm1", "radius_m", `99`, 1, "A"),
		op("y3", "reminder", "rm1", "radius_m", `5001`, 1, "A"),
		op("y4", "reminder", "rm1", "radius_m", `20000`, 1, "A"),
		op("y5", "reminder", "rm1", "radius_m", `150.5`, 1, "A"),
		op("y6", "reminder", "rm1", "radius_m", `"150"`, 1, "A"),
		op("y7", "reminder", "rm1", "kind", `"nearby"`, 1, "A"),
	} {
		if err := Validate(o); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s=%s accepted, want ErrInvalidOp (got %v)", o.Field, o.Value, err)
		}
	}
}

// TestLocationReminderShape refuses every op that would mix a location kind
// with a firing time or an offset, or another kind with a radius, judged on
// the batch's result and the stored values (location-reminders D1).
func TestLocationReminderShape(t *testing.T) {
	cases := []struct {
		name    string
		stored  [][2]string // field, value applied first
		batch   [][2]string // field, value applied in one batch
		refused []string    // fields refused in the batch
	}{
		{name: "arrive with radius", batch: [][2]string{{"task_id", `"t1"`}, {"kind", `"arrive"`}, {"radius_m", `150`}}},
		{name: "radius before kind in the batch", batch: [][2]string{{"radius_m", `300`}, {"task_id", `"t1"`}, {"kind", `"leave"`}}},
		{name: "arrive with nulls", batch: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}, {"fire_at", `null`}, {"offset_minutes", `null`}}},
		{name: "relative with radius", batch: [][2]string{{"kind", `"relative"`}, {"radius_m", `150`}}, refused: []string{"kind", "radius_m"}},
		{name: "radius on a new reminder without kind", batch: [][2]string{{"task_id", `"t1"`}, {"radius_m", `150`}}, refused: []string{"radius_m"}},
		{name: "leave with fire_at", batch: [][2]string{{"kind", `"leave"`}, {"fire_at", `1791000000000`}}, refused: []string{"kind", "fire_at"}},
		{name: "arrive with offset", batch: [][2]string{{"kind", `"arrive"`}, {"offset_minutes", `-30`}}, refused: []string{"kind", "offset_minutes"}},
		{name: "fire_at on a stored arrive", stored: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}}, batch: [][2]string{{"fire_at", `1791000000000`}}, refused: []string{"fire_at"}},
		{name: "radius on a stored absolute", stored: [][2]string{{"kind", `"absolute"`}, {"fire_at", `1791000000000`}}, batch: [][2]string{{"radius_m", `200`}}, refused: []string{"radius_m"}},
		{name: "stored relative turned arrive keeps fire_at", stored: [][2]string{{"kind", `"relative"`}, {"offset_minutes", `0`}}, batch: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}}, refused: []string{"kind", "radius_m"}},
		{name: "stored relative turned arrive clearing the time", stored: [][2]string{{"kind", `"relative"`}, {"offset_minutes", `0`}, {"fire_at", `1791000000000`}},
			batch: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}, {"offset_minutes", `null`}, {"fire_at", `null`}}},
		{name: "stored arrive turned relative keeps radius", stored: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}}, batch: [][2]string{{"kind", `"relative"`}}, refused: []string{"kind"}},
		{name: "radius change on a stored leave", stored: [][2]string{{"kind", `"leave"`}, {"radius_m", `150`}}, batch: [][2]string{{"radius_m", `1000`}}},
		{name: "dismiss a stored arrive", stored: [][2]string{{"kind", `"arrive"`}, {"radius_m", `150`}}, batch: [][2]string{{"dismissed_at", `1791000000000`}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newSharing(t)
			if len(c.stored) > 0 {
				ops := []Op{f.op("reminder", "r", "task_id", `"t1"`)}
				for _, fv := range c.stored {
					ops = append(ops, f.op("reminder", "r", fv[0], fv[1]))
				}
				if res := f.apply("alice", "A", ops...); len(res.Rejected) != 0 {
					t.Fatalf("stored: rejected %v", res.Rejected)
				}
			}
			var ops []Op
			for _, fv := range c.batch {
				ops = append(ops, f.op("reminder", "r", fv[0], fv[1]))
			}
			res := f.apply("alice", "A", ops...)
			got := map[string]bool{}
			for _, rej := range res.Rejected {
				if rej.Reason != ReasonInvalidReminder {
					t.Fatalf("reason = %q, want %q", rej.Reason, ReasonInvalidReminder)
				}
				for _, o := range ops {
					if o.ID == rej.ID {
						got[o.Field] = true
					}
				}
			}
			if len(got) != len(c.refused) {
				t.Fatalf("refused %v, want %v", got, c.refused)
			}
			for _, fld := range c.refused {
				if !got[fld] {
					t.Fatalf("refused %v, want %v", got, c.refused)
				}
			}
		})
	}
}
