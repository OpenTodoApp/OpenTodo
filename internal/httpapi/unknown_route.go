package httpapi

import (
	"net/http"
	"strings"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// ---- unknown API routes (OpenSpec change `api-method-not-allowed`) ----
//
// The `/api/` catch-all shadows ServeMux's own 405, so a request with the wrong
// method on a registered path used to read "unknown API route": the reply a
// proxy that turns a POST into a GET (a 301 or 302 redirect) produces, with
// nothing in it pointing at the cause (GitHub issue 501). The catch-all now
// asks the mux which methods the path is registered for: none is a 404 naming
// the method and path, some is a 405 with an Allow header.

// probeMethods are the methods a registered API path is checked for, in the
// order the Allow header lists them. A GET pattern also matches HEAD.
var probeMethods = []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions}

// catchAllPattern is the pattern of the catch-all itself.
const catchAllPattern = "/api/"

// allowedMethods lists the methods a route other than the catch-all serves for
// the request's path. Only the mux's matcher runs: no handler and no policy.
func (rt *routes) allowedMethods(r *http.Request) []string {
	var out []string
	for _, m := range probeMethods {
		probe := r.Clone(r.Context())
		probe.Method = m
		if _, pattern := rt.mux.Handler(probe); pattern != "" && pattern != catchAllPattern && servesPath(pattern, r.URL.Path) {
			out = append(out, m)
		}
	}
	return out
}

// servesPath is false when a generic collection pattern matched a path whose
// first segment is not a collection: /api/v1/{collection}/{id} matches every
// two-segment path, including the routes of a switched-off feature, which stay
// a 404 (push "disabled returns not found").
func servesPath(pattern, path string) bool {
	if !strings.Contains(pattern, "{collection}") {
		return true
	}
	name, _, _ := strings.Cut(strings.TrimPrefix(path, "/api/v1/"), "/")
	_, ok := opsync.Plural[name]
	return ok
}

// unknownAPIRoute answers a request no API route took.
func (rt *routes) unknownAPIRoute(w http.ResponseWriter, r *http.Request) {
	path := shown(r.URL.Path)
	method := shown(r.Method)
	if allowed := rt.allowedMethods(r); len(allowed) > 0 {
		list := strings.Join(allowed, ", ")
		w.Header().Set("Allow", list)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", method+" is not allowed on "+path+"; use "+list)
		return
	}
	writeError(w, http.StatusNotFound, "not_found", "unknown API route: "+method+" "+path)
}

// shown is a request's path or method as an error message repeats it: never
// the query string (it can hold a token), no control characters, and short.
func shown(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
	if len(s) > 200 {
		s = textutil.Truncate(s, 200) + "…"
	}
	return s
}
