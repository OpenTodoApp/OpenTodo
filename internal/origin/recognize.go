package origin

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// The recognition table (design D3): exact host names, path shapes anchored at
// the start of the path, no network. A path may continue after the issue
// number (a pull request's /files, a Linear issue's slug); the query and the
// fragment are ignored. Self-hosted trackers are not recognised: their URLs are
// plain "url" origins. Keep in step with RULES in web/src/lib/taskOrigin.ts; the
// shared vectors pin both.
var (
	githubPath = regexp.MustCompile(`^/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/(issues|pull)/([1-9][0-9]{0,9})(?:/.*)?$`)
	gitlabPath = regexp.MustCompile(`^/((?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+)/-/(issues|merge_requests)/([1-9][0-9]{0,9})(?:/.*)?$`)
	jiraPath   = regexp.MustCompile(`^/browse/([A-Za-z][A-Za-z0-9_]*-[1-9][0-9]{0,9})/?$`)
	linearPath = regexp.MustCompile(`^/([A-Za-z0-9_-]+)/issue/([A-Za-z][A-Za-z0-9]*-[1-9][0-9]{0,9})(?:/.*)?$`)
	jiraHost   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*\.atlassian\.net$`)
)

// Recognize reports the provider and issue id of a URL on a recognised issue
// host: {kind: "issue", provider, id, url}. The url member is rawURL as given
// (trimmed). It returns false for every other URL, including non-http(s) ones.
func Recognize(rawURL string) (Origin, bool) {
	rawURL = strings.TrimSpace(rawURL)
	if !ValidURL(rawURL) {
		return Origin{}, false
	}
	u, _ := url.Parse(rawURL)
	host := strings.ToLower(u.Hostname())
	path := u.EscapedPath()
	issue := func(provider, id string) (Origin, bool) {
		return Origin{Kind: KindIssue, Provider: provider, ID: id, URL: rawURL}, true
	}
	switch {
	case host == "github.com":
		if m := githubPath.FindStringSubmatch(path); m != nil {
			return issue("github", m[1]+"/"+m[2]+"#"+m[4])
		}
	case host == "gitlab.com":
		if m := gitlabPath.FindStringSubmatch(path); m != nil {
			sep := "#"
			if m[2] == "merge_requests" {
				sep = "!"
			}
			return issue("gitlab", m[1]+sep+m[3])
		}
	case jiraHost.MatchString(host):
		if m := jiraPath.FindStringSubmatch(path); m != nil {
			return issue("jira", strings.ToUpper(m[1]))
		}
	case host == "linear.app":
		if m := linearPath.FindStringSubmatch(path); m != nil {
			return issue("linear", strings.ToUpper(m[2]))
		}
	}
	return Origin{}, false
}

// ErrNotHTTP is FromURL's error for a value that is not an http or https URL
// with a host (or is longer than MaxURL).
var ErrNotHTTP = errors.New("origin url must be an http or https URL of at most 2048 bytes")

// FromURL is the origin of a task made from rawURL: the recognised issue, else
// {kind: "url", url}. A non-empty title is kept, cut to MaxTitle characters as
// the capture screen cuts it. Callers that take a URL from a person (the CLI,
// the agent tools, a poller) use it so every path derives the same origin.
func FromURL(rawURL, title string) (Origin, error) {
	rawURL = strings.TrimSpace(rawURL)
	if !ValidURL(rawURL) {
		return Origin{}, ErrNotHTTP
	}
	o, ok := Recognize(rawURL)
	if !ok {
		o = Origin{Kind: KindURL, URL: rawURL}
	}
	o.Title = CutTitle(title)
	return o, nil
}

// CutTitle trims title and cuts it to MaxTitle characters.
func CutTitle(title string) string {
	title = strings.TrimSpace(title)
	if r := []rune(title); len(r) > MaxTitle {
		title = strings.TrimSpace(string(r[:MaxTitle]))
	}
	return title
}
