package httpapi

import (
	"encoding/json"
	"os"
	"testing"
)

// The service worker writes the page policy from the signed build (OpenSpec
// change signed-web-app, design D7), so its copy must equal the server's.
func TestCSPFixture(t *testing.T) {
	data, err := os.ReadFile("testdata/csp_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Base string `json:"base"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if f.Base != cspBase {
		t.Fatalf("testdata/csp_fixture.json base\n  %s\nwant cspBase\n  %s", f.Base, cspBase)
	}
}
