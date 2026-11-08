package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The parts of the v1 surface read from a running server and from the
// generated documents other packages pin (OpenSpec change
// `stability-contract`, design D1).

// collectionRoutes lists the generic collection routes once per collection,
// with the collection's op fields (as their kind names) and the members a
// read adds to a row (observed on a running server).
func collectionRoutes(t *testing.T, table map[string]routePolicy) map[string]any {
	t.Helper()
	extras := observedRowMembers(t)
	kinds := opsync.SchemaKinds()
	out := map[string]any{}
	for plural, entity := range opsync.Plural {
		row := map[string]any{"id": "string"}
		for f, k := range kinds[entity] {
			row[f] = k
		}
		for f, typ := range extras[entity] {
			if _, ok := row[f]; !ok {
				row[f] = typ
			}
		}
		create, patch := map[string]any{}, map[string]any{}
		for f, k := range kinds[entity] {
			patch[f] = k + "?"
			if k == "id" {
				create[f] = k // a non-empty id: a create needs it
			} else {
				create[f] = k + "?"
			}
		}
		list := map[string]any{plural: "array"}
		for f, typ := range row {
			list[plural+"[]."+f] = typ
		}
		for _, r := range []struct {
			method, path      string
			request, response map[string]any
		}{
			{"GET", "/api/v1/" + plural, nil, list},
			{"POST", "/api/v1/" + plural, create, row},
			{"GET", "/api/v1/" + plural + "/{id}", nil, row},
			{"PATCH", "/api/v1/" + plural + "/{id}", patch, row},
			{"DELETE", "/api/v1/" + plural + "/{id}", nil, nil},
		} {
			generic := r.method + " " + strings.Replace(r.path, "/api/v1/"+plural, "/api/v1/{collection}", 1)
			p, ok := table[generic]
			if !ok {
				t.Fatalf("no generic route %s", generic)
			}
			e := map[string]any{"policy": policyName(p)}
			if r.request != nil {
				e["request"] = r.request
			}
			if r.response != nil {
				e["response"] = r.response
			}
			out[r.method+" "+r.path] = e
		}
	}
	return out
}

// observedRowMembers creates a project, a section, a label and a task over
// REST and reads them back: the members of a row that are not op fields (the
// caller's role on a project, a note's body version) with their JSON types.
func observedRowMembers(t *testing.T) map[string]map[string]string {
	t.Helper()
	e := registeredEnv(t)
	create := func(plural string, body map[string]any) map[string]any {
		resp, out := e.do("POST", "/api/v1/"+plural, body)
		e.mustStatus(resp, 201, out)
		resp, out = e.do("GET", fmt.Sprintf("/api/v1/%s/%s", plural, out["id"]), nil)
		e.mustStatus(resp, 200, out)
		return out
	}
	project := create("projects", map[string]any{"name": "P"})
	section := create("sections", map[string]any{"name": "S", "project_id": project["id"]})
	label := create("labels", map[string]any{"name": "L"})
	task := create("tasks", map[string]any{"title": "T", "project_id": project["id"], "section_id": section["id"], "labels": []any{label["id"]}})
	note := create("notes", map[string]any{"title": "N"})
	out := map[string]map[string]string{}
	for entity, row := range map[string]map[string]any{"project": project, "section": section, "label": label, "task": task, "note": note} {
		out[entity] = map[string]string{}
		for k, v := range row {
			if typ := valueType(v); typ != "null" {
				out[entity][k] = typ
			}
		}
	}
	return out
}

// valueType is the JSON type of a decoded value.
func valueType(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case float64:
		return "number"
	case bool:
		return "boolean"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	}
	return "any"
}

// exportLists maps the export's lists to their op entities.
var exportLists = map[string]string{
	"comments": "comment", "attachments": "attachment", "time_entries": "time_entry", "places": "place",
	"themes": "theme", "user_prefs": "user_prefs", "review": "review", "project_prefs": "project_prefs",
}

