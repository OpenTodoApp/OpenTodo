package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/pixari/opentodo/internal/agenttools"
)

// Resources (design D4): static URIs for the project list and the three
// built-in views, templates for one project and one task. Every resource is
// built from the same reads as the tools, with the same exclusions.

type resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	MimeType    string `json:"mimeType"`
}

type resourceTemplate struct {
	URITemplate string `json:"uriTemplate"`
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	MimeType    string `json:"mimeType"`
}

const jsonMime = "application/json"

// IssuesURI is the read-only issue connections resource (issue-import D14).
const IssuesURI = "opentodo://integrations/issues"

func resourceList() []resource {
	tz := " Dates are evaluated in UTC; append ?tz=<IANA zone> to the URI for another time zone."
	return []resource{
		{URI: "opentodo://projects", Name: "projects", Title: "Projects", Description: "The user's active projects with open task counts.", MimeType: jsonMime},
		{URI: "opentodo://views/inbox", Name: "inbox", Title: "Inbox", Description: "Open tasks without a project that are not scheduled (no do-on date, start date or Someday).", MimeType: jsonMime},
		{URI: "opentodo://views/today", Name: "today", Title: "Today", Description: "Open tasks due today or overdue, overdue first." + tz, MimeType: jsonMime},
		{URI: "opentodo://views/upcoming", Name: "upcoming", Title: "Upcoming", Description: "Open tasks due after today, soonest first." + tz, MimeType: jsonMime},
		{URI: IssuesURI, Name: "issue-connections", Title: "Issue connections",
			Description: "The user's GitHub and GitLab issue connections with their state and last run, never a token. Read from the stored state; no request is made to the provider.", MimeType: jsonMime},
	}
}

func resourceTemplates() []resourceTemplate {
	return []resourceTemplate{
		{URITemplate: "opentodo://projects/{id}", Name: "project", Title: "Project", Description: "One project with its sections and open tasks.", MimeType: jsonMime},
		{URITemplate: "opentodo://tasks/{id}", Name: "task", Title: "Task", Description: "One task with its description, subtasks and comments.", MimeType: jsonMime},
	}
}

type resourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text"`
}

func notFound(uri string) *rpcError {
	return &rpcError{Code: CodeResourceNotFound, Message: "resource not found", Data: map[string]string{"uri": uri}}
}

func (s *Server) readResource(ctx context.Context, userID string, params json.RawMessage) (any, error) {
	var p struct {
		URI string `json:"uri"`
	}
	if len(params) == 0 || json.Unmarshal(params, &p) != nil || p.URI == "" {
		return nil, invalidParams("uri: the resource URI is required")
	}
	u, err := url.Parse(p.URI)
	if err != nil || u.Scheme != "opentodo" {
		return nil, notFound(p.URI)
	}
	loc, err := agenttools.ParseZone(u.Query().Get("tz"), "tz")
	if err != nil {
		var ae *agenttools.ArgError
		if errors.As(err, &ae) {
			return nil, invalidParams(ae.Msg)
		}
		return nil, err
	}
	id := strings.TrimPrefix(u.Path, "/")
	var payload any
	found := true
	switch {
	case u.Host == "integrations" && id == "issues":
		payload = map[string]any{"enabled": false, "connections": []any{}}
		if s.issues != nil {
			payload, err = s.issues(ctx, userID)
		}
	case u.Host == "projects" && id == "":
		payload, err = s.tools.ProjectsResource(ctx, userID)
	case u.Host == "projects" && !strings.Contains(id, "/"):
		payload, found, err = s.tools.ProjectResource(ctx, userID, id, loc)
	case u.Host == "tasks" && id != "" && !strings.Contains(id, "/"):
		payload, found, err = s.tools.TaskResource(ctx, userID, id, loc)
	case u.Host == "views" && (id == "inbox" || id == "today" || id == "upcoming"):
		payload, err = s.tools.ViewResource(ctx, userID, id, loc)
	default:
		return nil, notFound(p.URI)
	}
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, notFound(p.URI)
	}
	text, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return map[string]any{"contents": []resourceContent{{URI: p.URI, MimeType: jsonMime, Text: string(text)}}}, nil
}
