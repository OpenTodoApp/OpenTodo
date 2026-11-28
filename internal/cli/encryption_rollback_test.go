package cli

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// The key record high-water mark (e2ee-rollback D6): ot refuses a key record
// older than the one its stored key came from, and keeps the stored key.
func TestKeyRecordHighWater(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"keys":{"version":1,"kdf":1,"salt":"AAAAAAAAAAAAAAAAAAAAAA","iterations":600000,"wrappedByPassphrase":"x","wrappedByRecovery":"y","createdAt":2000}}`)
	}))
	defer srv.Close()
	cfg := filepath.Join(t.TempDir(), "config.json")
	keys := filepath.Join(filepath.Dir(cfg), "keys")
	if err := os.MkdirAll(keys, 0o700); err != nil {
		t.Fatal(err)
	}
	stored := `{"server":"` + srv.URL + `","key_version":2,"key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","created_at":1,"record_created_at":2000}`
	if err := os.WriteFile(filepath.Join(keys, "default.json"), []byte(stored), 0o600); err != nil {
		t.Fatal(err)
	}
	var out, errb bytes.Buffer
	a := &App{Stdout: &out, Stderr: &errb, ConfigPath: cfg, Stdin: strings.NewReader(testPassphrase + "\n"),
		Getenv: func(k string) string {
			return map[string]string{"OPENTODO_URL": srv.URL, "OPENTODO_TOKEN": "t"}[k]
		}}
	if code := a.Main([]string{"encryption", "unlock"}); code == 0 || !strings.Contains(errb.String(), "older encryption key record") {
		t.Fatalf("exit %d, stderr %q", code, errb.String())
	}
	if b, _ := os.ReadFile(filepath.Join(keys, "default.json")); string(b) != stored {
		t.Fatalf("stored key changed: %s", b)
	}
	kf := &keyFile{Server: "https://x/", KeyVersion: 2, RecordCreatedAt: 2000}
	for _, c := range []struct {
		rec  e2ee.KeyRecord
		srv  string
		want bool
	}{
		{e2ee.KeyRecord{Version: 1, CreatedAt: 2000}, "https://x", true},
		{e2ee.KeyRecord{Version: 5, CreatedAt: 1000}, "https://x", true},
		{e2ee.KeyRecord{Version: 2, CreatedAt: 2000}, "https://x", false},
		{e2ee.KeyRecord{Version: 1, CreatedAt: 3000}, "https://x", false},
		{e2ee.KeyRecord{Version: 1, CreatedAt: 1000}, "https://other", false},
	} {
		if got := olderRecord(kf, c.rec, c.srv); got != c.want {
			t.Errorf("%+v at %s: %v", c.rec, c.srv, got)
		}
	}
}
