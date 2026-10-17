// Package web serves the compiled single-page application embedded in the binary.
package web

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// Options adjust the served page.
type Options struct {
	// NoIndex adds <meta name="robots" content="noindex"> to the page (demo
	// instances, OpenSpec `demo-sandboxes` D5). Other instances are unchanged.
	NoIndex bool
}

// Handler serves static assets with long-lived caching for hashed files and
// falls back to index.html for client-side routes.
func Handler() http.Handler { return HandlerWith(Options{}) }

// noIndexMeta is inserted right after <head> when Options.NoIndex is set.
const noIndexMeta = `<meta name="robots" content="noindex">`

// HandlerWith is Handler with options.
func HandlerWith(o Options) http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return handlerFor(sub, o)
}

// handlerFor serves the built app from sub.
func handlerFor(sub fs.FS, o Options) http.Handler {
	fileServer := http.FileServer(http.FS(sub))
	index, _ := fs.ReadFile(sub, "index.html")
	if o.NoIndex && index != nil {
		index = InjectNoIndex(index)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		// The page is always served from memory: http.FileServer answers
		// /index.html with a redirect to "/", and the service worker precaches
		// index.html for navigations, which WebKit refuses to serve when the
		// cached response was redirected. With NoIndex this is also the noindex copy.
		if p == "index.html" {
			p = ""
		}
		if p != "" {
			if f, err := sub.Open(p); err == nil {
				stat, statErr := f.Stat()
				f.Close()
				if statErr == nil && !stat.IsDir() {
					if strings.HasPrefix(p, "assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					} else if strings.HasSuffix(p, ".js") {
						// Service worker scripts (sw.js, registerSW.js, push-sw.js) must never
						// be cached: a CDN in front (Cloudflare gives .js a 4 h TTL and rewrites
						// no-cache) would keep phones on the previous release.
						w.Header().Set("Cache-Control", "no-store")
						w.Header().Set("CDN-Cache-Control", "no-store")
					} else {
						w.Header().Set("Cache-Control", "no-cache")
					}
					fileServer.ServeHTTP(w, r)
					return
				}
			}
		}
		// A missing file is a 404, never the page: a tab still running the previous
		// release asks for its old chunks, and an HTML answer to a script request
		// fails in ways the app cannot tell from being offline. Only extension-less
		// paths are client-side routes (client-sync-robustness).
		if p == "assets" || strings.HasPrefix(p, "assets/") || path.Ext(p) != "" {
			http.NotFound(w, r)
			return
		}
		if index == nil {
			http.Error(w, "OpenTodo frontend is not built. Run `make web` and rebuild the binary.", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		w.Write(index)
	})
}

// InjectNoIndex returns page with the robots noindex meta tag after <head>.
func InjectNoIndex(page []byte) []byte {
	i := bytes.Index(page, []byte("<head>"))
	if i < 0 {
		return page
	}
	i += len("<head>")
	out := make([]byte, 0, len(page)+len(noIndexMeta))
	out = append(out, page[:i]...)
	out = append(out, noIndexMeta...)
	return append(out, page[i:]...)
}
