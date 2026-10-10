package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBackupPresetAbsentByDefault(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Backup.Present {
		t.Fatalf("preset present without any variable: %+v", c.Backup)
	}
}

func TestBackupPresetParses(t *testing.T) {
	pf := filepath.Join(t.TempDir(), "pass")
	if err := os.WriteFile(pf, []byte("s3cret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENTODO_BACKUP_DESTINATION", "S3")
	t.Setenv("OPENTODO_BACKUP_S3_ENDPOINT", "https://s3.example.com")
	t.Setenv("OPENTODO_BACKUP_S3_BUCKET", "b")
	t.Setenv("OPENTODO_BACKUP_S3_PATH_STYLE", "true")
	t.Setenv("OPENTODO_BACKUP_SCHEDULE", "weekly")
	t.Setenv("OPENTODO_BACKUP_TIME", "03:30")
	t.Setenv("OPENTODO_BACKUP_WEEKDAY", "Monday")
	t.Setenv("OPENTODO_BACKUP_KEEP", "14")
	t.Setenv("OPENTODO_BACKUP_PASSPHRASE_FILE", pf)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	b := c.Backup
	if !b.Present || b.Destination != "s3" || b.S3Bucket != "b" || b.S3PathStyle == nil || !*b.S3PathStyle ||
		b.Schedule != "weekly" || b.Time != "03:30" || b.Weekday == nil || *b.Weekday != 1 ||
		b.KeepLast == nil || *b.KeepLast != 14 || b.Passphrase != "s3cret" {
		t.Fatalf("unexpected preset %+v", b)
	}
}

// An invalid value stops startup with an error naming the variable.
func TestBackupPresetInvalidNamesVariable(t *testing.T) {
	cases := map[string]string{
		"OPENTODO_BACKUP_DESTINATION":     "ftp",
		"OPENTODO_BACKUP_SCHEDULE":        "monthly",
		"OPENTODO_BACKUP_TIME":            "25:00",
		"OPENTODO_BACKUP_WEEKDAY":         "9",
		"OPENTODO_BACKUP_KEEP":            "0",
		"OPENTODO_BACKUP_MAX_AGE_DAYS":    "-1",
		"OPENTODO_BACKUP_S3_PATH_STYLE":   "maybe",
		"OPENTODO_BACKUP_S3_ENDPOINT":     "s3.example.com",
		"OPENTODO_BACKUP_WEBDAV_URL":      "ftp://x",
		"OPENTODO_BACKUP_LOCAL_DIR":       "relative/dir",
		"OPENTODO_BACKUP_PASSPHRASE_FILE": "/nonexistent/file",
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) {
			t.Setenv(name, value)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("Load() error = %v, want one naming %s", err, name)
			}
		})
	}
}
