// Package web serves the compiled single-page application embedded in the binary.
package web

import (
	"bytes"
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
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
// falls back to index.html for client-side routes. Every file is served byte for
// byte as the build's signed list names it (OpenSpec change signed-web-app,
// design D7): /index.html is the built page, never the noindex or branded copy
// that navigations get, app-manifest.json is never cached, and every answer
// carries no-transform so caching proxies leave the files as they are.
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
	built, _ := fs.ReadFile(sub, "index.html")
	index := built
	if o.NoIndex && index != nil {
		index = InjectNoIndex(index)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		// /index.html is served from memory as built: http.FileServer answers it
		// with a redirect to "/", and the service worker downloads it to serve
		// navigations, which WebKit refuses to do from a redirected response. It
		// must be the exact bytes of the signed list, so never the noindex copy.
		if p == "index.html" && built != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache, no-transform")
			w.WriteHeader(http.StatusOK)
			if r.Method != http.MethodHead {
				w.Write(built)
			}
			return
		}
		if p != "" {
			if f, err := sub.Open(p); err == nil {
				stat, statErr := f.Stat()
				f.Close()
				if statErr == nil && !stat.IsDir() {
					if strings.HasPrefix(p, "assets/") {
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable, no-transform")
					} else if strings.HasSuffix(p, ".js") || p == "app-manifest.json" {
						// Service worker scripts (sw.js, registerSW.js, push-sw.js) and the
						// signed file list must never be cached: a CDN in front (Cloudflare
						// gives .js a 4 h TTL and rewrites no-cache) would keep phones on the
						// previous release.
						w.Header().Set("Cache-Control", "no-store, no-transform")
						w.Header().Set("CDN-Cache-Control", "no-store")
					} else {
						w.Header().Set("Cache-Control", "no-cache, no-transform")
					}
					// The theme credits (theme-catalogue D4) are shown as text, never offered as a download.
					if strings.HasSuffix(p, ".md") {
						w.Header().Set("Content-Type", "text/plain; charset=utf-8")
					}
					if strings.HasPrefix(p, "assets/") && serveCompressed(w, r, sub, p) {
						return
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
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.WriteHeader(http.StatusOK)
		w.Write(index)
	})
}

// serveCompressed answers with the build's gzip copy of p (OpenSpec change
// compressed-static-assets, D2) when there is one, the request accepts gzip and asks
// for the whole file, and reports whether it did. Every answer for a file with a
// copy says Vary: Accept-Encoding, so a shared cache keeps the two forms apart. The
// browser decodes the copy back to the file the signed list names (D3).
func serveCompressed(w http.ResponseWriter, r *http.Request, sub fs.FS, p string) bool {
	gz, err := fs.ReadFile(sub, p+".gz")
	if err != nil {
		return false
	}
	w.Header().Add("Vary", "Accept-Encoding")
	if r.Header.Get("Range") != "" || !acceptsGzip(r.Header.Values("Accept-Encoding")) {
		return false
	}
	h := w.Header()
	if h.Get("Content-Type") == "" {
		ct := mime.TypeByExtension(path.Ext(p))
		if ct == "" {
			ct = "application/octet-stream"
		}
		h.Set("Content-Type", ct)
	}
	h.Set("Content-Encoding", "gzip")
	h.Set("Content-Length", strconv.Itoa(len(gz)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(gz)
	}
	return true
}

// acceptsGzip reports whether Accept-Encoding allows gzip: named (or as x-gzip), or
// covered by "*", with a quality above zero; an explicit gzip;q=0 refuses it.
func acceptsGzip(values []string) bool {
	star := false
	for _, v := range values {
		for _, part := range strings.Split(v, ",") {
			name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
			name = strings.ToLower(strings.TrimSpace(name))
			q := 1.0
			for _, prm := range strings.Split(params, ";") {
				k, val, ok := strings.Cut(strings.TrimSpace(prm), "=")
				if ok && strings.EqualFold(strings.TrimSpace(k), "q") {
					if f, err := strconv.ParseFloat(strings.TrimSpace(val), 64); err == nil {
						q = f
					}
				}
			}
			switch name {
			case "gzip", "x-gzip":
				return q > 0
			case "*":
				star = q > 0
			}
		}
	}
	return star
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
