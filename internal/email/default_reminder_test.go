package email

import (
	"testing"
	"time"
)

// TestEmailTaskHasNoDefaultReminder (default-reminders D6): a mailed task has no
// due date and its batch holds no reminder, whatever the person's defaults.
func TestEmailTaskHasNoDefaultReminder(t *testing.T) {
	p, err := Parse([]byte("Subject: Pay the rent friday\nContent-Type: text/plain; charset=utf-8\n\nremind me 1 day before\n"))
	if err != nil {
		t.Fatal(err)
	}
	for _, op := range taskOps("u1", p, time.Unix(1_760_000_000, 0), 1_760_000_000_000) {
		if op.Entity != "task" || (op.Field == "due" && string(op.Value) != "null") {
			t.Fatalf("unexpected op %s.%s = %s", op.Entity, op.Field, op.Value)
		}
	}
}
