package sync

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/activity"
)

// docValue builds a kDoc envelope whose total length is exactly n characters.
func docValue(t *testing.T, n int) string {
	t.Helper()
	prefix := "ydoc:v1:"
	body := strings.Repeat("A", n-len(prefix))
	return prefix + body
}

func jsonString(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

// TestNotesDocValidation covers the kDoc kind (collaborative-rich-text, task 1.1):
// a valid envelope up to MaxDocBytes is accepted, non-base64 and oversized values
// are refused, and every other kind keeps the 64 KB cap.
func TestNotesDocValidation(t *testing.T) {
	ok := func(v json.RawMessage) Op {
		return Op{ID: "o1", Entity: "task", EntityID: "t1", Field: "notes_doc", Value: v, TS: 1, Device: "A"}
	}
	payload := base64.StdEncoding.EncodeToString([]byte{1, 2, 3, 4, 5, 0xfe, 0xff})
	for name, v := range map[string]string{
		"empty":              "",
		"yjs update":         "ydoc:v1:" + payload,
		"url alphabet":       "ydoc:v1:" + base64.RawURLEncoding.EncodeToString([]byte{0xfb, 0xff, 0xfe}),
		"e2ee envelope":      "enc:v1:" + base64.RawURLEncoding.EncodeToString([]byte("nonce+ciphertext")),
		"exactly at the cap": docValue(t, MaxDocBytes),
	} {
		if err := Validate(ok(jsonString(v))); err != nil {
			t.Errorf("%s: unexpected error %v", name, err)
		}
	}
	for name, raw := range map[string]json.RawMessage{
		"not a string":     json.RawMessage(`42`),
		"null":             json.RawMessage(`null`),
		"no envelope":      jsonString(payload),
		"bad format name":  jsonString("Y-DOC:v1:" + payload),
		"missing version":  jsonString("ydoc:" + payload),
		"empty payload":    jsonString("ydoc:v1:"),
		"not base64":       jsonString("ydoc:v1:not base64!"),
		"bad base64 len":   jsonString("ydoc:v1:A"),
		"one over the cap": jsonString(docValue(t, MaxDocBytes+1)),
	} {
		if err := Validate(ok(raw)); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s: err = %v, want ErrInvalidOp", name, err)
		}
	}
	// The larger cap is for documents only: a description is still capped at 64 KB.
	big := jsonString(strings.Repeat("a", MaxValueBytes))
	if err := Validate(Op{ID: "o2", Entity: "task", EntityID: "t1", Field: "description", Value: big, TS: 1, Device: "A"}); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("64 KB description accepted: %v", err)
	}
	// A whole sync batch with an oversized document is refused and stores nothing.
	ctx := context.Background()
	s := newTestService(t)
	_, err := s.Apply(ctx, "u1", []Op{
		op("b1", "task", "t1", "title", `"x"`, 10, "A"),
		{ID: "b2", Entity: "task", EntityID: "t1", Field: "notes_doc", Value: jsonString(docValue(t, MaxDocBytes+1)), TS: 10, Device: "A"},
	})
	if !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("oversized batch err = %v", err)
	}
	if e, _ := s.Get(ctx, "u1", "task", "t1"); e != nil {
		t.Fatalf("batch partially stored: %v", e)
	}
}

// TestNotesDocIsOpaqueInHistory: revision history leaves the encoded document
// out; the description written in the same batch is the readable revision.
func TestNotesDocIsOpaqueInHistory(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	doc := "ydoc:v1:" + base64.StdEncoding.EncodeToString([]byte("state"))
	if _, err := s.Apply(ctx, "u1", []Op{
		op("c1", "task", "t1", "title", `"Fix sink"`, 10, "A"),
		op("c2", "task", "t1", "description", `"**call** the plumber"`, 20, "A"),
		{ID: "c3", Entity: "task", EntityID: "t1", Field: "notes_doc", Value: jsonString(doc), TS: 20, Device: "A"},
	}); err != nil {
		t.Fatal(err)
	}
	h, err := s.History(ctx, "u1", "task", "t1", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, set := range h.ChangeSets {
		for _, c := range set.Changes {
			if c.Field == "notes_doc" {
				t.Fatalf("history shows the encoded document: %+v", c)
			}
		}
	}
	if len(h.ChangeSets) != 2 || h.ChangeSets[1].Changes[0].Field != "description" {
		t.Fatalf("history = %+v", h.ChangeSets)
	}
	// The value itself is stored and served like any other field.
	e, _ := s.Get(ctx, "u1", "task", "t1")
	if string(e["notes_doc"]) != string(jsonString(doc)) {
		t.Fatalf("notes_doc = %s", e["notes_doc"])
	}
}

// The activity package keeps its own copy of the opaque list (sync imports it).
func TestDocFieldsMatchActivityOpaque(t *testing.T) {
	if len(DocFields) != len(activity.Opaque) {
		t.Fatalf("DocFields %v != activity.Opaque %v", DocFields, activity.Opaque)
	}
	for k := range DocFields {
		if !activity.Opaque[k] {
			t.Fatalf("%s missing from activity.Opaque", k)
		}
		entity, field, _ := strings.Cut(k, ".")
		if Schema[entity][field] != kDoc {
			t.Fatalf("%s is not a kDoc field", k)
		}
	}
}

// TestProjectNotesDocValidation: the project's note uses the same kDoc rules (project-notes 1.1).
func TestProjectNotesDocValidation(t *testing.T) {
	op := func(v json.RawMessage) Op {
		return Op{ID: "p1", Entity: "project", EntityID: "p1", Field: "notes_doc", Value: v, TS: 1, Device: "A"}
	}
	if err := Validate(op(jsonString("ydoc:v1:AAEC"))); err != nil {
		t.Fatalf("valid project doc: %v", err)
	}
	if err := Validate(op(jsonString("not a doc"))); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("invalid project doc: %v", err)
	}
	if err := Validate(Op{ID: "p2", Entity: "project", EntityID: "p1", Field: "description", Value: jsonString("# Plan"), TS: 1, Device: "A"}); err != nil {
		t.Fatalf("description: %v", err)
	}
	if !IsDocField("project", "notes_doc") || IsDocField("project", "description") {
		t.Fatal("DocFields")
	}
}


// TestProjectNoteHistory (project-notes 1.5): a project's note change set lists
// description and never notes_doc.
func TestProjectNoteHistory(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{
		op("p1", "project", "pr", "name", `"Trip"`, 10, "A"),
		op("p2", "project", "pr", "description", `"# Plan"`, 20, "A"),
		{ID: "p3", Entity: "project", EntityID: "pr", Field: "notes_doc", Value: jsonString("ydoc:v1:AAEC"), TS: 20, Device: "A"},
	}); err != nil {
		t.Fatal(err)
	}
	h, err := s.History(ctx, "u1", "project", "pr", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, set := range h.ChangeSets {
		for _, c := range set.Changes {
			seen[c.Field] = true
		}
	}
	if seen["notes_doc"] || !seen["description"] {
		t.Fatalf("history fields = %v", seen)
	}
}
