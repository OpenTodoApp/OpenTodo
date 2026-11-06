package httpapi

import "net/http"

// noFetchMetadata is a request header a test sets to send a request with
// neither Origin nor Sec-Fetch-Site, as a non-browser client or a browser
// too old for Fetch Metadata would; browserTransport removes it.
const noFetchMetadata = "X-Test-No-Fetch-Metadata"

// browserTransport makes the package's test clients behave like a browser on
// the app's own pages (OpenSpec change cookie-writes-need-origin): a request
// that names neither Origin nor Sec-Fetch-Site gets `Sec-Fetch-Site:
// same-origin`, which every supported browser sends, unless the test asked
// for a bare request with noFetchMetadata. Cross-site tests set Origin
// themselves and are left alone.
type browserTransport struct{ base http.RoundTripper }

func (t browserTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.Header.Get(noFetchMetadata) != "" {
		r = r.Clone(r.Context())
		r.Header.Del(noFetchMetadata)
		return t.base.RoundTrip(r)
	}
	if r.Header.Get("Origin") == "" && r.Header.Get("Sec-Fetch-Site") == "" {
		r = r.Clone(r.Context())
		r.Header.Set("Sec-Fetch-Site", "same-origin")
	}
	return t.base.RoundTrip(r)
}

func init() {
	// Every http.Client in this package's tests without its own transport
	// goes through it, including the ones tests build by hand.
	http.DefaultTransport = browserTransport{base: http.DefaultTransport}
}
