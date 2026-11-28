package pushrelay

import (
	"errors"
	"net/http"
	"testing"
)

type countingRT struct{ n int }

func (c *countingRT) RoundTrip(*http.Request) (*http.Response, error) {
	c.n++
	return &http.Response{StatusCode: 200, Body: http.NoBody}, nil
}

// The guard under the APNs client refuses every host but Apple's.
func TestOnlyAPNsHosts(t *testing.T) {
	next := &countingRT{}
	g := onlyHosts{allowed: map[string]bool{"api.push.apple.com": true}, next: next}
	for _, u := range []string{"https://example.com/", "https://api.push.apple.com.evil.test/", "http://169.254.169.254/latest/meta-data/"} {
		req, _ := http.NewRequest("POST", u, nil)
		if _, err := g.RoundTrip(req); !errors.Is(err, errOtherHost) {
			t.Errorf("%s: %v", u, err)
		}
	}
	req, _ := http.NewRequest("POST", "https://api.push.apple.com/3/device/00", nil)
	if _, err := g.RoundTrip(req); err != nil || next.n != 1 {
		t.Fatalf("Apple refused: %v (%d)", err, next.n)
	}
}
