package outbound

import (
	"errors"
	"net/http"
	"testing"
)

// Operator targets (backup destinations, the sign-on issuer) get the default
// transport without an environment proxy, and redirects only to the same
// scheme and host (OpenSpec change `operator-clients-no-env-proxy`).
func TestOperatorTransportIgnoresEnvironmentProxy(t *testing.T) {
	if OperatorTransport().Proxy != nil {
		t.Fatal("an operator client would send credentials through an environment proxy")
	}
}

func TestSameHostRedirects(t *testing.T) {
	check := SameHostRedirects(3)
	req := func(u string) *http.Request {
		r, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	first := []*http.Request{req("https://dav.example.com/backups/")}
	if err := check(req("https://DAV.example.com/other/"), first); err != nil {
		t.Errorf("same host: %v", err)
	}
	for _, u := range []string{"https://evil.example.com/", "http://dav.example.com/backups/", "https://dav.example.com:8443/"} {
		if err := check(req(u), first); !errors.Is(err, ErrCrossHostRedirect) {
			t.Errorf("%s: err = %v, want cross_host_redirect", u, err)
		}
	}
	four := []*http.Request{first[0], first[0], first[0], first[0]}
	if err := check(req("https://dav.example.com/x"), four); !errors.Is(err, ErrTooManyRedirects) {
		t.Errorf("fourth hop: err = %v, want too_many_redirects", err)
	}
}
