package sync

import (
	"fmt"
	"sort"
	"strings"
	"testing"
)

// groupMentionFixture: alice's project p in Family is shared with the group
// Adults (bob, carol) as editors; dan is in Family but not on p.
func groupMentionFixture(t *testing.T) (*dirFixture, string, *mentionSink) {
	t.Helper()
	f := newDir(t)
	f.join("bob", "carol", "dan")
	f.moveP()
	g, _, err := f.s.CreateGroup(f.ctx, "alice", f.ws, "Adults")
	if err != nil {
		t.Fatal(err)
	}
	for _, u := range []string{"bob", "carol"} {
		f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, u, true))
	}
	if _, err := f.s.SetGroupGrant(f.ctx, "alice", "p", g.ID, RoleEditor, true); err != nil {
		t.Fatal(err)
	}
	rec := &mentionSink{}
	f.s.AddSink(rec)
	return f, g.ID, rec
}

func recipients(rec *mentionSink) string {
	var out []string
	for _, e := range rec.events {
		s := e.RecipientID
		if e.GroupName != "" {
			s += "@" + e.GroupName
		}
		out = append(out, s)
	}
	sort.Strings(out)
	return strings.Join(out, " ")
}

func TestGroupMentionStoredAndNotified(t *testing.T) {
	f, group, rec := groupMentionFixture(t)
	entry := GroupMentionPrefix + group
	res := f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "@Adults done", f.op("comment", "c1", "mentions", fmt.Sprintf(`[%q]`, entry)))...)
	if len(res.Rejected) != 0 || f.field("bob", "comment", "c1", "mentions") != fmt.Sprintf(`[%q]`, entry) {
		t.Fatalf("stored = %s (%+v)", f.field("bob", "comment", "c1", "mentions"), res)
	}
	if got := recipients(rec); got != "bob@Adults carol@Adults" {
		t.Fatalf("notified = %q", got)
	}
	if rec.events[0].GroupID != group {
		t.Fatalf("group id = %q", rec.events[0].GroupID)
	}
	// An edit that keeps the group notifies nobody again; adding bob directly neither.
	f.apply("alice", "A", f.op("comment", "c1", "mentions", fmt.Sprintf(`[%q,"bob"]`, entry)))
	if len(rec.events) != 2 {
		t.Fatalf("edit re-notified: %s", recipients(rec))
	}
}

func TestGroupMentionOnlyReachesProjectMembers(t *testing.T) {
	f, group, rec := groupMentionFixture(t)
	// Neighbours (dan, bob) is not on p: only bob can see the task.
	g2, _, _ := f.s.CreateGroup(f.ctx, "alice", f.ws, "Neighbours")
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g2.ID, "dan", true))
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g2.ID, "bob", true))
	f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "@Neighbours", f.op("comment", "c1", "mentions", fmt.Sprintf(`[%q]`, GroupMentionPrefix+g2.ID)))...)
	if got := recipients(rec); got != "bob@Neighbours" {
		t.Fatalf("notified = %q, want only bob (dan cannot see the task)", got)
	}
	// Mentioned directly and through two groups: one event, the direct one.
	rec.events = nil
	f.apply("carol", "C", f.commentOps("c2", "t1", "carol", "@bob @Adults @Neighbours",
		f.op("comment", "c2", "mentions", fmt.Sprintf(`[%q,"bob",%q]`, GroupMentionPrefix+group, GroupMentionPrefix+g2.ID)))...)
	if got := recipients(rec); got != "bob" {
		t.Fatalf("notified = %q", got)
	}
	for _, e := range rec.events {
		if e.RecipientID == "bob" && e.GroupID != "" {
			t.Fatalf("bob was mentioned directly: %+v", e)
		}
		if e.RecipientID == "carol" {
			t.Fatal("the author was notified")
		}
	}
}

func TestGroupMentionFiltered(t *testing.T) {
	f, group, rec := groupMentionFixture(t)
	// A group of another workspace is dropped.
	other, _ := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Work")})
	og, _, _ := f.s.CreateGroup(f.ctx, "alice", other.ID, "Team")
	res := f.apply("alice", "A", f.commentOps("c1", "t1", "alice", "@Team", f.op("comment", "c1", "mentions", fmt.Sprintf(`[%q,"group:ghost"]`, GroupMentionPrefix+og.ID)))...)
	if f.field("alice", "comment", "c1", "mentions") != `[]` || len(res.Restore) != 1 || len(rec.events) != 0 {
		t.Fatalf("foreign group: stored %s, restore %+v, events %+v", f.field("alice", "comment", "c1", "mentions"), res.Restore, rec.events)
	}
	// A personal task keeps nothing.
	f.apply("alice", "A", f.commentOps("c2", "inbox", "alice", "@Adults", f.op("comment", "c2", "mentions", fmt.Sprintf(`[%q]`, GroupMentionPrefix+group)))...)
	if f.field("alice", "comment", "c2", "mentions") != `[]` || len(rec.events) != 0 {
		t.Fatalf("personal: %s %+v", f.field("alice", "comment", "c2", "mentions"), rec.events)
	}
	// A deleted group is dropped.
	f.must(f.s.DeleteGroup(f.ctx, "alice", f.ws, group))
	f.apply("alice", "A", f.commentOps("c3", "t1", "alice", "@Adults", f.op("comment", "c3", "mentions", fmt.Sprintf(`[%q]`, GroupMentionPrefix+group)))...)
	if f.field("alice", "comment", "c3", "mentions") != `[]` {
		t.Fatalf("deleted group kept: %s", f.field("alice", "comment", "c3", "mentions"))
	}
}

func TestGroupMentionNeedsWorkspaceMember(t *testing.T) {
	f, group, rec := groupMentionFixture(t)
	// eve is a direct member of p but not of Family (a share from before the move).
	if _, err := f.s.db.Exec(`INSERT INTO project_members(project_id,user_id,role,added_by,created_at) VALUES('p','eve','editor','alice',1)`); err != nil {
		t.Fatal(err)
	}
	f.apply("eve", "E", f.commentOps("c1", "t1", "eve", "@Adults", f.op("comment", "c1", "mentions", fmt.Sprintf(`[%q]`, GroupMentionPrefix+group)))...)
	if f.field("alice", "comment", "c1", "mentions") != `[]` || len(rec.events) != 0 {
		t.Fatalf("outsider's group mention: %s %+v", f.field("alice", "comment", "c1", "mentions"), rec.events)
	}
}

func TestGroupMentionInNotes(t *testing.T) {
	f, group, rec := groupMentionFixture(t)
	entry := GroupMentionPrefix + group
	f.apply("bob", "B", f.op("task", "t1", "description", `"@Adults look"`), f.op("task", "t1", "note_mentions", fmt.Sprintf(`[%q]`, entry)))
	if f.field("alice", "task", "t1", "note_mentions") != fmt.Sprintf(`[%q]`, entry) {
		t.Fatalf("note mentions = %s", f.field("alice", "task", "t1", "note_mentions"))
	}
	if got := recipients(rec); got != "carol@Adults" {
		t.Fatalf("notified = %q", got)
	}
	if rec.events[0].Source != "note" {
		t.Fatalf("source = %q", rec.events[0].Source)
	}
	f.apply("bob", "B", f.op("task", "t1", "note_mentions", fmt.Sprintf(`[%q,"alice"]`, entry)))
	if got := recipients(rec); got != "alice carol@Adults" {
		t.Fatalf("after edit = %q", got)
	}
}
