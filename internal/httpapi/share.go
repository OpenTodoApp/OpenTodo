package httpapi

import (
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
)

// maxShareField bounds each text field of a share sheet POST read by the fallback.
const maxShareField = 64 << 10

// handleSharePost is the fallback for the share sheet's POST /share (OpenSpec
// attachments, design D9) when the app's service worker is not active yet (the
// app was installed but not opened since the update). The worker normally
// answers the POST on the device; here the text fields are carried over to the
// capture screen and the files, which never reach the account this way, are
// reported as lost with files=lost. Reading stops at the first file part.
func (s *Server) handleSharePost(w http.ResponseWriter, r *http.Request) {
	q := url.Values{}
	lost := false
	if mt, params, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err == nil && mt == "multipart/form-data" && params["boundary"] != "" {
		mr := multipart.NewReader(r.Body, params["boundary"])
		for {
			p, err := mr.NextPart()
			if err != nil {
				break
			}
			name := p.FormName()
			if p.FileName() != "" {
				lost = true
				break
			}
			if name == "title" || name == "text" || name == "url" {
				b, err := io.ReadAll(io.LimitReader(p, maxShareField+1))
				if err == nil && len(b) <= maxShareField {
					q.Set(name, string(b))
				}
			}
		}
	} else if err := r.ParseForm(); err == nil {
		for _, k := range []string{"title", "text", "url"} {
			if v := r.PostForm.Get(k); v != "" && len(v) <= maxShareField {
				q.Set(k, v)
			}
		}
	} else {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			lost = true
		}
	}
	if lost {
		q.Set("files", "lost")
	}
	target := "/share"
	if len(q) > 0 {
		target += "?" + strings.ReplaceAll(q.Encode(), "+", "%20")
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}
