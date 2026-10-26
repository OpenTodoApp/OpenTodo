package vault

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeCrypter seals a value as enc:v1:<entity id>:<base64>, bound to its
// entity like the real format; another binding does not open.
type fakeCrypter struct{}

func (fakeCrypter) Seal(entity, id, field, pt string) (string, error) {
	return "enc:v1:" + id + ":" + base64.RawURLEncoding.EncodeToString([]byte(pt)), nil
}

func (fakeCrypter) Open(entity, id, field, value string) (string, error) {
	rest, ok := strings.CutPrefix(value, "enc:v1:"+id+":")
	if !ok {
		return "", errors.New("wrong binding")
	}
	b, err := base64.RawURLEncoding.DecodeString(rest)
	return string(b), err
}

// TestTaskNotesEncrypted: notes of an encrypted account decrypt with the
// stored key, pushes are ciphertext, and a value that does not open is
// read-only (design D8).
func TestTaskNotesEncrypted(t *testing.T) {
	var c fakeCrypter
	seal := func(id, pt string) string { s, _ := c.Seal("task", id, "title", pt); return s }
	f := &fake{}
	f.log = append(f.log, task("tsk00001", seal("tsk00001", "Renew passport"), "", map[string]any{"description": seal("tsk00001", "Bring photos")})...)
	f.log = append(f.log, task("tsk00002", seal("other", "Wrong binding"), "", nil)...)
	dir := t.TempDir()
	st := NewState("default", "http://x")
	if _, err := runFakeC(t, dir, f, st); err != nil {
		t.Fatal(err)
	}
	root := obsidianVault(t, "default.json")
	folder := filepath.Join(root, "Tasks")
	_ = os.MkdirAll(folder, 0o755)
	if _, err := LinkTaskNotes(dir, folder, false); err != nil {
		t.Fatal(err)
	}
	// Notes claim both tasks, and a new note creates a task.
	write := func(name, text string) {
		if err := os.WriteFile(filepath.Join(folder, name), []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("Passport.md", "---\ntitle: Renew passport\nopentodo-id: tsk00001\ntags:\n  - task\n---\n\nBring photos\n")
	write("Bad.md", "---\ntitle: Something else\npriority: high\nopentodo-id: tsk00002\ntags:\n  - task\n---\n")
	write("Visa.md", "---\ntitle: Apply for the visa\ntags:\n  - task\n---\n")
	if _, err := runFakeC(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	// Edit the decrypted title: the push is ciphertext that opens to it.
	text, _ := os.ReadFile(filepath.Join(folder, "Passport.md"))
	write("Passport.md", strings.Replace(string(text), "title: Renew passport", "title: Renew passports", 1))
	f.received = nil
	if _, err := runFakeC(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	sent := fieldsSent(f, "tsk00001")
	var title string
	_ = json.Unmarshal([]byte(sent["title"]), &title)
	if pt, err := c.Open("task", "tsk00001", "title", title); err != nil || pt != "Renew passports" {
		t.Fatalf("pushed title %q opens to %q, %v", sent["title"], pt, err)
	}
	// The undecryptable title is never pushed; the priority still is.
	for _, op := range f.log {
		if op.EntityID == "tsk00002" && op.Field == "title" && op.Device != "seed" {
			t.Errorf("an undecryptable title was pushed: %s", op.Value)
		}
	}
	prio := ""
	for _, op := range f.log {
		if op.EntityID == "tsk00002" && op.Field == "priority" {
			prio = string(op.Value)
		}
	}
	if prio != "1" {
		t.Errorf("priority of the undecryptable task = %s", prio)
	}
	// The new note's task went out sealed.
	for _, op := range f.log {
		if op.Entity == "task" && op.Field == "title" && op.Device != "seed" && !strings.HasPrefix(string(op.Value), `"enc:v1:`) {
			t.Errorf("a plaintext title was pushed: %s", op.Value)
		}
	}
	// The state file holds no plaintext.
	if b, _ := os.ReadFile(StatePath(dir)); strings.Contains(string(b), "Renew passports") || strings.Contains(string(b), "Apply for the visa") {
		t.Error("the state file holds plaintext")
	}
	// The undecryptable note keeps its text.
	if b, _ := os.ReadFile(filepath.Join(folder, "Bad.md")); !strings.Contains(string(b), "title: Something else") {
		t.Errorf("the undecryptable note was rewritten:\n%s", b)
	}
}

func runFakeC(t *testing.T, dir string, f *fake, st *State) (*Report, error) {
	t.Helper()
	o := Options{Dir: dir, Transport: f, State: st, Crypter: fakeCrypter{}, UserID: "user1"}
	o.Loc = nil
	return Sync(t.Context(), o)
}
