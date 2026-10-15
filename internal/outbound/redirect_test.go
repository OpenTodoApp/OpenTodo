package outbound

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

type mapResolver map[string]string

func (f mapResolver) LookupNetIP(_ context.Context, _, host string) ([]netip.Addr, error) {
	if ip, ok := f[host]; ok {
		return []netip.Addr{netip.MustParseAddr(ip)}, nil
	}
	return nil, fmt.Errorf("no such host %s", host)
}

// Calendar subscriptions follow up to three redirects (design D2): each hop is
// validated, and the dialer still refuses private addresses before connecting.
func TestFollowRedirectsChecksEveryHop(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n, _ := strconv.Atoi(r.URL.Query().Get("n"))
		switch r.URL.Query().Get("to") {
		case "metadata":
			http.Redirect(w, r, "http://169.254.169.254/latest", http.StatusFound)
			return
		case "ftp":
			http.Redirect(w, r, "ftp://files.example/cal.ics", http.StatusFound)
			return
		}
		if n > 0 {
			http.Redirect(w, r, fmt.Sprintf("http://hop%d.example/cal?n=%d", n, n-1), http.StatusFound)
			return
		}
		fmt.Fprint(w, "BEGIN:VCALENDAR")
	}))
	defer srv.Close()
	var dials atomic.Int32
	d := &Dialer{
		Resolver: mapResolver{"start.example": "93.184.216.34", "hop1.example": "93.184.216.35", "hop2.example": "93.184.216.36", "hop3.example": "93.184.216.37", "hop4.example": "93.184.216.38"},
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			dials.Add(1)
			return (&net.Dialer{}).DialContext(ctx, network, srv.Listener.Addr().String())
		},
	}
	c := NewClient(d, 5*time.Second, FollowRedirects(3))

	resp, err := c.Get("http://start.example/cal?n=3")
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("three hops: %v %v", resp, err)
	}
	resp.Body.Close()

	if _, err := c.Get("http://start.example/cal?n=4"); !errors.Is(err, ErrTooManyRedirects) {
		t.Fatalf("four hops: %v", err)
	}

	before := dials.Load()
	if _, err := c.Get("http://start.example/cal?to=metadata"); !errors.Is(err, ErrPrivateTarget) {
		t.Fatalf("metadata hop: %v", err)
	}
	// At most the first hop dials (a kept-alive connection may serve it); the
	// metadata address is refused before any connection.
	if got := dials.Load() - before; got > 1 {
		t.Fatalf("dials for the metadata redirect = %d, want at most 1 (the first hop only)", got)
	}

	if _, err := c.Get("http://start.example/cal?to=ftp"); !errors.Is(err, ErrBadURL) {
		t.Fatalf("ftp hop: %v", err)
	}
}
