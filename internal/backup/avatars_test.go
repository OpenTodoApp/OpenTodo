package backup

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// Profile pictures travel with backups like attachments (OpenSpec change
// settings-refresh, design D10).
func TestBackupCarriesProfilePictures(t *testing.T) {
	e := newTestEnv(t)
	seed(t, e)
	dir := filepath.Join(e.dir, "avatars")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	picture := []byte("\xff\xd8 a jpeg")
	if err := os.WriteFile(filepath.Join(dir, "u-123.jpg"), picture, 0o600); err != nil {
		t.Fatal(err)
	}
	// Anything else in the folder is not a picture and stays out.
	if err := os.WriteFile(filepath.Join(dir, ".avatar-tmp"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	files, err := attachmentFiles(e.dir)
	if err != nil || len(files) != 1 || files[0].name != "avatars/u-123.jpg" {
		t.Fatalf("files = %+v, %v", files, err)
	}
	archive := backupOnce(t, e, "pw")
	e.db.Close()
	os.RemoveAll(dir)
	res, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive, Passphrase: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Attachments != 1 {
		t.Fatalf("restored %d files", res.Attachments)
	}
	got, err := os.ReadFile(filepath.Join(dir, "u-123.jpg"))
	if err != nil || !bytes.Equal(got, picture) {
		t.Fatalf("restored picture = %q, %v", got, err)
	}
}

func TestValidDataEntry(t *testing.T) {
	for name, want := range map[string]bool{
		"avatars/u-123.jpg":        true,
		"avatars/../secrets/x.jpg": false,
		"avatars/u.png":            false,
		"avatars/sub/u.jpg":        false,
		"attachments/ab/abc":       true,
	} {
		if validDataEntry(name) != want {
			t.Errorf("validDataEntry(%q) = %v", name, !want)
		}
	}
}