// surfaceExport is the export document: format, version, top-level members and
// the fields of each entity list.
func surfaceExport(t *testing.T) map[string]any {
	t.Helper()
	e := registeredEnv(t)
	resp, doc := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, doc)
	kinds := opsync.SchemaKinds()
	members := map[string]any{}
	lists := map[string]any{}
	for k, v := range doc {
		members[k] = valueType(v)
		entity := exportLists[k]
		if entity == "" {
			entity = opsync.Plural[k]
		}
		if entity == "" {
			continue
		}
		fields := map[string]any{"id": "string"}
		for f, kind := range kinds[entity] {
			fields[f] = kind
		}
		lists[k] = fields
	}
	members["encryption"] = "object|null" // null for an account without encryption
	return map[string]any{
		"format":   fmt.Sprint(doc["format"]),
		"version":  fmt.Sprint(doc["version"]),
		"members":  members,
		"entities": lists,
	}
}

// surfaceMCP is every tool of the agent registry (the generated definitions
// pinned by internal/agenttools): its kind, its arguments and, for read tools,
// the members of its result on an account with a project and a task.
func surfaceMCP(t *testing.T) map[string]any {
	t.Helper()
	out := map[string]any{}
	for _, golden := range []string{"tools_agent_on", "tools_full_token", "tools_agent_encrypted"} {
		raw, err := os.ReadFile("../agenttools/testdata/" + golden + ".golden.json")
		if err != nil {
			t.Fatal(err)
		}
		var doc struct {
			Tools []struct {
				Name        string         `json:"name"`
				InputSchema map[string]any `json:"inputSchema"`
				Annotations map[string]any `json:"annotations"`
			} `json:"tools"`
		}
		if err := json.Unmarshal(raw, &doc); err != nil {
			t.Fatal(err)
		}
		for _, tool := range doc.Tools {
			if _, seen := out[tool.Name]; seen {
				continue
			}
			kind := "write"
			if tool.Annotations["readOnlyHint"] == true {
				kind = "read"
			}
			args := map[string]any{}
			schemaFields(tool.InputSchema, "", args, true)
			entry := map[string]any{"kind": kind}
			if len(args) > 0 {
				entry["arguments"] = args
			}
			out[tool.Name] = entry
		}
	}
	for name, result := range readToolResults(t, out) {
		out[name].(map[string]any)["result"] = result
	}
	return out
}

// readToolResults calls every read tool without arguments and records the
// members of its result (two levels, list elements included).
func readToolResults(t *testing.T, tools map[string]any) map[string]map[string]any {
	t.Helper()
	e := registeredEnv(t)
	resp, me := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, me)
	uid := me["user"].(map[string]any)["id"].(string)
	resp, p := e.do("POST", "/api/v1/projects", map[string]any{"name": "P"})
	e.mustStatus(resp, 201, p)
	// Due today as the read tools see it: called without arguments they read the
	// day in UTC (their timezone default), not the machine's local date, so the
	// snapshot is the same on every machine (due_today, never overdue).
	today := e.now.Now().UTC().Format("2006-01-02")
	// A repeating task, so the members only a repeating task has are recorded
	// too (tracked_minutes_occurrence, OpenSpec change tracked-time-api-compatible).
	resp, task := e.do("POST", "/api/v1/tasks", map[string]any{"title": "T", "project_id": p["id"], "due": map[string]any{"date": today}, "recurrence": "every day"})
	e.mustStatus(resp, 201, task)
	caller := agenttools.Caller{UserID: uid, Scope: "full"}
	out := map[string]map[string]any{}
	for name, v := range tools {
		if v.(map[string]any)["kind"] != "read" {
			continue
		}
		res, err := e.server.agentTools.Call(context.Background(), caller, name, json.RawMessage(`{}`))
		if err != nil {
			continue // a tool that needs arguments: its arguments are the surface
		}
		raw, _ := json.Marshal(res)
		var doc map[string]any
		_ = json.Unmarshal(raw, &doc)
		members := map[string]any{}
		resultMembers(doc, "", members, 0)
		out[name] = members
	}
	return out
}

// resultMembers records the members of a decoded result with their JSON types.
func resultMembers(v map[string]any, prefix string, out map[string]any, depth int) {
	for k, sub := range v {
		path := prefix + k
		typ := valueType(sub)
		if typ == "null" {
			continue
		}
		out[path] = typ
		if depth >= 1 {
			continue
		}
		switch sub := sub.(type) {
		case map[string]any:
			resultMembers(sub, path+".", out, depth+1)
		case []any:
			if len(sub) > 0 {
				if el, ok := sub[0].(map[string]any); ok {
					resultMembers(el, path+"[].", out, depth+1)
				}
			}
		}
	}
}

