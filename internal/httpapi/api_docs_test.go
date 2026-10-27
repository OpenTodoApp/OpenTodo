package httpapi

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// API contract (wave 5 of the 2026-10 audit, M4): every route of the router's
// own table is described in docs/api.md, so a new endpoint cannot ship
// undocumented. A route counts as described when the doc names its method and
// path, either in an endpoint table (| GET, PATCH | `/api/v1/tasks/{id}` | …) or
// in running text (`GET /api/v1/tasks/{id}`, or relative to /api/v1:
// `POST /mfa/totp/enroll`). Wildcard names may differ ({id} for {taskId}),
// "…/x" continues the path before it, and a path ending in "…" covers
// everything below it (`/api/v1/projects…`).

// undocumentedOK are the routes that are not part of the HTTP API, each with
// the reason; every other route must be in docs/api.md.
var undocumentedOK = map[string]string{
	"/":                    "the web app (internal/web)",
	"GET /public/":         "the web app's public list page; its data comes from the public-link API",
	"GET /t/":              "the web app's task page; its data comes from the task page API",
	"POST /share":          "the PWA share target: redirects into the app (docs/capture.md)",
	"/api/":                "the 404 not_found answer of every unknown API path",
	"/dav":                 "CalDAV (docs/caldav.md)",
	"/dav/":                "CalDAV (docs/caldav.md)",
	"/principals":          "CalDAV discovery (docs/caldav.md)",
	"/principals/":         "CalDAV discovery (docs/caldav.md)",
	"/.well-known/caldav":  "CalDAV discovery (docs/caldav.md)",
	"/.well-known/caldav/": "CalDAV discovery (docs/caldav.md)",
	"OPTIONS /{$}":         "CalDAV discovery on the server root (docs/caldav.md)",
	"PROPFIND /{$}":        "CalDAV discovery on the server root (docs/caldav.md)",
}

// docRoute is one method and path the doc names.
type docRoute struct {
	methods []string // empty: any method
	path    string   // with every wildcard as {}
	prefix  bool     // the path ended in "…": it covers everything below it
}

var (
	docWildcard = regexp.MustCompile(`\{[^}]*\}`)
	docSpan     = regexp.MustCompile("`([^`]+)`")
	docMethod   = regexp.MustCompile(`\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|PROPFIND|PROPPATCH|REPORT|MKCOL|MKCALENDAR)\b`)
	docInline   = regexp.MustCompile(`^((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|PROPFIND|REPORT)(?:[|/](?:GET|POST|PUT|PATCH|DELETE))*) ((?:/|…/)\S*)`)
)

// docRoots are the server's paths outside /api/v1; any other doc path is
// relative to /api/v1.
var docRoots = []string{"/api/", "/healthz", "/dav", "/.well-known/", "/feeds/", "/public/", "/t/", "/share", "/branding/", "/mcp", "/principals"}

// resolvePath expands a doc path into the routes it may name: "…/x/y"
// continues prev at its segment "x", or else as a child or a sibling of its
// last segment; a path outside docRoots gets /api/v1.
func resolvePath(p, prev string) (paths []string, prefix bool) {
	p = strings.SplitN(p, "?", 2)[0]
	p = strings.TrimRight(p, ".,;:)")
	cands := []string{p}
	if rest, ok := strings.CutPrefix(p, "…/"); ok && prev != "" {
		segs := strings.Split(strings.TrimSuffix(prev, "/"), "/")
		first := strings.SplitN(rest, "/", 2)[0]
		cands = []string{strings.Join(segs, "/") + "/" + rest, strings.Join(segs[:len(segs)-1], "/") + "/" + rest}
		for i, sg := range segs {
			if sg == first {
				cands = []string{strings.Join(segs[:i], "/") + "/" + rest}
				break
			}
		}
	}
	for _, c := range cands {
		if !strings.HasPrefix(c, "/") {
			continue
		}
		prefix = strings.HasSuffix(c, "…")
		c = strings.TrimSuffix(c, "…")
		rooted := false
		for _, r := range docRoots {
			rooted = rooted || strings.HasPrefix(c, r)
		}
		if !rooted {
			c = "/api/v1" + c
		}
		paths = append(paths, c)
	}
	return paths, prefix
}

