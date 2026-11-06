package backup

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/outbound"
)

// The destination client takes no proxy from the environment: a proxy would
// carry archives and destination credentials through a host the operator never
// configured for them (OpenSpec change `operator-clients-no-env-proxy`).
func TestBackupClientIgnoresEnvironmentProxy(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	e := newTestEnv(t)
	tr, ok := e.svc.client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("transport = %T, want *http.Transport", e.svc.client.Transport)
	}
	if tr.Proxy != nil {
		t.Fatal("the backup client uses a proxy from the environment")
	}
	// And requests really go direct: the proxy above does not exist.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	defer srv.Close()
	resp, err := e.svc.client.Get(srv.URL)
	if err != nil {
		t.Fatalf("direct request: %v", err)
	}
	resp.Body.Close()
}

// A destination may redirect within its own scheme and host; a redirect to
// another host fails before any request reaches it, so WebDAV credentials and
// archives stay with the destination the operator named.
func TestBackupDestinationRedirectsStayOnHost(t *testing.T) {
	var elsewhere atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		elsewhere.Add(1)
		w.WriteHeader(http.StatusCreated)
	}))
	defer other.Close()
	var srvURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/old/":
			http.Redirect(w, r, srvURL+"/dav/", http.StatusTemporaryRedirect)
		case "/dav/":
			w.WriteHeader(http.StatusCreated)
		case "/away/":
			http.Redirect(w, r, other.URL+"/dav/", http.StatusTemporaryRedirect)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	srvURL = srv.URL
	c := NewHTTPClient()

	same, err := newWebDAVDest(WebDAVSettings{URL: srv.URL + "/old/", Username: "me", AllowHTTP: true}, "pw", c)
	if err != nil {
		t.Fatal(err)
	}
	if err := same.ensureCollection(context.Background()); err != nil {
		t.Fatalf("same-host redirect: %v", err)
	}

	away, err := newWebDAVDest(WebDAVSettings{URL: srv.URL + "/away/", Username: "me", AllowHTTP: true}, "pw", c)
	if err != nil {
		t.Fatal(err)
	}
	if err := away.ensureCollection(context.Background()); !errors.Is(err, outbound.ErrCrossHostRedirect) {
		t.Fatalf("cross-host redirect: err = %v, want %v", err, outbound.ErrCrossHostRedirect)
	}
	if n := elsewhere.Load(); n != 0 {
		t.Fatalf("the other host got %d requests", n)
	}
}
