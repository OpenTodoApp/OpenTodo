package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/web"
)

// appBannerWeb wraps the web app: the page served for a task's address
// (/task/<id>, the link in calendar feeds and synced events) carries Safari's
// Smart App Banner, which opens the iPhone app at that task when it is
// installed (ios-app-banner D1). Every other answer passes straight through.
// The server makes no request for it: Safari draws the banner itself.
func (s *Server) appBannerWeb(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := web.TaskPageID(r.URL.Path)
		if (r.Method != http.MethodGet && r.Method != http.MethodHead) || id == "" {
			next.ServeHTTP(w, r)
			return
		}
		// A HEAD gets the headers of the GET, Content-Length included, as brandedWeb answers it.
		get := r
		if r.Method == http.MethodHead {
			get = r.Clone(r.Context())
			get.Method = http.MethodGet
		}
		cw := &captureWriter{header: http.Header{}, status: http.StatusOK}
		next.ServeHTTP(cw, get)
		body := cw.body.Bytes()
		h := w.Header()
		for k, v := range cw.header {
			h[k] = v
		}
		if cw.status == http.StatusOK && strings.HasPrefix(cw.header.Get("Content-Type"), "text/html") {
			// The base URL's origin names the server; without one, the banner
			// still opens the app, at its start (D3).
			argument := ""
			if origin := s.cfg.Origin(); origin != "" {
				argument = web.AppBannerArgument(origin, id)
			}
			body = web.InjectAppBanner(body, argument)
			h.Set("Content-Length", strconv.Itoa(len(body)))
		}
		w.WriteHeader(cw.status)
		if r.Method != http.MethodHead {
			_, _ = w.Write(body)
		}
	})
}
