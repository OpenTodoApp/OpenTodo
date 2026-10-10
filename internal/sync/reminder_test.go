package sync

import (
	"errors"
	"testing"
)

// TestValidateReminderOps covers the reminder entity (OpenSpec change reminders).
func TestValidateReminderOps(t *testing.T) {
	valid := []Op{
		op("r1", "reminder", "rm1", "task_id", `"t1"`, 1, "A"),
		op("r2", "reminder", "rm1", "kind", `"relative"`, 1, "A"),
		op("r3", "reminder", "rm1", "kind", `"absolute"`, 1, "A"),
		op("r4", "reminder", "rm1", "offset_minutes", `-30`, 1, "A"),
		op("r5", "reminder", "rm1", "offset_minutes", `null`, 1, "A"),
		op("r6", "reminder", "rm1", "fire_at", `1791000000000`, 1, "A"),
		op("r7", "reminder", "rm1", "fire_at", `null`, 1, "A"),
		op("r8", "reminder", "rm1", "delivered_at", `null`, 1, "A"),
		op("r9", "reminder", "rm1", "dismissed_at", `1791000000000`, 1, "A"),
		op("r10", "reminder", "rm1", "created_at", `1791000000000`, 1, "A"),
		op("r11", "reminder", "rm1", "deleted_at", `null`, 1, "A"),
	}
	for _, o := range valid {
		if err := Validate(o); err != nil {
			t.Errorf("%s=%s rejected: %v", o.Field, o.Value, err)
		}
	}
	invalid := []Op{
		op("x1", "reminder", "rm1", "kind", `"weekly"`, 1, "A"),
		op("x2", "reminder", "rm1", "kind", `null`, 1, "A"),
		op("x3", "reminder", "rm1", "fire_at", `"tomorrow"`, 1, "A"),
		op("x4", "reminder", "rm1", "fire_at", `0`, 1, "A"),
		op("x5", "reminder", "rm1", "fire_at", `-5`, 1, "A"),
		op("x6", "reminder", "rm1", "offset_minutes", `1.5`, 1, "A"),
		op("x7", "reminder", "rm1", "offset_minutes", `"30"`, 1, "A"),
		op("x8", "reminder", "rm1", "offset_minutes", `600000`, 1, "A"),
		op("x9", "reminder", "rm1", "task_id", `42`, 1, "A"),
		op("x10", "reminder", "rm1", "task_id", `""`, 1, "A"),
		op("x11", "reminder", "rm1", "task_id", `null`, 1, "A"),
		op("x12", "reminder", "rm1", "title", `"nope"`, 1, "A"),
	}
	for _, o := range invalid {
		if err := Validate(o); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s=%s accepted, want ErrInvalidOp (got %v)", o.Field, o.Value, err)
		}
	}
	if Plural["reminders"] != "reminder" {
		t.Error(`Plural["reminders"] missing`)
	}
}