// docRoutes reads every method and path docs/api.md names.
func docRoutes(t *testing.T) []docRoute {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "docs", "api.md"))
	if err != nil {
		t.Fatal(err)
	}
	var out []docRoute
	add := func(methods []string, raw, prev string) string {
		paths, prefix := resolvePath(raw, prev)
		for _, p := range paths {
			out = append(out, docRoute{methods: methods, path: docWildcard.ReplaceAllString(p, "{}"), prefix: prefix})
		}
		if len(paths) == 0 {
			return prev
		}
		return paths[0]
	}
	for _, line := range strings.Split(string(b), "\n") {
		prev := ""
		// A table row: | METHOD[, METHOD] | `path`[, `…/more`] | …, or
		// | `GET` / `PUT /path` | …: the methods of the first cell, the paths of
		// the first cell that has one.
		if strings.HasPrefix(line, "|") {
			cells := strings.Split(strings.ReplaceAll(line, `\|`, "\x00"), "|")
			if len(cells) > 3 {
				if methods := docMethod.FindAllString(cells[1], -1); len(methods) > 0 {
					for _, cell := range cells[1:3] {
						found := false
						for _, m := range docSpan.FindAllStringSubmatch(cell, -1) {
							for _, raw := range strings.Fields(m[1]) {
								if strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "…/") {
									prev, found = add(methods, raw, prev), true
								}
							}
						}
						if found {
							break
						}
					}
				}
			}
		}
		// Running text: `GET /api/v1/x`, `GET|PUT /settings/x`, `PATCH …/grants/{id}`.
		for _, m := range docSpan.FindAllStringSubmatch(line, -1) {
			if im := docInline.FindStringSubmatch(m[1]); im != nil {
				methods := strings.FieldsFunc(im[1], func(r rune) bool { return r == '|' || r == '/' })
				prev = add(methods, im[2], prev)
			}
		}
	}
	return out
}

func (d docRoute) covers(method, path string) bool {
	if method != "" && len(d.methods) > 0 {
		ok := false
		for _, m := range d.methods {
			ok = ok || m == method
		}
		if !ok {
			return false
		}
	}
	if d.prefix {
		return strings.HasPrefix(path, d.path)
	}
	return strings.TrimSuffix(path, "/") == strings.TrimSuffix(d.path, "/")
}

func TestEveryRouteIsInTheAPIDoc(t *testing.T) {
	docs := docRoutes(t)
	table := routeTableOf(t, true)
	registered := map[string]bool{}
	for _, e := range table {
		registered[e.pattern] = true
	}
	for p := range undocumentedOK {
		if !registered[p] {
			t.Errorf("undocumentedOK lists %s, which the router no longer registers", p)
		}
	}
	var missing []string
	for _, e := range table {
		if _, ok := undocumentedOK[e.pattern]; ok {
			continue
		}
		method, path, ok := strings.Cut(e.pattern, " ")
		if !ok {
			method, path = "", e.pattern
		}
		path = docWildcard.ReplaceAllString(strings.TrimSuffix(path, "{$}"), "{}")
		found := false
		for _, d := range docs {
			if d.covers(method, path) {
				found = true
				break
			}
		}
		if !found {
			missing = append(missing, e.pattern)
		}
	}
	sort.Strings(missing)
	for _, p := range missing {
		t.Errorf("%s is not in docs/api.md (add it to an endpoint table, or to undocumentedOK with the reason)", p)
	}
}

// The doc forms the contract test reads.
func TestAPIDocForms(t *testing.T) {
	cases := []struct {
		raw, prev string
		want      []string
		prefix    bool
	}{
		{"/api/v1/tasks/{id}", "", []string{"/api/v1/tasks/{id}"}, false},
		{"/mfa/totp/enroll", "", []string{"/api/v1/mfa/totp/enroll"}, false},
		{"/healthz", "", []string{"/healthz"}, false},
		{"/api/v1/projects…", "", []string{"/api/v1/projects"}, true},
		{"…/grants/{groupId}", "/api/v1/projects/{id}/grants", []string{"/api/v1/projects/{id}/grants/{groupId}"}, false},
		{"…/transfer", "/api/v1/workspaces/{id}/leave", []string{"/api/v1/workspaces/{id}/leave/transfer", "/api/v1/workspaces/{id}/transfer"}, false},
		{"/api/v1/calendar-feeds/events?from=YYYY-MM-DD", "", []string{"/api/v1/calendar-feeds/events"}, false},
	}
	for _, c := range cases {
		got, prefix := resolvePath(c.raw, c.prev)
		if strings.Join(got, " ") != strings.Join(c.want, " ") || prefix != c.prefix {
			t.Errorf("resolvePath(%q, %q) = %q, %v; want %q, %v", c.raw, c.prev, got, prefix, c.want, c.prefix)
		}
	}
	d := docRoute{methods: []string{"GET", "PATCH"}, path: "/api/v1/tasks/{}"}
	if !d.covers("PATCH", "/api/v1/tasks/{}") || d.covers("DELETE", "/api/v1/tasks/{}") || d.covers("GET", "/api/v1/tasks") {
		t.Error("covers: a table row names exactly its methods and path")
	}
	if n := len(docRoutes(t)); n < 250 {
		t.Errorf("docs/api.md: only %d routes read; has the doc's format changed?", n)
	}
}
