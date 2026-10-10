package backup

import (
	"context"
	"errors"
	"testing"

	"github.com/pixari/opentodo/internal/config"
)

func ptr[T any](v T) *T { return &v }

func TestBackupPresetsSeedOnce(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	p := config.BackupPreset{
		Present: true, Destination: "webdav", WebDAVURL: "https://dav.example.com/backups", WebDAVUsername: "me",
		WebDAVPassword: "pw", Schedule: "daily", Time: "04:15", KeepLast: ptr(3), Passphrase: "phrase",
	}
	wrote, err := e.svc.ApplyPreset(ctx, p)
	if err != nil || !wrote {
		t.Fatalf("first apply: wrote=%v err=%v", wrote, err)
	}
	got, _ := e.svc.LoadSettings(ctx)
	if got.Destination != DestWebDAV || got.WebDAV.URL != p.WebDAVURL || got.Schedule.Frequency != FreqDaily ||
		got.Schedule.Time != "04:15" || got.Retention.KeepLast != 3 {
		t.Fatalf("seeded settings = %+v", got)
	}
	flags, _ := e.svc.Flags()
	if !flags.HasWebDAVPassword || !flags.HasPassphrase || flags.HasS3SecretKey {
		t.Fatalf("flags = %+v", flags)
	}

	// The owner changes something in the UI; a restart with the same env must not undo it.
	got.Retention.KeepLast = 10
	if _, err := e.svc.SaveSettings(ctx, got, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	p.KeepLast = ptr(1)
	wrote, err = e.svc.ApplyPreset(ctx, p)
	if err != nil || wrote {
		t.Fatalf("second apply: wrote=%v err=%v", wrote, err)
	}
	got, _ = e.svc.LoadSettings(ctx)
	if got.Retention.KeepLast != 10 {
		t.Fatalf("preset overrode UI value: %+v", got.Retention)
	}
}

func TestPresetAbsentWritesNothing(t *testing.T) {
	e := newTestEnv(t)
	wrote, err := e.svc.ApplyPreset(context.Background(), config.BackupPreset{})
	if err != nil || wrote {
		t.Fatalf("wrote=%v err=%v", wrote, err)
	}
	s, _ := e.svc.LoadSettings(context.Background())
	if s.Enabled() || s.Destination != DestLocal {
		t.Fatalf("defaults = %+v", s)
	}
}

func TestPresetInvalidCombinationFails(t *testing.T) {
	e := newTestEnv(t)
	_, err := e.svc.ApplyPreset(context.Background(), config.BackupPreset{Present: true, Destination: "s3"})
	var fe *FieldError
	if !errors.As(err, &fe) || fe.Field != "s3.endpoint" {
		t.Fatalf("err = %v", err)
	}
}

func TestSaveSettingsValidation(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	good := DefaultSettings()
	good.Schedule.Frequency = FreqDaily
	if _, err := e.svc.SaveSettings(ctx, good, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	for name, mut := range map[string]func(*Settings){
		"s3.bucket":            func(s *Settings) { s.Destination = DestS3; s.S3.Endpoint = "https://x"; s.S3.AccessKey = "a" },
		"retention.keepLast":   func(s *Settings) { s.Retention.KeepLast = 0 },
		"schedule.time":        func(s *Settings) { s.Schedule.Time = "7pm" },
		"schedule.frequency":   func(s *Settings) { s.Schedule.Frequency = "monthly" },
		"webdav.url":           func(s *Settings) { s.Destination = DestWebDAV; s.WebDAV.URL = "http://dav.lan/" },
		"local.dir":            func(s *Settings) { s.Local.Dir = "rel" },
		"destination":          func(s *Settings) { s.Destination = "ftp" },
		"retention.maxAgeDays": func(s *Settings) { s.Retention.MaxAgeDays = -2 },
	} {
		next := DefaultSettings()
		mut(&next)
		_, err := e.svc.SaveSettings(ctx, next, SecretUpdate{S3SecretKey: ptr("k")})
		var fe *FieldError
		if !errors.As(err, &fe) || fe.Field != name {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	cur, _ := e.svc.LoadSettings(ctx)
	if cur.Schedule.Frequency != FreqDaily {
		t.Fatalf("previous settings not kept: %+v", cur)
	}
	if flags, _ := e.svc.Flags(); flags.HasS3SecretKey {
		t.Fatal("secret written despite validation error")
	}
}
