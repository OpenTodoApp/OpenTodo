package backup

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/blobs"
)

func putBlob(t *testing.T, dir, id string, body []byte) {
	t.Helper()
	s, err := blobs.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	h := sha256.Sum256(body)
	if err := s.Write(id, bytes.NewReader(body), blobs.Spec{Size: int64(len(body)), SHA256: hex.EncodeToString(h[:])}); err != nil {
		t.Fatal(err)
	}
}

func TestArchiveCarriesAttachments(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	files := map[string][]byte{"aaa1": []byte("one"), "bbb2": bytes.Repeat([]byte("two"), 1000), "ccc3": []byte("three")}
	for id, b := range files {
		putBlob(t, e.dir, id, b)
	}
	archive := backupOnce(t, e, "")
	f, err := os.Open(archive)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	tr, finish, _, err := openArchive(f, "")
	if err != nil {
		t.Fatal(err)
	}
	m, err := readManifest(tr)
	if err != nil {
		t.Fatal(err)
	}
	listed := map[string]int64{}
	for _, mf := range m.Files {
		listed[mf.Name] = mf.Size
	}
	for id, b := range files {
		if listed["attachments/"+id[:2]+"/"+id] != int64(len(b)) {
			t.Fatalf("manifest lacks %s: %+v", id, m.Files)
		}
	}
	got := map[string][]byte{}
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if validAttachmentEntry(h.Name) {
			got[filepath.Base(h.Name)], _ = io.ReadAll(tr)
		}
	}
	_ = finish()
	for id, b := range files {
		if !bytes.Equal(got[id], b) {
			t.Fatalf("archive content of %s differs", id)
		}
	}
}

func TestArchiveFailsWhenAFileDisappears(t *testing.T) {
	var buf bytes.Buffer
	dir := t.TempDir()
	db := filepath.Join(dir, "snap.db")
	os.WriteFile(db, []byte("db"), 0o600)
	gone := filepath.Join(dir, "gone")
	os.WriteFile(gone, []byte("x"), 0o600)
	// The file is listed (walk) but removed before it is streamed.
	err := writeArchive(&failAfterManifest{w: &buf, remove: gone}, db, Manifest{CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		archiveOptions{attachments: []archivedFile{{name: "attachments/go/gone", path: gone}}})
	if err == nil {
		t.Fatal("archive written although a file disappeared")
	}
}

// failAfterManifest removes a file once the first bytes (the manifest) are written.
type failAfterManifest struct {
	w      io.Writer
	remove string
	done   bool
}

func (f *failAfterManifest) Write(p []byte) (int, error) {
	if !f.done {
		f.done = true
		os.Remove(f.remove)
	}
	return f.w.Write(p)
}

func TestRestoreBringsBackAttachments(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	body := []byte("receipt bytes")
	putBlob(t, e.dir, "abc123", body)
	archive := backupOnce(t, e, "pw")
	e.db.Close()
	// A new host without the files, plus a newer file the archive does not know.
	os.RemoveAll(filepath.Join(e.dir, "attachments"))
	putBlob(t, e.dir, "zzz999", []byte("newer"))
	res, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Attachments != 1 {
		t.Fatalf("restored %d attachments", res.Attachments)
	}
	got, err := os.ReadFile(filepath.Join(e.dir, "attachments", "ab", "abc123"))
	if err != nil || !bytes.Equal(got, body) {
		t.Fatalf("restored file = %q, %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(e.dir, "attachments", "zz", "zzz999")); err != nil {
		t.Fatal("an unlisted newer file was removed")
	}
}

func TestRestoreCorruptAttachmentChangesNothing(t *testing.T) {
	dir := t.TempDir()
	// A hand-made archive: manifest, database, one attachment whose digest is wrong.
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	write := func(name string, b []byte) {
		tw.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(b)), Typeflag: tar.TypeReg})
		tw.Write(b)
	}
	m := []byte(`{"format":"opentodo-backup","formatVersion":1,"schemaVersion":1,"files":[{"name":"opentodo.db","size":2,"sha256":"x"},{"name":"attachments/ab/abc","size":3,"sha256":"00"}]}`)
	write(ManifestName, m)
	write("opentodo.db", []byte("db"))
	write("attachments/ab/abc", []byte("bad"))
	tw.Close()
	_, err := Stage(filepath.Join(dir, "stage"), &buf, "", "x.tar")
	if err == nil || !errors.Is(err, ErrIntegrity) {
		t.Fatalf("stage = %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "attachments")); err == nil {
		t.Fatal("data directory touched")
	}
}

func TestArchiveMemoryBoundedForLargeFile(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	dir := filepath.Join(e.dir, "attachments", "bi")
	os.MkdirAll(dir, 0o700)
	// A 300 MB sparse file: no disk cost, but every byte is read and hashed.
	f, err := os.Create(filepath.Join(dir, "big"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(300 << 20); err != nil {
		t.Fatal(err)
	}
	f.Close()
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	backupOnce(t, e, "")
	runtime.ReadMemStats(&after)
	if grew := after.TotalAlloc - before.TotalAlloc; grew > 64<<20 {
		t.Fatalf("a 300 MB file allocated %d bytes", grew)
	}
}
