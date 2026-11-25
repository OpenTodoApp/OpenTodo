package httpapi

import (
	"net/http"
	"path"
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
		if r.Method != http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}
		id := web.TaskPageID(strings.TrimPrefix(path.Clean(r.URL.Path), "/"))
		if id == "" {
			next.ServeHTTP(w, r)
			return
		}
		cw := &captureWriter{header: http.Header{}, status: http.StatusOK}
		next.ServeHTTP(cw, r)
		body := cw.body.Bytes()
		h := w.Header()
		for k, v := range cw.header {
			h[k] = v
		}
		if cw.status == http.StatusOK && strings.HasPrefix(cw.header.Get("Content-Type"), "text/html") {
			// Without a base URL the banner still opens the app, at its start (D3).
			argument := ""
			if s.cfg.BaseURL != nil {
				argument = web.AppBannerArgument(s.cfg.BaseURL.String(), id)
			}
			body = web.InjectAppBanner(body, argument)
			h.Set("Content-Length", strconv.Itoa(len(body)))
		}
		w.WriteHeader(cw.status)
		_, _ = w.Write(body)
	})
}
