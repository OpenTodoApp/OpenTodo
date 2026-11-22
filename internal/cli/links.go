package cli

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/quickadd"
)

// canonicalLink is a link in the form the web app stores for a plain ASCII URL
// (new URL(x).href): scheme and host lowercased, no default port, "/" for an
// empty path; host is the name the app gives it (u.hostname, IPv6 bracketed).
// A link Go cannot parse is sent as typed, for the server to judge.
func canonicalLink(raw string) (href, host string) {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return raw, quickadd.LinkHost(raw)
	}
	u.Scheme, u.Host = strings.ToLower(u.Scheme), strings.ToLower(u.Host)
	if p := u.Port(); (u.Scheme == "https" && p == "443") || (u.Scheme == "http" && p == "80") {
		u.Host = strings.TrimSuffix(u.Host, ":"+p)
	}
	if u.Path == "" && u.RawPath == "" {
		u.Path = "/"
	}
	host = u.Hostname()
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return u.String(), host
}

// attachLinks posts the links a --natural title named as link attachments of the
// new task (quick-add-links D3), in order, named after their host as the app
// names them, each once and never the --origin-url again. With an idempotency
// key K the n-th link sends K.l<n>, so a retry converges to one set.
// A line with links never reuses a reusable list's item (cmdAdd turns reuse off,
// quick-add-links D2): the reused item would take the links.
func attachLinks(ctx context.Context, c *client, taskID string, links []string, origin string, keyed bool, key string) error {
	seen := map[string]bool{}
	if origin != "" {
		href, _ := canonicalLink(origin)
		seen[href] = true
	}
	type link struct{ href, host string }
	var todo []link
	for _, raw := range links {
		if href, host := canonicalLink(raw); !seen[href] {
			seen[href] = true
			todo = append(todo, link{href, host})
		}
	}
	for n, l := range todo {
		var headers map[string]string
		if keyed {
			headers = map[string]string{"Idempotency-Key": fmt.Sprintf("%s.l%d", key, n+1)}
		}
		if _, _, err := c.do(ctx, http.MethodPost, "/tasks/"+taskID+"/attachments", map[string]any{"url": l.href, "name": l.host}, headers); err != nil {
			left := make([]string, 0, len(todo)-n)
			for _, r := range todo[n:] {
				left = append(left, r.href)
			}
			note := fmt.Sprintf("the task was created: %s; not attached: %s", taskID, strings.Join(left, " "))
			var ee *exitError
			if errors.As(err, &ee) {
				return &exitError{code: ee.code, jsonCode: ee.jsonCode, envelope: ee.envelope, msg: fmt.Sprintf("%s (%s)", ee.msg, note)}
			}
			return fmt.Errorf("%w (%s)", err, note)
		}
	}
	return nil
}
