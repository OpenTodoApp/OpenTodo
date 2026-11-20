package sync

import (
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
)

// The rules of the entity kinds an account authors (comments, attachments, time
// entries; reactions on comments) pinned as one matrix: who may write which field
// of an item they or someone else wrote, for every role in a shared project. It
// records today's verdicts, so a change to these rules shows as a diff of
// testdata/authored_rules.golden. UPDATE_AUTHORED_RULES=1 rewrites the file.
func TestAuthoredRulesMatrix(t *testing.T) {
	// A valid value for every field, different from the one the item is created with.
	other := map[string]map[string]string{
		"comment": {
			"task_id": `"t2"`, "parent_id": `"c0"`, "body": `"edited"`, "author_id": `"carol"`, "mentions": `["carol"]`,
			"created_at": `2000`, "edited_at": `2000`, "deleted_at": `2000`, "guest_name": `"Guest"`, "page_id": `"pg1"`,
			"reactions.alice": `["heart"]`, "reactions.bob": `["heart"]`,
		},
		"attachment": {
			"task_id": `"t2"`, "comment_id": `"c0"`, "note_id": `"n1"`, "file_id": `"a0"`, "name": `"other.png"`, "mime": `"text/plain"`,
			"size": `20`, "sha256": `"def"`, "url": `"https://example.com/x"`, "encrypted": `true`, "author_id": `"carol"`, "created_at": `2000`,
			"uploaded_at": `null`, "deleted_at": `2000`,
		},
		"time_entry": {
			"task_id": `"t2"`, "user_id": `"carol"`, "started_at": `1500`, "ended_at": `2500`, "device_id": `"other"`, "note": `"edited"`,
			"created_at": `2000`, "deleted_at": `2000`, "focus_mode": `"pomodoro"`, "focus_session": `1`, "planned_end_at": `3000`,
		},
	}
	create := func(f *sharingFixture, entity, id, author string) []Op {
		switch entity {
		case "comment":
			return f.commentOps(id, "t1", author, "hello")
		case "attachment":
			return f.attachmentOps(id, "t1", author, 10)
		default:
			return f.entryOps(id, "t1", author, 1000, 2000)
		}
	}
	// Every field of the schema is in the matrix, so a new one cannot slip past it.
	for entity, fields := range other {
		for field := range Schema[entity] {
			if _, ok := fields[field]; !ok {
				t.Fatalf("%s.%s is not in the matrix: add a value for it", entity, field)
			}
		}
	}
	verdict := func(res ApplyResult, err error) string {
		switch {
		case errors.Is(err, ErrInvalidOp):
			return "invalid"
		case err != nil:
			t.Fatal(err)
		case len(res.Rejected) > 0:
			return res.Rejected[0].Reason
		}
		return "ok"
	}
	var lines []string
	for _, role := range []string{RoleViewer, RoleEditor, RoleAdmin} {
		for entity, fields := range other {
			for _, author := range []string{"alice", "bob"} {
				for _, actor := range []string{"alice", "bob"} {
					names := make([]string, 0, len(fields))
					for field := range fields {
						names = append(names, field)
					}
					sort.Strings(names)
					for _, field := range names {
						f := newSharing(t)
						f.add("alice", "bob", role)
						made := verdict(f.s.Apply(f.ctx, author, deviceOps(create(f, entity, "x1", author), author)))
						if made != "ok" {
							lines = append(lines, fmt.Sprintf("bob=%s %s by %s: create %s", role, entity, author, made))
							break
						}
						got := verdict(f.s.Apply(f.ctx, actor, deviceOps([]Op{f.op(entity, "x1", field, fields[field])}, actor)))
						lines = append(lines, fmt.Sprintf("bob=%s %s by %s, %s writes %s: %s", role, entity, author, actor, field, got))
					}
				}
			}
		}
	}
	sort.Strings(lines)
	lines = dedupe(lines)
	got := strings.Join(lines, "\n") + "\n"
	const path = "testdata/authored_rules.golden"
	if os.Getenv("UPDATE_AUTHORED_RULES") == "1" {
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run with UPDATE_AUTHORED_RULES=1 to write it)", err)
	}
	if string(want) != got {
		t.Errorf("the rules of authored entities changed; diff %s against this run, and rewrite it with UPDATE_AUTHORED_RULES=1 only if the change is meant:\n%s", path, got)
	}
}

// deviceOps stamps ops as written by one device of the account.
func deviceOps(ops []Op, user string) []Op {
	for i := range ops {
		ops[i].Device = "dev-" + user
	}
	return ops
}

func dedupe(sorted []string) []string {
	out := sorted[:0]
	for i, s := range sorted {
		if i == 0 || s != sorted[i-1] {
			out = append(out, s)
		}
	}
	return out
}
