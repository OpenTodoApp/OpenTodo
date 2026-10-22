package e2ee

import "testing"

// Custom fields (OpenSpec custom-fields, design D4): definition names and
// options and every task value under `fields.<id>` are content fields; the
// client encrypts their string values only, so numbers and booleans stay plain.
func TestCustomFieldContent(t *testing.T) {
	for _, c := range []struct {
		entity, field string
		want          bool
	}{
		{"field", "name", true},
		{"field", "options", true},
		{"field", "type", false},
		{"field", "project_id", false},
		{"task", "fields.f1", true},
		{"task", "fields.", false},
		{"project", "fields.f1", false},
	} {
		if got := IsContentField(c.entity, c.field); got != c.want {
			t.Errorf("IsContentField(%s, %s) = %v, want %v", c.entity, c.field, got, c.want)
		}
	}
	all := AllContentFields()
	found := false
	for _, f := range all["task"] {
		if f == "fields." {
			found = true
		}
	}
	if !found || len(all["task"]) != len(ContentFields["task"])+1 {
		t.Fatalf("AllContentFields task = %v", all["task"])
	}
}

// Time entries (OpenSpec time-tracking, design D1): the note is content, the
// times and references stay plaintext ("Time entry note in the personal scope").
func TestTimeEntryContent(t *testing.T) {
	for _, c := range []struct {
		field string
		want  bool
	}{
		{"note", true}, {"started_at", false}, {"ended_at", false}, {"task_id", false},
		{"user_id", false}, {"device_id", false}, {"created_at", false}, {"deleted_at", false},
	} {
		if got := IsContentField("time_entry", c.field); got != c.want {
			t.Errorf("IsContentField(time_entry, %s) = %v, want %v", c.field, got, c.want)
		}
	}
}

// The review record (OpenSpec close-the-day, design D5): the line for tomorrow
// is content, the close time and the rhythm stamps stay plaintext.
func TestReviewContent(t *testing.T) {
	for _, c := range []struct {
		field string
		want  bool
	}{
		{"tomorrow_note", true}, {"closed_at", false}, {"completed_at", false},
		{"daily_at", false}, {"focus", false}, {"focus_date", false},
	} {
		if got := IsContentField("review", c.field); got != c.want {
			t.Errorf("IsContentField(review, %s) = %v, want %v", c.field, got, c.want)
		}
	}
}

// Reactions and note mentions (OpenSpec editor-everywhere, design D7/D8) stay
// plaintext: they reveal only who reacted and whom a note names.
func TestReactionsAndNoteMentionsArePlaintext(t *testing.T) {
	for _, c := range [][2]string{{"comment", "reactions.alice"}, {"task", "note_mentions"}} {
		if IsContentField(c[0], c[1]) {
			t.Errorf("IsContentField(%s, %s) = true, want false", c[0], c[1])
		}
	}
	if !IsContentField("comment", "body") || !IsContentField("task", "description") {
		t.Error("comment body and task description must stay content")
	}
}
