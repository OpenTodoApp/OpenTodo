package settings

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/store"
)

func TestStoreGetSet(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := New(db)
	ctx := context.Background()
	var v struct{ A int }
	if ok, err := s.Get(ctx, "x", &v); ok || err != nil {
		t.Fatalf("missing key: ok=%v err=%v", ok, err)
	}
	if err := s.Set(ctx, "x", map[string]int{"A": 3}); err != nil {
		t.Fatal(err)
	}
	if err := s.Set(ctx, "x", map[string]int{"A": 4}); err != nil {
		t.Fatal(err)
	}
	if ok, err := s.Get(ctx, "x", &v); !ok || err != nil || v.A != 4 {
		t.Fatalf("got %+v ok=%v err=%v", v, ok, err)
	}
	gen, err := s.GetString(ctx, GenerationKey)
	if err != nil || len(gen) != 32 {
		t.Fatalf("generation %q err=%v", gen, err)
	}
}

func TestSecretsFileModeAndNeverSerialised(t *testing.T) {
	dir := t.TempDir()
	f := NewSecretsFile(dir, "backup")
	pass, key := "correct horse battery", "AKIA-secret-value"
	if err := f.Update(map[string]*string{"passphrase": &pass, "s3_secret_key": &key, "unchanged": nil}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "secrets", "backup.json"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("secrets file mode = %v, want 0600", info.Mode().Perm())
	}
	dinfo, _ := os.Stat(filepath.Join(dir, "secrets"))
	if dinfo.Mode().Perm() != 0o700 {
		t.Fatalf("secrets dir mode = %v, want 0700", dinfo.Mode().Perm())
	}
	s, err := f.Load()
	if err != nil {
		t.Fatal(err)
	}
	if s.Value("passphrase") != pass || !s.Has("s3_secret_key") || s.Has("webdav_password") {
		t.Fatalf("load mismatch: %v", s)
	}
	// Every way a value could leak into an API response or a log line.
	j, _ := json.Marshal(s)
	j2, _ := json.Marshal(map[string]any{"nested": s})
	var logBuf bytes.Buffer
	slog.New(slog.NewJSONHandler(&logBuf, nil)).Info("x", "secrets", s)
	for _, out := range []string{string(j), string(j2), fmt.Sprint(s), fmt.Sprintf("%v %+v %#v %s", s, s, s, s), logBuf.String()} {
		if strings.Contains(out, pass) || strings.Contains(out, key) {
			t.Fatalf("secret leaked: %s", out)
		}
	}
	if string(j) != `{"passphrase":true,"s3_secret_key":true}` {
		t.Fatalf("flags = %s", j)
	}
	// Empty string clears.
	empty := ""
	if err := f.Update(map[string]*string{"passphrase": &empty}); err != nil {
		t.Fatal(err)
	}
	s, _ = f.Load()
	if s.Has("passphrase") || !s.Has("s3_secret_key") {
		t.Fatalf("clear failed: %v", s)
	}
	info, _ = os.Stat(f.Path())
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode after rewrite = %v", info.Mode().Perm())
	}
}
