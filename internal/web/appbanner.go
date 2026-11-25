package web

import (
	"bytes"
	"html"
	"net/url"
	"strings"
)

// AppStoreID is the App Store id of the OpenTodo app for iPhone and iPad.
const AppStoreID = "6832200428"

// TaskPageID returns the task id of a task page path ("task/<id>", cleaned and
// without the leading slash), or "" for any other path (ios-app-banner D2).
func TaskPageID(p string) string {
	id, ok := strings.CutPrefix(p, "task/")
	if !ok || id == "" || strings.Contains(id, "/") {
		return ""
	}
	return id
}

// AppBannerArgument is the address handed to the iPhone app: the task's page
// under the server's base URL, its id one escaped path segment. A comma would
// end the banner's argument early, so it is escaped too (ios-app-banner D3).
func AppBannerArgument(base, id string) string {
	return strings.ReplaceAll(strings.TrimRight(base, "/")+"/task/"+url.PathEscape(id), ",", "%2C")
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
