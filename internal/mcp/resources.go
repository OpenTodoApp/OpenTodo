package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
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

func resourceList() []resource {
	tz := " Dates are evaluated in UTC; append ?tz=<IANA zone> to the URI for another time zone."
	return []resource{
		{URI: "opentodo://projects", Name: "projects", Title: "Projects", Description: "The user's active projects with open task counts.", MimeType: jsonMime},
		{URI: "opentodo://views/inbox", Name: "inbox", Title: "Inbox", Description: "Open tasks without a project.", MimeType: jsonMime},
		{URI: "opentodo://views/today", Name: "today", Title: "Today", Description: "Open tasks due today or overdue, overdue first." + tz, MimeType: jsonMime},
		{URI: "opentodo://views/upcoming", Name: "upcoming", Title: "Upcoming", Description: "Open tasks due after today, soonest first." + tz, MimeType: jsonMime},
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
	loc, err := parseZone(u.Query().Get("tz"), "tz")
	if err != nil {
		return nil, err
	}
	id := strings.TrimPrefix(u.Path, "/")
	var payload any
	switch {
	case u.Host == "projects" && id == "":
		snap, err := s.load(ctx, userID)
		if err != nil {
			return nil, err
		}
		payload = s.projectsPayload(snap, false)
	case u.Host == "projects" && !strings.Contains(id, "/"):
		snap, err := s.load(ctx, userID)
		if err != nil {
			return nil, err
		}
		proj, ok := snap.projects[id]
		if !ok {
			return nil, notFound(p.URI)
		}
		res, err := s.queryTasks(snap, taskQuery{view: "all", projectID: id, loc: loc, limit: MaxItems})
		if err != nil {
			return nil, err
		}
		sections := []map[string]string{}
		secs, err := s.sync.List(ctx, userID, "section", false)
		if err != nil {
			return nil, err
		}
		for _, sec := range secs {
			if str(sec, "project_id") == id {
				sections = append(sections, map[string]string{"id": str(sec, "id"), "name": str(sec, "name")})
			}
		}
		payload = map[string]any{"project": snap.renderProject(proj, snap.openCounts()), "sections": sections,
			"tasks": res["tasks"], "truncated": res["next_cursor"] != nil, "timezone": res["timezone"], "today": res["today"], "server_time": res["server_time"]}
	case u.Host == "tasks" && id != "" && !strings.Contains(id, "/"):
		detail, err := s.taskDetail(ctx, userID, id, loc)
		if errors.Is(err, errTaskNotFound) {
			return nil, notFound(p.URI)
		}
		if err != nil {
			return nil, err
		}
		payload = detail
	case u.Host == "views" && (id == "inbox" || id == "today" || id == "upcoming"):
		snap, err := s.load(ctx, userID)
		if err != nil {
			return nil, err
		}
		res, err := s.queryTasks(snap, taskQuery{view: id, loc: loc, limit: MaxItems})
		if err != nil {
			return nil, err
		}
		res["truncated"] = res["next_cursor"] != nil
		delete(res, "next_cursor")
		payload = res
	default:
		return nil, notFound(p.URI)
	}
	text, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return map[string]any{"contents": []resourceContent{{URI: p.URI, MimeType: jsonMime, Text: string(text)}}}, nil
}