// schemaFields records the properties of a JSON schema: path → type, with "?"
// for an input property that is not required.
func schemaFields(s map[string]any, prefix string, out map[string]any, input bool) {
	props, _ := s["properties"].(map[string]any)
	var required []string
	if r, ok := s["required"].([]any); ok {
		for _, x := range r {
			required = append(required, fmt.Sprint(x))
		}
	}
	for name, p := range props {
		ps, _ := p.(map[string]any)
		path := prefix + name
		typ := schemaType(ps)
		if input && !slices.Contains(required, name) {
			typ += "?"
		}
		out[path] = typ
		schemaFields(ps, path+".", out, input)
		if items, ok := ps["items"].(map[string]any); ok {
			schemaFields(items, path+"[].", out, input)
		}
	}
	for _, alt := range []string{"anyOf", "oneOf"} {
		if list, ok := s[alt].([]any); ok {
			for _, a := range list {
				if as, ok := a.(map[string]any); ok {
					schemaFields(as, prefix, out, input)
				}
			}
		}
	}
}

// schemaType is a schema's type ("string", "string|null"), its reference, or "any".
func schemaType(s map[string]any) string {
	switch v := s["type"].(type) {
	case string:
		return v
	case []any:
		parts := make([]string, len(v))
		for i, x := range v {
			parts[i] = fmt.Sprint(x)
		}
		return strings.Join(parts, "|")
	}
	if ref, ok := s["$ref"].(string); ok {
		return "ref:" + ref[strings.LastIndex(ref, "/")+1:]
	}
	return "any"
}

// surfaceCLI is the `ot` contract from its generated schema document (pinned by
// internal/cli TestSchemaGolden): commands with their arguments, flags and
// --json output, global flags, exit codes, error codes and output schemas.
func surfaceCLI(t *testing.T) map[string]any {
	t.Helper()
	raw, err := os.ReadFile("../cli/testdata/schema.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		OutputVersion any `json:"output_version"`
		Commands      []struct {
			Name string `json:"name"`
			Args []struct {
				Name     string
				Required bool
			} `json:"args"`
			Flags  []struct{ Name, Type string } `json:"flags"`
			Output map[string]any                `json:"output_schema"`
		} `json:"commands"`
		GlobalFlags []struct{ Name, Type string } `json:"global_flags"`
		ExitCodes   []struct {
			Code int    `json:"code"`
			Name string `json:"name"`
		} `json:"exit_codes"`
		ErrorCodes []struct {
			Code string `json:"code"`
			Exit int    `json:"exit"`
		} `json:"error_codes"`
		Schemas map[string]map[string]any `json:"schemas"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	commands := map[string]any{}
	for _, c := range doc.Commands {
		cmd := map[string]any{}
		if len(c.Args) > 0 {
			args := map[string]any{}
			for _, a := range c.Args {
				args[a.Name] = map[bool]string{true: "required", false: "optional"}[a.Required]
			}
			cmd["args"] = args
		}
		if len(c.Flags) > 0 {
			flags := map[string]any{}
			for _, f := range c.Flags {
				flags[f.Name] = f.Type
			}
			cmd["flags"] = flags
		}
		if c.Output != nil {
			output := map[string]any{"(type)": schemaType(c.Output)}
			schemaFields(c.Output, "", output, false)
			cmd["output"] = output
		}
		commands[c.Name] = cmd
	}
	global := map[string]any{}
	for _, f := range doc.GlobalFlags {
		global[f.Name] = f.Type
	}
	exits := map[string]any{}
	for _, x := range doc.ExitCodes {
		exits[fmt.Sprint(x.Code)] = x.Name
	}
	errs := map[string]any{}
	for _, x := range doc.ErrorCodes {
		errs[x.Code] = fmt.Sprint(x.Exit)
	}
	schemas := map[string]any{}
	for name, s := range doc.Schemas {
		fields := map[string]any{"(type)": schemaType(s)}
		schemaFields(s, "", fields, false)
		schemas[name] = fields
	}
	return map[string]any{
		"output_version": fmt.Sprint(doc.OutputVersion),
		"commands":       commands,
		"global_flags":   global,
		"exit_codes":     exits,
		"error_codes":    errs,
		"schemas":        schemas,
	}
}
