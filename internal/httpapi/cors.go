package httpapi

import (
	"net/http"
	"path"
	"strings"
)

// Cross-origin API calls with a token (OpenSpec change cors-for-tokens). Off
// unless OPENTODO_CORS_ORIGINS lists origins. Only requests that carry a
// bearer token get CORS headers, and Access-Control-Allow-Credentials is never
// sent: a listed origin's page can use the API with a token it holds, never
// with a signed-in browser's session cookie, whose writes keep the same-origin
// check of requireAuth. A preflight carries no credentials and never reaches a
// route: it is answered here, before the router.

const (
	corsMethods = "GET, HEAD, POST, PUT, PATCH, DELETE"
	// corsHeaders are the request headers the API reads beyond the safelisted ones.
	corsHeaders = "Authorization, Content-Type, Idempotency-Key, If-Match"
	// corsExpose are the response headers a client may need.
	corsExpose = "ETag, Retry-After, X-Row-Count, Content-Disposition, Allow, Deprecation, Sunset, Link"
	// corsMaxAge is how long a browser may reuse a preflight, in seconds.
	corsMaxAge = "600"
)

// corsExcluded are the sign-in flows under /api/v1/: they set the session
// cookie or exchange a code for a token, and stay same-origin.
var corsExcluded = []func(string) bool{prefix("/api/v1/auth"), prefix("/api/v1/app"), prefix("/api/v1/demo")}

// corsPath reports whether CORS applies to a request path.
func corsPath(p string) bool {
	p = path.Clean(p)
	if !strings.HasPrefix(p, "/api/v1/") {
		return false
	}
	for _, excluded := range corsExcluded {
		if excluded(p) {
			return false
		}
	}
	return true
}

// cors answers preflights from the listed origins and marks their bearer
// requests' responses readable; everything else passes through unchanged.
func (s *Server) cors(next http.Handler) http.Handler {
	if len(s.cfg.CORSOrigins) == 0 {
		return next
	}
	allowed := make(map[string]bool, len(s.cfg.CORSOrigins))
	for _, o := range s.cfg.CORSOrigins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !corsPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		h := w.Header()
		h.Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if !allowed[strings.ToLower(origin)] {
			next.ServeHTTP(w, r)
			return
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Methods", corsMethods)
			h.Set("Access-Control-Allow-Headers", corsHeaders)
			h.Set("Access-Control-Max-Age", corsMaxAge)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Expose-Headers", corsExpose)
		}
		next.ServeHTTP(w, r)
	})
}
