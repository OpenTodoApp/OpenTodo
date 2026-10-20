package issues

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// githubClient reads GitHub and GitHub Enterprise issues over REST (design D1).
type githubClient struct{ api *api }

type githubIssue struct {
	Number        int    `json:"number"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	HTMLURL       string `json:"html_url"`
	State         string `json:"state"`
	ClosedAt      string `json:"closed_at"`
	UpdatedAt     string `json:"updated_at"`
	RepositoryURL string `json:"repository_url"`
	Labels        []struct {
		Name string `json:"name"`
	} `json:"labels"`
	PullRequest json.RawMessage `json:"pull_request"`
}

// Account asks GET /user for the login, then lists one assigned issue to learn
// whether the token may read issues (a fine-grained token without Issues: read
// passes the first request).
func (g *githubClient) Account(ctx context.Context) (Account, error) {
	resp, err := g.api.get(ctx, "/user", nil, "")
	if err != nil {
		return Account{}, err
	}
	var u struct {
		Login string `json:"login"`
	}
	if json.Unmarshal(resp.body, &u) != nil || u.Login == "" {
		return Account{}, &Error{ReasonInvalidAnswer}
	}
	acc := Account{Login: u.Login}
	_, err = g.api.get(ctx, "/issues", url.Values{"filter": {"assigned"}, "state": {"open"}, "per_page": {"1"}}, "")
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

// List reads one page: GET /issues?filter=assigned for the assigned scope,
// GET /repos/{owner}/{repo}/issues?assignee=<login> per repository, oldest
// change first. Pull requests are dropped.
func (g *githubClient) List(ctx context.Context, r Request) (*Page, error) {
	q := url.Values{"sort": {"updated"}, "direction": {"asc"}, "per_page": {strconv.Itoa(PerPage)}, "page": {strconv.Itoa(max(r.Page, 1))}}
	q.Set("state", "open")
	if r.All {
		q.Set("state", "all")
	}
	if r.Since > 0 {
		q.Set("since", isoTime(r.Since))
	}
	if len(r.Labels) > 0 {
		q.Set("labels", strings.Join(r.Labels, ","))
	}
	path := "/issues"
	if r.Repo == "" {
		q.Set("filter", "assigned")
	} else {
		owner, name, _ := strings.Cut(r.Repo, "/")
		path = "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(name) + "/issues"
		q.Set("assignee", r.Login)
	}
	resp, err := g.api.get(ctx, path, q, r.ETag)
	if err != nil {
		return nil, err
	}
	if resp.notModified {
		return &Page{NotModified: true, ETag: r.ETag}, nil
	}
	var raw []githubIssue
	if err := json.Unmarshal(resp.body, &raw); err != nil {
		return nil, &Error{ReasonInvalidAnswer}
	}
	p := &Page{ETag: resp.header.Get("ETag"), More: hasNext(resp.header, len(raw))}
	for _, it := range raw {
		if len(it.PullRequest) > 0 && string(it.PullRequest) != "null" {
			continue
		}
		repo := it.RepositoryURL
		if i := strings.LastIndex(repo, "/repos/"); i >= 0 {
			repo = repo[i+len("/repos/"):]
		} else {
			repo = r.Repo
		}
		if repo == "" || it.Number <= 0 {
			continue
		}
		is := Issue{Key: repo + "#" + strconv.Itoa(it.Number), Title: it.Title, Body: it.Body, URL: it.HTMLURL, State: Open,
			UpdatedAt: parseTime(it.UpdatedAt)}
		if it.State == "closed" {
			is.State, is.ClosedAt = Closed, parseTime(it.ClosedAt)
		}
		for _, l := range it.Labels {
			is.Labels = append(is.Labels, l.Name)
		}
		p.Issues = append(p.Issues, is)
	}
	return p, nil
}
