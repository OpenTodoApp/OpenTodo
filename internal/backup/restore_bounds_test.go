package backup

import (
	"archive/tar"
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// craftedArchive builds a plain tar: the manifest, then each entry with the
// header size given (its content is zeros when longer than body).
func craftedArchive(t *testing.T, manifest string, entries []craftedEntry) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	write := func(name string, size int64, body []byte) {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: size, Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(body); err != nil {
			t.Fatal(err)
		}
		if pad := size - int64(len(body)); pad > 0 {
			if _, err := io.CopyN(tw, zeroReader{}, pad); err != nil {
				t.Fatal(err)
			}
		}
	}
	write(ManifestName, int64(len(manifest)), []byte(manifest))
	for _, e := range entries {
		write(e.name, e.size, e.body)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf
}

type craftedEntry struct {
	name string
	size int64
	body []byte
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func fileLen(path string) int64 {
	fi, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return fi.Size()
}

// TestStageRejectsEntryLargerThanManifest (reliable-background-jobs): an
// entry whose tar size differs from the manifest is refused before anything
// beyond the listed size is written, for the database and for attachments.
func TestStageRejectsEntryLargerThanManifest(t *testing.T) {
	const big = 8 << 20
	m := `{"format":"opentodo-backup","formatVersion":1,"schemaVersion":1,"files":[{"name":"opentodo.db","size":2,"sha256":"x"},{"name":"attachments/ab/abc","size":3,"sha256":"00"}]}`
	t.Run("database", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "stage")
		_, err := Stage(dir, craftedArchive(t, m, []craftedEntry{{"opentodo.db", big, []byte("db")}}), "", "x.tar")
		if !errors.Is(err, ErrIntegrity) {
			t.Fatalf("stage = %v, want ErrIntegrity", err)
		}
		if n := fileLen(filepath.Join(dir, stagedDBName)); n > 2 {
			t.Fatalf("%d bytes extracted for a 2-byte database", n)
		}
	})
	t.Run("attachment", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "stage")
		_, err := Stage(dir, craftedArchive(t, m, []craftedEntry{{"opentodo.db", 2, []byte("db")}, {"attachments/ab/abc", big, []byte("abc")}}), "", "x.tar")
		if !errors.Is(err, ErrIntegrity) {
			t.Fatalf("stage = %v, want ErrIntegrity", err)
		}
		if n := fileLen(filepath.Join(dir, "attachments", "ab", "abc")); n > 3 {
			t.Fatalf("%d bytes extracted for a 3-byte attachment", n)
		}
	})
}

// TestStageChecksFreeSpaceForManifest (reliable-background-jobs): a manifest
// listing more than the disk holds is refused before anything is extracted.
func TestStageChecksFreeSpaceForManifest(t *testing.T) {
	m := `{"format":"opentodo-backup","formatVersion":1,"schemaVersion":1,"files":[{"name":"opentodo.db","size":2,"sha256":"x"},{"name":"attachments/ab/abc","size":1099511627776,"sha256":"00"}]}`
	dir := filepath.Join(t.TempDir(), "stage")
	free := func(string) (int64, bool) { return 512 << 20, true }
	_, err := stage(dir, craftedArchive(t, m, []craftedEntry{{"opentodo.db", 2, []byte("db")}}), "", "x.tar", free)
	if !errors.Is(err, ErrInsufficientStorage) {
		t.Fatalf("stage = %v, want ErrInsufficientStorage", err)
	}
	if _, err := os.Stat(filepath.Join(dir, stagedDBName)); err == nil {
		t.Fatal("extracted although the disk cannot hold the archive")
	}
	neg := `{"format":"opentodo-backup","formatVersion":1,"schemaVersion":1,"files":[{"name":"opentodo.db","size":-1,"sha256":"x"}]}`
	if _, err := stage(dir, craftedArchive(t, neg, nil), "", "x.tar", free); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("negative size: %v, want ErrIntegrity", err)
	}
}
