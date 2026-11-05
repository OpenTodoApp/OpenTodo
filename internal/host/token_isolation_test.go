package host

import (
	"net/http"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/config"
)

// TestAPITokenStaysWithItsTenant (external-security-review, threat model
// "Another tenant in host mode"): an API token works only on the host name of
// the tenant that issued it. TestRouting covers session cookies; a bearer
// token carries no host binding of its own, so this pins that the other
// tenant's database simply does not know it.
func TestAPITokenStaysWithItsTenant(t *testing.T) {
	f := newFixture(t, nil)
	alice, smith := f.client("alice"), f.client("smith")
	alice.register("alice@example.com", f.create("alice", config.Limits{}))
	smith.register("smith@example.com", f.create("smith", config.Limits{}))

	code, out := alice.do("POST", "/api/v1/tokens", map[string]any{"name": "script"})
	if code != http.StatusCreated {
		t.Fatalf("create token: %d %v", code, out)
	}
	secret, _ := out["secret"].(string)
	if secret == "" {
		t.Fatalf("no secret: %v", out)
	}
	call := func(c *tclient, method, path string) int {
		req := c.request(method, path, nil)
		req.Header.Del("Cookie")
		req.Header.Del("Origin")
		req.Header.Set("Authorization", "Bearer "+secret)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if got := call(f.client("alice"), "GET", "/api/v1/me"); got != http.StatusOK {
		t.Fatalf("alice's token on alice: %d", got)
	}
	for _, rt := range []struct{ method, path string }{{"GET", "/api/v1/me"}, {"GET", "/api/v1/tasks"}, {"POST", "/api/v1/tasks"}} {
		if got := call(f.client("smith"), rt.method, rt.path); got != http.StatusUnauthorized {
			t.Fatalf("alice's token on smith %s %s: %d, want 401", rt.method, rt.path, got)
		}
	}
}
