package web

import (
	"bytes"
	"fmt"
	"html"
	"strings"
)

// AppStoreID is the App Store id of the OpenTodo app for iPhone and iPad.
const AppStoreID = "6832200428"

// TaskPageID returns the task id of a task page's path as the request carries
// it, decoded ("/task/<id>"), or "" for any other path: a trailing slash, an id
// holding a "/" (an escaped %2F too) or a deeper path gets no banner
// (ios-app-banner D2). The service worker reads paths the same way.
func TaskPageID(p string) string {
	id, ok := strings.CutPrefix(p, "/task/")
	if !ok || id == "" || strings.Contains(id, "/") {
		return ""
	}
	return id
}

// AppBannerArgument is the address handed to the iPhone app: the task's page on
// origin, its id escaped to unreserved characters only (A-Z a-z 0-9 - . _ ~),
// so no comma ends the banner's argument and no quote leaves the attribute. The
// service worker escapes the same way (ios-app-banner D3, the shared vectors in
// web/src/lib/appBanner.vectors.json).
func AppBannerArgument(origin, id string) string {
	var b strings.Builder
	b.WriteString(strings.TrimRight(origin, "/") + "/task/")
	for i := 0; i < len(id); i++ {
		c := id[i]
		if 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

// InjectAppBanner returns page with Safari's Smart App Banner right after
// <head>; argument, when not empty, is the address the app opens. A page
// without <head> is returned unchanged.
func InjectAppBanner(page []byte, argument string) []byte {
	i := bytes.Index(page, []byte("<head>"))
	if i < 0 {
		return page
	}
	i += len("<head>")
	content := "app-id=" + AppStoreID
	if argument != "" {
		content += ", app-argument=" + argument
	}
	meta := `<meta name="apple-itunes-app" content="` + html.EscapeString(content) + `">`
	out := make([]byte, 0, len(page)+len(meta))
	out = append(out, page[:i]...)
	out = append(out, meta...)
	return append(out, page[i:]...)
}
