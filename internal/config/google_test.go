package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The optional Google client of calendar sync (calendar-two-way D13): none is
// required, the id and a secret go together, and only one secret variable.
func TestLoadGoogle(t *testing.T) {
	clear := func() {
		for _, k := range []string{"OPENTODO_GOOGLE_CLIENT_ID", "OPENTODO_GOOGLE_CLIENT_SECRET", "OPENTODO_GOOGLE_CLIENT_SECRET_FILE"} {
			t.Setenv(k, "")
		}
	}
	clear()
	var none Config
	if err := none.loadGoogle(); err != nil || none.Google.Set() {
		t.Fatalf("unset = %+v %v", none.Google, err)
	}
	t.Setenv("OPENTODO_GOOGLE_CLIENT_ID", " 123.apps.googleusercontent.com ")
	t.Setenv("OPENTODO_GOOGLE_CLIENT_SECRET", "s3cret")
	var c Config
	if err := c.loadGoogle(); err != nil || c.Google != (GoogleConfig{ClientID: "123.apps.googleusercontent.com", ClientSecret: "s3cret"}) || !c.Google.Set() {
		t.Fatalf("env = %+v %v", c.Google, err)
	}
	file := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(file, []byte("from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENTODO_GOOGLE_CLIENT_SECRET_FILE", file)
	if err := (&Config{}).loadGoogle(); err == nil || !strings.Contains(err.Error(), "only one") {
		t.Fatalf("both secrets = %v", err)
	}
	t.Setenv("OPENTODO_GOOGLE_CLIENT_SECRET", "")
	var f Config
	if err := f.loadGoogle(); err != nil || f.Google.ClientSecret != "from-file" {
		t.Fatalf("file = %+v %v", f.Google, err)
	}
	clear()
	t.Setenv("OPENTODO_GOOGLE_CLIENT_ID", "id-only")
	if err := (&Config{}).loadGoogle(); err == nil || !strings.Contains(err.Error(), "go together") {
		t.Fatalf("id only = %v", err)
	}
}
