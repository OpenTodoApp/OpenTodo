package importer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Importing from Todoist with an API token (OpenSpec change
// todoist-api-import): every Todoist account, free ones included, can create a
// token, while backups need Premium. The server asks Todoist's sync endpoint
// for the account's projects, sections, labels, tasks and comments once, with
// the token the person pasted, and hands the answer back; the browser then
// imports it like a file through the json-items profile, with the same preview,
// limits and Undo. The token is used for that one request and never stored.

// TodoistAPIBase is Todoist's API; a variable so tests can point it at a fake.
var TodoistAPIBase = "https://api.todoist.com"

// Errors of FetchTodoist, each answered with its own code by the route.
var (
	ErrTodoistToken    = errors.New("Todoist refused the token")
	ErrTodoistTooLarge = errors.New("the Todoist account is larger than the import limit")
	ErrTodoistFailed   = errors.New("Todoist could not be reached")
)

// todoistResources are the kinds asked for: what json-items reads.
const todoistResources = `["projects","sections","labels","items","notes"]`

// FetchTodoist asks Todoist's sync endpoint for every resource the import
// reads, with token, and returns the JSON answer (at most limit bytes).
func FetchTodoist(ctx context.Context, client *http.Client, token string, limit int64) ([]byte, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > 200 || strings.ContainsAny(token, " \t\r\n") {
		return nil, ErrTodoistToken
	}
	form := url.Values{"sync_token": {"*"}, "resource_types": {todoistResources}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, TodoistAPIBase+"/api/v1/sync", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTodoistFailed, err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, ErrTodoistToken
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("%w: status %d", ErrTodoistFailed, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTodoistFailed, err)
	}
	if int64(len(body)) > limit {
		return nil, ErrTodoistTooLarge
	}
	if !(itemsProfile{}).Detect(body) {
		return nil, fmt.Errorf("%w: unexpected answer", ErrTodoistFailed)
	}
	return body, nil
}
