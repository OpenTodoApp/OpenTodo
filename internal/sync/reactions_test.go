package sync

import "testing"

// Reactions (OpenSpec change editor-everywhere, design D8): one field per
// reacting account, written only by that account.
func TestReactions(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	f.apply("bob", "B", f.commentOps("c1", "t1", "bob", "Lunch?")...)

	// Concurrent accounts: two people react at once and both are kept.
	if res := f.apply("alice", "A", f.op("comment", "c1", "reactions.alice", `["thumbs_up"]`)); len(res.Rejected) != 0 {
		t.Fatalf("alice react = %+v", res)
	}
	// A viewer may react too.
	if res := f.apply("carol", "C", f.op("comment", "c1", "reactions.carol", `["thumbs_up","heart"]`)); len(res.Rejected) != 0 {
		t.Fatalf("viewer react = %+v", res)
	}
	if f.field("bob", "comment", "c1", "reactions.alice") != `["thumbs_up"]` || f.field("bob", "comment", "c1", "reactions.carol") != `["thumbs_up","heart"]` {
		t.Fatal("concurrent reactions were not both kept")
	}

	// Toggle: writing the account's list again replaces only that account's list.
	f.apply("alice", "A", f.op("comment", "c1", "reactions.alice", `[]`))
	if f.field("bob", "comment", "c1", "reactions.alice") != `[]` || f.field("bob", "comment", "c1", "reactions.carol") != `["thumbs_up","heart"]` {
		t.Fatal("toggle touched another account")
	}

	// Forged key: nobody writes another account's reactions.
	if res := f.apply("bob", "B", f.op("comment", "c1", "reactions.carol", `[]`)); len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonForbidden {
		t.Fatalf("forged key = %+v", res)
	}
	if f.field("bob", "comment", "c1", "reactions.carol") != `["thumbs_up","heart"]` {
		t.Fatal("forged reaction stored")
	}

	// Unknown name, duplicates and non-lists are refused by validation.
	valid := func(field, v string) error {
		op := f.op("comment", "c1", field, v)
		op.Device = "B"
		return Validate(op)
	}
	if err := valid("reactions.bob", `["thumbs_up","heart","check","eyes","party","question"]`); err != nil {
		t.Fatalf("all six = %v", err)
	}
	for _, v := range []string{`["clap"]`, `["heart","heart"]`, `"heart"`, `null`} {
		if err := valid("reactions.bob", v); err == nil {
			t.Fatalf("value %s accepted", v)
		}
	}
	for _, field := range []string{"reactions.", "reactions.a/b", "reaction.bob"} {
		if err := valid(field, `["heart"]`); err == nil {
			t.Fatalf("field %q accepted", field)
		}
	}
	// The author's own reaction on a new comment is accepted in its creation batch.
	if res := f.apply("bob", "B", f.commentOps("c2", "t1", "bob", "Done", f.op("comment", "c2", "reactions.bob", `["check"]`))...); len(res.Rejected) != 0 {
		t.Fatalf("reaction in creation batch = %+v", res)
	}
}

// Mentions in notes (editor-everywhere D7): filtered to members, notified once.
func TestNoteMentions(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	rec := &mentionSink{}
	f.s.AddSink(rec)

	// A non-member is dropped and the filtered list goes back to the author's device.
	res := f.apply("alice", "A", f.op("task", "t1", "note_mentions", `["bob","mallory"]`))
	if len(res.Rejected) != 0 || f.field("bob", "task", "t1", "note_mentions") != `["bob"]` {
		t.Fatalf("stored = %s (%+v)", f.field("bob", "task", "t1", "note_mentions"), res)
	}
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `["bob"]` {
		t.Fatalf("restore = %+v", res.Restore)
	}
	if len(rec.events) != 1 || rec.events[0].RecipientID != "bob" || rec.events[0].Source != "note" || rec.events[0].CommentID != "" || rec.events[0].TaskID != "t1" {
		t.Fatalf("events = %+v", rec.events)
	}
	// An edited note that keeps bob does not notify bob again; adding carol notifies carol.
	f.apply("alice", "A", f.op("task", "t1", "note_mentions", `["bob","carol"]`))
	f.apply("alice", "A", f.op("task", "t1", "note_mentions", `["bob","carol"]`))
	if len(rec.events) != 2 || rec.events[1].RecipientID != "carol" {
		t.Fatalf("events after edit = %+v", rec.events)
	}
	// A personal task keeps no note mentions and notifies nobody.
	f.apply("alice", "A", f.op("task", "inbox", "note_mentions", `["bob"]`))
	if f.field("alice", "task", "inbox", "note_mentions") != `[]` || len(rec.events) != 2 {
		t.Fatalf("personal = %s, events %d", f.field("alice", "task", "inbox", "note_mentions"), len(rec.events))
	}
}
