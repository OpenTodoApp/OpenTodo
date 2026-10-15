package agenttools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// OpenSpec change attachments, design D14: get_task lists attachment metadata.

func (f *fixture) attachment(uid, id string, fields map[string]any) {
	base := map[string]any{"task_id": "t1", "comment_id": nil, "name": "file", "mime": nil, "size": nil, "sha256": nil, "url": nil,
		"encrypted": false, "author_id": uid, "created_at": 5, "uploaded_at": nil, "deleted_at": nil}
	for k, v := range fields {
		base[k] = v
	}
	f.put(uid, "attachment", id, base)
}

func (f *fixture) markUploaded(uid, id string) {
	f.t.Helper()
	f.ts++
	op := opsync.Op{ID: ids.New(), Entity: "attachment", EntityID: id, Field: "uploaded_at", Value: json.RawMessage("7"), TS: f.ts, Device: opsync.ServerDevice}
	if _, err := f.sync.ApplyStrict(context.Background(), uid, []opsync.Op{op}); err != nil {
		f.t.Fatal(err)
	}
}

type attachmentShape struct {
	Attachments []struct {
		ID        string            `json:"id"`
		Name      any               `json:"name"`
		Size      *int64            `json:"size"`
		Uploaded  bool              `json:"uploaded"`
		CommentID *string           `json:"comment_id"`
		Untrusted map[string]string `json:"untrusted_text"`
	} `json:"attachments"`
}

func getAttachments(t *testing.T, f *fixture) attachmentShape {
	t.Helper()
	out := f.mustCall(agent("u1"), "get_task", map[string]any{"id": "t1"})
	raw, _ := json.Marshal(out)
	var s attachmentShape
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestGetTaskListsAttachments(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Report", nil)
	f.task("u1", "t2", "Other", nil)
	f.attachment("u1", "a-file", map[string]any{"name": "Q3.pdf", "mime": "application/pdf", "size": 2048, "sha256": "ab"})
	f.markUploaded("u1", "a-file")
	f.attachment("u1", "a-wait", map[string]any{"name": "photo.jpg", "mime": "image/jpeg", "size": 10, "sha256": "cd"})
	f.attachment("u1", "a-link", map[string]any{"name": "Spec", "url": "https://example.com/spec"})
	f.attachment("u1", "a-else", map[string]any{"task_id": "t2", "name": "elsewhere", "url": "https://example.com/x"})
	f.attachment("u1", "a-gone", map[string]any{"name": "removed", "url": "https://example.com/y", "deleted_at": 9})

	s := getAttachments(t, f)
	got := map[string]int{}
	for i, a := range s.Attachments {
		got[a.ID] = i
	}
	if len(s.Attachments) != 3 {
		t.Fatalf("attachments = %+v", s.Attachments)
	}
	file := s.Attachments[got["a-file"]]
	if file.Name != nil || file.Untrusted["name"] != "Q3.pdf" || file.Untrusted["mime"] != "application/pdf" || file.Size == nil || *file.Size != 2048 || !file.Uploaded {
		t.Fatalf("file = %+v", file)
	}
	if w := s.Attachments[got["a-wait"]]; w.Uploaded {
		t.Fatalf("waiting file = %+v", w)
	}
	if l := s.Attachments[got["a-link"]]; l.Untrusted["url"] != "https://example.com/spec" || l.Size != nil || !l.Uploaded {
		t.Fatalf("link = %+v", l)
	}
}

func TestGetTaskAttachmentEncryptedAndOnComment(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Report", nil)
	f.put("u1", "comment", "c1", map[string]any{"task_id": "t1", "body": "see attached", "author_id": "u1", "created_at": 10})
	f.attachment("u1", "a-enc", map[string]any{"name": e2ee.Prefix + "abc", "mime": "application/octet-stream", "size": 40, "sha256": "ef", "encrypted": true, "comment_id": "c1"})
	s := getAttachments(t, f)
	if len(s.Attachments) != 1 {
		t.Fatalf("attachments = %+v", s.Attachments)
	}
	a := s.Attachments[0]
	if a.Untrusted["name"] != e2ee.Placeholder || a.CommentID == nil || *a.CommentID != "c1" {
		t.Fatalf("attachment = %+v", a)
	}
}
