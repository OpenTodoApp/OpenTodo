package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The optional Microsoft client of calendar sync (outlook-calendar-sync D2):
// none is required, the id and a secret go together, only one secret
// variable, and the tenant is read as given.
func TestLoadMicrosoft(t *testing.T) {
	clear := func() {
		for _, k := range []string{"OPENTODO_MICROSOFT_CLIENT_ID", "OPENTODO_MICROSOFT_CLIENT_SECRET", "OPENTODO_MICROSOFT_CLIENT_SECRET_FILE", "OPENTODO_MICROSOFT_TENANT"} {
			t.Setenv(k, "")
		}
	}
	clear()
	var none Config
	if err := none.loadMicrosoft(); err != nil || none.Microsoft.Set() {
		t.Fatalf("unset = %+v %v", none.Microsoft, err)
	}
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_ID", " 11111111-2222-3333-4444-555555555555 ")
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_SECRET", "s3cret")
	t.Setenv("OPENTODO_MICROSOFT_TENANT", " consumers ")
	var c Config
	want := MicrosoftConfig{ClientID: "11111111-2222-3333-4444-555555555555", ClientSecret: "s3cret", Tenant: "consumers"}
	if err := c.loadMicrosoft(); err != nil || c.Microsoft != want || !c.Microsoft.Set() {
		t.Fatalf("env = %+v %v", c.Microsoft, err)
	}
	file := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(file, []byte("from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_SECRET_FILE", file)
	if err := (&Config{}).loadMicrosoft(); err == nil || !strings.Contains(err.Error(), "only one") {
		t.Fatalf("both secrets = %v", err)
	}
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_SECRET", "")
	var f Config
	if err := f.loadMicrosoft(); err != nil || f.Microsoft.ClientSecret != "from-file" {
		t.Fatalf("file = %+v %v", f.Microsoft, err)
	}
	empty := filepath.Join(t.TempDir(), "empty")
	_ = os.WriteFile(empty, []byte("\n"), 0o600)
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_SECRET_FILE", empty)
	if err := (&Config{}).loadMicrosoft(); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("empty file = %v", err)
	}
	clear()
	t.Setenv("OPENTODO_MICROSOFT_CLIENT_ID", "id-only")
	if err := (&Config{}).loadMicrosoft(); err == nil || !strings.Contains(err.Error(), "go together") {
		t.Fatalf("id only = %v", err)
	}
}
