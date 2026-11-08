package oidc_test

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/oidc"
)

// The provider client takes no proxy from the environment, so discovery, the
// key set and the code exchange with its client secret go only to the issuer
// the operator configured (OpenSpec change `operator-clients-no-env-proxy`).
func TestProviderClientIgnoresEnvironmentProxy(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	c := oidc.NewHTTPClient(nil)
	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("transport = %T, want *http.Transport", c.Transport)
	}
	if tr.Proxy != nil {
		t.Fatal("the provider client uses a proxy from the environment")
	}
}

// A provider answer that redirects is returned as it is, never followed, to
// the same host or another.
func TestProviderClientFollowsNoRedirect(t *testing.T) {
	var elsewhere atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { elsewhere.Add(1) }))
	defer other.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/token", http.StatusTemporaryRedirect)
	}))
	defer srv.Close()
	resp, err := oidc.NewHTTPClient(nil).Post(srv.URL+"/token", "application/x-www-form-urlencoded", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusTemporaryRedirect || elsewhere.Load() != 0 {
		t.Fatalf("status %d, other host got %d requests", resp.StatusCode, elsewhere.Load())
	}
}
