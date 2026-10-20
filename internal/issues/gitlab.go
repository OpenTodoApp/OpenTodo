package issues

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// gitlabClient reads GitLab (gitlab.com or self-hosted) issues over REST v4
// (design D1). The issues API never lists merge requests.
type gitlabClient struct{ api *api }

type gitlabIssue struct {
	IID        int      `json:"iid"`
	Title      string   `json:"title"`
	Body       string   `json:"description"`
	WebURL     string   `json:"web_url"`
	State      string   `json:"state"`
	ClosedAt   string   `json:"closed_at"`
	UpdatedAt  string   `json:"updated_at"`
	Labels     []string `json:"labels"`
	References struct {
		Full string `json:"full"`
	} `json:"references"`
}

// Account asks GET /user for the user name, then lists one assigned issue to
// learn whether the token may read issues.
func (g *gitlabClient) Account(ctx context.Context) (Account, error) {
	resp, err := g.api.get(ctx, "/user", nil, "")
	if err != nil {
		return Account{}, err
	}
	var u struct {
		Username string `json:"username"`
	}
	if json.Unmarshal(resp.body, &u) != nil || u.Username == "" {
		return Account{}, &Error{ReasonInvalidAnswer}
	}
	acc := Account{Login: u.Username}
	_, err = g.api.get(ctx, "/issues", url.Values{"scope": {"assigned_to_me"}, "state": {"opened"}, "per_page": {"1"}}, "")
	var pe *Error
	switch {
	case err == nil:
		acc.CanReadIssues = true
	case errors.As(err, &pe) && (pe.Reason == ReasonUnauthorized || pe.Reason == ReasonNotFoundRemote):
	default:
		return acc, err
	}
	return acc, nil
}

// List reads one page: GET /issues?scope=assigned_to_me, or
// GET /projects/{path}/issues?assignee_username=<login> per project, oldest
// change first.
func (g *gitlabClient) List(ctx context.Context, r Request) (*Page, error) {
	q := url.Values{"order_by": {"updated_at"}, "sort": {"asc"}, "per_page": {strconv.Itoa(PerPage)}, "page": {strconv.Itoa(max(r.Page, 1))}}
	if !r.All {
		q.Set("state", "opened")
	}
	if r.Since > 0 {
		q.Set("updated_after", isoTime(r.Since))
	}
	if len(r.Labels) > 0 {
		q.Set("labels", strings.Join(r.Labels, ","))
	}
	path := "/issues"
	if r.Repo == "" {
		q.Set("scope", "assigned_to_me")
	} else {
		path = "/projects/" + url.PathEscape(r.Repo) + "/issues"
		q.Set("assignee_username", r.Login)
	}
	resp, err := g.api.get(ctx, path, q, r.ETag)
	if err != nil {
		return nil, err
	}
	if resp.notModified {
		return &Page{NotModified: true, ETag: r.ETag}, nil
	}
	var raw []gitlabIssue
	if err := json.Unmarshal(resp.body, &raw); err != nil {
		return nil, &Error{ReasonInvalidAnswer}
	}
	p := &Page{ETag: resp.header.Get("ETag"), More: hasNext(resp.header, len(raw))}
	for _, it := range raw {
		key := it.References.Full
		if key == "" && r.Repo != "" && it.IID > 0 {
			key = r.Repo + "#" + strconv.Itoa(it.IID)
		}
		if key == "" || !strings.Contains(key, "#") {
			continue
		}
		is := Issue{Key: key, Title: it.Title, Body: it.Body, URL: it.WebURL, State: Open, UpdatedAt: parseTime(it.UpdatedAt), Labels: it.Labels}
		if it.State == "closed" {
			is.State, is.ClosedAt = Closed, parseTime(it.ClosedAt)
		}
		p.Issues = append(p.Issues, is)
	}
	return p, nil
}
