package httpapi

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// The OpenAPI description of the v1 REST API (OpenSpec change
// openapi-description): generated from the route table, the v1 surface's
// static analysis, docs/api.md and the op schema, never edited by hand.
// UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription
// writes docs/openapi.json and the compressed copy the server embeds.

const (
	openAPIDocFile   = "../../docs/openapi.json"
	openAPIEmbedFile = "openapi.json.gz"
	openAPIDocsBase  = "https://open-todo.app/docs/api/"
)

var (
	openAPIParam    = regexp.MustCompile(`\{([^}.$]+)(?:\.\.\.)?\}`)
	openAPISlugDrop = regexp.MustCompile(`[^a-z0-9 -]`)
	openAPIMdLink   = regexp.MustCompile(`\]\(([^)\s]*)\)`)
)

// absoluteLinks points docs/api.md's relative links at the docs website, so
// they work in any OpenAPI viewer: "(#x)" → the API page, "(sync.md#y)" → that page.
func absoluteLinks(text string) string {
	return openAPIMdLink.ReplaceAllStringFunc(text, func(m string) string {
		target := openAPIMdLink.FindStringSubmatch(m)[1]
		if strings.Contains(target, "://") || strings.HasPrefix(target, "mailto:") {
			return m
		}
		page, anchor, _ := strings.Cut(target, "#")
		url := openAPIDocsBase
		if page != "" {
			page = strings.TrimSuffix(strings.TrimSuffix(strings.TrimPrefix(page, "./"), ".md"), "README")
			url = "https://open-todo.app/docs/" + strings.TrimSuffix(page, "/") + "/"
		}
		if anchor != "" {
			url += "#" + anchor
		}
		return "](" + url + ")"
	})
}

// buildOpenAPI builds the whole description. It returns the document and the
// number of fields whose type the analysis could not see.
func buildOpenAPI(t *testing.T) (map[string]any, int) {
	t.Helper()
	pkgs := loadStatic(t)
	routes := surfaceRoutes(t, staticRoutes(pkgs))
	errs := surfaceErrors(t, errorStatuses(pkgs))
	docs := docRoutes(t)
	entities := entitySchemas(t)

	schemas := map[string]any{}
	for k, v := range kindComponents {
		schemas[k] = v
	}
	for k, v := range entities {
		schemas[k] = v
	}
	codes := make([]any, 0, len(errs))
	for c := range errs {
		codes = append(codes, c)
	}
	sort.Slice(codes, func(i, j int) bool { return codes[i].(string) < codes[j].(string) })
	schemas["Error"] = schema{"type": "object", "required": []any{"error"}, "description": "Every error answer: a stable machine-readable code and an English message (docs/api.md, top).",
		"properties": schema{"error": schema{"type": "object", "required": []any{"code", "message"}, "properties": schema{
			"code":    schema{"type": "string", "description": "A stable error code. New codes may be added in 1.x; treat an unknown one by its HTTP status.", "examples": codes},
			"message": schema{"type": "string", "description": "A human-readable English message; do not parse it."},
		}}}}

	paths := map[string]any{}
	tags := map[string]bool{}
	ids := map[string]int{}
	shapes := map[string]string{}
	unknown := 0
	patterns := make([]string, 0, len(routes))
	for p := range routes {
		patterns = append(patterns, p)
	}
	sort.Strings(patterns)
	for _, pattern := range patterns {
		method, path, ok := strings.Cut(pattern, " ")
		// The generic collection routes are described once per collection.
		if !ok || method == "" || !strings.HasPrefix(path, "/api/v1/") || strings.Contains(path, "{collection}") {
			continue
		}
		r, _ := routes[pattern].(map[string]any)
		op, n := openAPIOperation(method, path, r, docs, entities)
		unknown += n
		id := op["operationId"].(string)
		if ids[id]++; ids[id] > 1 {
			op["operationId"] = fmt.Sprintf("%s%d", id, ids[id])
		}
		tags[op["tags"].([]any)[0].(string)] = true
		key := openAPIParam.ReplaceAllString(strings.TrimSuffix(path, "{$}"), "{$1}")
		// Paths that differ only in a parameter's name are one path: the first
		// name wins, and the operation's parameters follow it.
		shape := openAPIParam.ReplaceAllString(key, "{}")
		if first, ok := shapes[shape]; ok && first != key {
			renameParams(op, key, first)
			key = first
		}
		shapes[shape] = key
		item, _ := paths[key].(map[string]any)
		if item == nil {
			item = map[string]any{}
			paths[key] = item
		}
		item[strings.ToLower(method)] = op
	}
	tagText := docHeadingText(t)
	tagList := make([]any, 0, len(tags))
	for _, name := range sortedKeys(tags) {
		desc := absoluteLinks(tagText[name])
		if desc == "" {
			desc = "The " + name + " routes."
		}
		tagList = append(tagList, schema{"name": name, "description": desc, "externalDocs": schema{"url": openAPIDocsBase + "#" + openAPISlug(name)}})
	}
	dropUnused(schemas, paths)
	return map[string]any{
		"openapi":           "3.1.1",
		"jsonSchemaDialect": "https://spec.openapis.org/oas/3.1/dialect/base",
		"info": schema{
			"title":   "OpenTodo REST API",
			"version": openAPIVersionPlaceholder,
			"summary": "The HTTP API of an OpenTodo server: tasks, projects, notes, sync and administration.",
			"description": "Every OpenTodo server serves this API under `/api/v1/` and this description at `/api/v1/openapi.json`. " +
				"Authenticate with an API token (`Authorization: Bearer ot_…`, created in Settings → Integrations → API tokens) or a session cookie. " +
				"Within 1.x the API only grows (docs/stability.md): ignore fields you do not know. Dates are floating `YYYY-MM-DD`, timestamps Unix milliseconds, priority 1 is the highest and 4 the default. " +
				"This file is generated from the server's code; the guide with examples is https://open-todo.app/docs/api/.",
			"license": schema{"name": "AGPL-3.0", "identifier": "AGPL-3.0-only"},
			"contact": schema{"name": "OpenTodo", "url": "https://github.com/OpenTodoApp/OpenTodo"},
		},
		"externalDocs": schema{"description": "HTTP API guide", "url": openAPIDocsBase},
		"servers":      []any{schema{"url": "https://{host}", "description": "Your OpenTodo server", "variables": schema{"host": schema{"default": "demo.open-todo.app", "description": "The server's host name, for example todo.example.com"}}}},
		"security":     []any{schema{"bearer": []any{}}, schema{"session": []any{}}},
		"tags":         tagList,
		"paths":        paths,
		"components": schema{
			"schemas": schemas,
			"securitySchemes": schema{
				"bearer":  schema{"type": "http", "scheme": "bearer", "bearerFormat": "ot_…", "description": "An API token. Scopes: full, read (refused on writes and sync), agent (writes only through the agent routes), admin, app (docs/api.md \"Token scopes\")."},
				"session": schema{"type": "apiKey", "in": "cookie", "name": "opentodo_session", "description": "The browser session of the web app."},
			},
			"responses": schema{
				"Error":        schema{"description": "An error, in the JSON error envelope.", "content": schema{"application/json": schema{"schema": ref("Error")}}},
				"Unauthorized": schema{"description": "No valid session or token (`unauthorized`).", "content": schema{"application/json": schema{"schema": ref("Error")}}},
			},
		},
	}, unknown
}

const openAPIVersionPlaceholder = "0.0.0-dev"

// openAPIOperation describes one route.
func openAPIOperation(method, path string, r map[string]any, docs []docRoute, entities map[string]schema) (map[string]any, int) {
	policy, _ := r["policy"].(string)
	d := openAPIDoc(method, path, docs)
	tag := d.heading
	if tag == "" || tag == "Endpoints" {
		tag = humanWords(strings.SplitN(strings.TrimPrefix(path, "/api/v1/"), "/", 2)[0])
	}
	op := map[string]any{
		"operationId":       operationID(method, path),
		"summary":           openAPISummary(method, path),
		"tags":              []any{tag},
		"x-opentodo-policy": policy,
	}
	desc := strings.TrimSpace(absoluteLinks(d.text) + "\n\n" + policyText(policy))
	if desc != "" {
		op["description"] = desc
	}
	if d.heading != "" {
		op["externalDocs"] = schema{"url": openAPIDocsBase + "#" + openAPISlug(d.heading)}
	}
	if dep, ok := r["deprecated"].(string); ok {
		op["deprecated"] = true
		op["x-opentodo-deprecation"] = dep
	}
	if strings.HasPrefix(policy, "public") {
		op["security"] = []any{}
	} else if strings.Contains(policy, "session-only") {
		op["security"] = []any{schema{"session": []any{}}}
	}
	var params []any
	for _, m := range openAPIParam.FindAllStringSubmatch(path, -1) {
		params = append(params, schema{"name": m[1], "in": "path", "required": true, "schema": schema{"type": "string"}})
	}
	if len(params) > 0 {
		op["parameters"] = params
	}
	unknown := 0
	if req, ok := r["request"].(map[string]any); ok && len(req) > 0 && method != "GET" {
		body, n := buildBody(req, true)
		unknown += n
		_, required := body["required"]
		op["requestBody"] = schema{"required": required, "content": schema{"application/json": schema{"schema": body}}}
	}
	var resBody schema
	if res, ok := r["response"].(map[string]any); ok && len(res) > 0 {
		var n int
		resBody, n = buildBody(res, false)
		unknown += n
		resBody = useEntities(resBody, entities)
	}
	op["responses"] = openAPIResponses(r, resBody, policy)
	return op, unknown
}

func openAPIResponses(r map[string]any, body schema, policy string) map[string]any {
	statuses := []string{"200"}
	if s, ok := r["statuses"].([]string); ok && len(s) > 0 {
		statuses = s
	} else if s, ok := r["statuses"].([]any); ok && len(s) > 0 {
		statuses = statuses[:0]
		for _, v := range s {
			statuses = append(statuses, fmt.Sprint(v))
		}
	}
	out := map[string]any{"4XX": schema{"$ref": "#/components/responses/Error"}}
	if !strings.HasPrefix(policy, "public") {
		out["401"] = schema{"$ref": "#/components/responses/Unauthorized"}
	}
	for _, st := range statuses {
		resp := schema{"description": statusText(st)}
		if body != nil && st != "204" && !strings.HasPrefix(st, "3") {
			resp["content"] = schema{"application/json": schema{"schema": body}}
		}
		out[st] = resp
	}
	return out
}

func statusText(st string) string {
	switch st {
	case "200":
		return "OK"
	case "201":
		return "Created"
	case "202":
		return "Accepted"
	case "204":
		return "No content"
	case "302", "303":
		return "Redirect"
	case "304":
		return "Not modified"
	}
	return "Status " + st
}

// policyText says in words what a policy asks of the caller.
func policyText(policy string) string {
	var parts []string
	switch {
	case strings.HasPrefix(policy, "public"):
		parts = append(parts, "No authentication.")
	case strings.HasPrefix(policy, "owner-only"):
		parts = append(parts, "Only the server's owner.")
	case strings.HasPrefix(policy, "admins-only"):
		parts = append(parts, "The owner and admins.")
	}
	if strings.Contains(policy, ".full-tokens") {
		parts = append(parts, "Refuses read and agent tokens.")
	}
	if strings.Contains(policy, ".credential") {
		parts = append(parts, "Needs a session or an admin token; full tokens are refused.")
	}
	if strings.Contains(policy, ".session-only") {
		parts = append(parts, "Needs a session; tokens are refused.")
	}
	if strings.Contains(policy, ".recent") {
		parts = append(parts, "Needs a recently confirmed session or second factor.")
	}
	return strings.Join(parts, " ")
}

// openAPIDoc is the docs/api.md entry that describes a route: an exact path
// first, else the longest prefix.
func openAPIDoc(method, path string, docs []docRoute) docRoute {
	p := docWildcard.ReplaceAllString(strings.TrimSuffix(path, "{$}"), "{}")
	var best docRoute
	for _, d := range docs {
		if !d.covers(method, p) {
			continue
		}
		if !d.prefix {
			if best.heading == "" || best.prefix || (best.text == "" && d.text != "") {
				best = d
			}
			continue
		}
		if best.heading == "" || (best.prefix && len(d.path) > len(best.path)) {
			best = d
		}
	}
	return best
}

// operationID is a stable camelCase id: "PATCH /api/v1/tasks/{id}" → "patchTasksById".
func operationID(method, path string) string {
	var b strings.Builder
	b.WriteString(strings.ToLower(method))
	for _, seg := range strings.Split(strings.TrimPrefix(path, "/api/v1/"), "/") {
		if m := openAPIParam.FindStringSubmatch(seg); m != nil {
			b.WriteString("By" + camel(m[1]))
			continue
		}
		b.WriteString(camel(seg))
	}
	return b.String()
}

func camel(s string) string {
	var b strings.Builder
	for _, p := range strings.FieldsFunc(s, func(r rune) bool { return r == '-' || r == '_' || r == '.' || r == '$' || r == '{' || r == '}' }) {
		b.WriteString(strings.ToUpper(p[:1]) + p[1:])
	}
	return b.String()
}

func humanWords(s string) string {
	w := strings.NewReplacer("-", " ", "_", " ").Replace(s)
	if w == "" {
		return w
	}
	return strings.ToUpper(w[:1]) + w[1:]
}

func singular(w string) string {
	switch {
	case strings.HasSuffix(w, "ies"):
		return strings.TrimSuffix(w, "ies") + "y"
	case strings.HasSuffix(w, "sses"), strings.HasSuffix(w, "ss"):
		return strings.TrimSuffix(w, "es")
	case strings.HasSuffix(w, "s") && !strings.HasSuffix(w, "us"):
		return strings.TrimSuffix(w, "s")
	}
	return w
}

// openAPISummary is a short name for a route from its method and path:
// "GET /api/v1/tasks/{id}" → "Get a task", "GET /api/v1/projects/{id}/members"
// → "List project members".
func openAPISummary(method, path string) string {
	segs := strings.Split(strings.Trim(strings.TrimPrefix(strings.TrimSuffix(path, "{$}"), "/api/v1/"), "/"), "/")
	var words []string
	endsParam := false
	for i, seg := range segs {
		if openAPIParam.MatchString(seg) {
			endsParam = i == len(segs)-1
			if len(words) > 0 {
				words[len(words)-1] = singular(words[len(words)-1])
			}
			continue
		}
		endsParam = false
		words = append(words, strings.NewReplacer("-", " ", "_", " ").Replace(seg))
	}
	what := strings.Join(words, " ")
	last := ""
	if len(words) > 0 {
		last = words[len(words)-1]
	}
	collection := strings.HasSuffix(last, "s") && !strings.HasSuffix(last, "ss")
	switch {
	case method == "GET" && endsParam:
		return "Get a " + what
	case method == "GET" && collection:
		return "List " + what
	case method == "GET":
		return "Get " + what
	case method == "POST" && collection && !endsParam:
		return "Create a " + strings.TrimSuffix(what, last) + singular(last)
	case method == "PATCH" && endsParam:
		return "Update a " + what
	case method == "PUT" && endsParam:
		return "Replace a " + what
	case method == "DELETE" && endsParam:
		return "Delete a " + what
	case method == "PATCH", method == "PUT":
		return "Update " + what
	case method == "DELETE":
		return "Delete " + what
	}
	return humanWords(what)
}

// openAPISlug is the anchor the docs website gives a heading.
func openAPISlug(heading string) string {
	s := strings.ToLower(strings.ReplaceAll(heading, "`", ""))
	s = openAPISlugDrop.ReplaceAllString(s, "")
	return strings.ReplaceAll(strings.TrimSpace(s), " ", "-")
}

// useEntities replaces an object that has every field of an entity with a
// reference to that entity (and its extra fields), in a body and its arrays.
func useEntities(s schema, entities map[string]schema) schema {
	if items, ok := s["items"].(schema); ok {
		s["items"] = useEntities(items, entities)
	}
	props, ok := s["properties"].(schema)
	if !ok {
		return s
	}
	for k, v := range props {
		if c, ok := v.(schema); ok {
			props[k] = useEntities(c, entities)
		}
	}
	best, bestN := "", 0
	for name, e := range entities {
		ep := e["properties"].(schema)
		if len(ep) < 4 || len(ep) <= bestN {
			continue
		}
		all := true
		for f := range ep {
			if _, ok := props[f]; !ok {
				all = false
				break
			}
		}
		if all {
			best, bestN = name, len(ep)
		}
	}
	if best == "" {
		return s
	}
	extra := schema{}
	for f, v := range props {
		if _, ok := entities[best]["properties"].(schema)[f]; !ok {
			extra[f] = v
		}
	}
	if len(extra) == 0 {
		return ref(best)
	}
	return schema{"allOf": []any{ref(best), schema{"type": "object", "properties": extra}}}
}

// renameParams gives an operation the parameter names of the path it joins.
func renameParams(op map[string]any, from, to string) {
	a, b := openAPIParam.FindAllStringSubmatch(from, -1), openAPIParam.FindAllStringSubmatch(to, -1)
	ps, _ := op["parameters"].([]any)
	for i, p := range ps {
		if i < len(a) && i < len(b) {
			p.(schema)["name"] = b[i][1]
		}
	}
}

// dropUnused removes the component schemas nothing refers to, after the
// entities were matched into the bodies.
func dropUnused(schemas map[string]any, paths map[string]any) {
	for {
		raw, _ := json.Marshal(map[string]any{"paths": paths, "schemas": schemas})
		removed := false
		for name := range schemas {
			if name != "Error" && !bytes.Contains(raw, []byte(`"#/components/schemas/`+name+`"`)) {
				delete(schemas, name)
				removed = true
			}
		}
		if !removed {
			return
		}
	}
}

// docHeadingText is the first paragraph under each docs/api.md heading, as a
// tag's description.
func docHeadingText(t *testing.T) map[string]string {
	t.Helper()
	b, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	heading, fence := "", false
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "```") {
			fence = !fence
			continue
		}
		if fence {
			continue
		}
		if h, ok := strings.CutPrefix(line, "#"); ok {
			heading = strings.TrimSpace(strings.TrimLeft(h, "#"))
			continue
		}
		l := strings.TrimSpace(line)
		if heading == "" || out[heading] != "" || l == "" || strings.HasPrefix(l, "|") || strings.HasPrefix(l, "<") {
			continue
		}
		out[heading] = l
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// openAPIJSON is the document as the committed file: indented, keys sorted.
func openAPIJSON(t *testing.T, doc map[string]any) []byte {
	t.Helper()
	b, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(b, '\n')
}

func gzipBytes(t *testing.T, b []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if _, err := zw.Write(b); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestOpenAPIDescription(t *testing.T) {
	doc, unknown := buildOpenAPI(t)
	if problems := lintOpenAPI(doc); len(problems) > 0 {
		for _, p := range problems {
			t.Error(p)
		}
		return
	}
	want := openAPIJSON(t, doc)
	t.Logf("openapi: %d paths, %d fields of unknown type", len(doc["paths"].(map[string]any)), unknown)
	if os.Getenv("UPDATE_OPENAPI") == "1" {
		if err := os.WriteFile(openAPIDocFile, want, 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(openAPIEmbedFile, gzipBytes(t, want), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	got, err := os.ReadFile(openAPIDocFile)
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("docs/openapi.json is stale; run UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription")
	}
	zr, err := gzip.NewReader(bytes.NewReader(openAPIEmbedded))
	if err != nil {
		t.Fatal(err)
	}
	embedded, _ := io.ReadAll(zr)
	if !bytes.Equal(embedded, want) {
		t.Fatalf("%s differs from docs/openapi.json; run UPDATE_OPENAPI=1 go test ./internal/httpapi -run TestOpenAPIDescription", openAPIEmbedFile)
	}
}

// lintOpenAPI checks what makes a description usable by tools: every
// reference resolves, operation ids are unique, every path parameter is
// declared, every operation has a summary, a declared tag and responses.
func lintOpenAPI(doc map[string]any) []string {
	var problems []string
	raw, _ := json.Marshal(doc)
	var plain map[string]any
	_ = json.Unmarshal(raw, &plain)
	comps := plain["components"].(map[string]any)
	var walk func(v any, at string)
	walk = func(v any, at string) {
		switch x := v.(type) {
		case map[string]any:
			if r, ok := x["$ref"].(string); ok {
				parts := strings.Split(strings.TrimPrefix(r, "#/components/"), "/")
				if group, ok := comps[parts[0]].(map[string]any); !ok || len(parts) != 2 || group[parts[1]] == nil {
					problems = append(problems, at+": $ref "+r+" does not resolve")
				}
			}
			for k, c := range x {
				walk(c, at+"/"+k)
			}
		case []any:
			for i, c := range x {
				walk(c, fmt.Sprintf("%s/%d", at, i))
			}
		}
	}
	walk(plain, "#")
	declared := map[string]bool{}
	for _, tg := range plain["tags"].([]any) {
		declared[tg.(map[string]any)["name"].(string)] = true
	}
	ids := map[string]string{}
	for path, item := range plain["paths"].(map[string]any) {
		for method, o := range item.(map[string]any) {
			op := o.(map[string]any)
			where := strings.ToUpper(method) + " " + path
			id, _ := op["operationId"].(string)
			if prev, dup := ids[id]; dup || id == "" {
				problems = append(problems, fmt.Sprintf("%s: operationId %q also used by %s", where, id, prev))
			}
			ids[id] = where
			if s, _ := op["summary"].(string); s == "" {
				problems = append(problems, where+": no summary")
			}
			tagsOf, _ := op["tags"].([]any)
			if len(tagsOf) != 1 || !declared[fmt.Sprint(tagsOf[0])] {
				problems = append(problems, where+": its tag is not declared")
			}
			if rs, _ := op["responses"].(map[string]any); len(rs) == 0 {
				problems = append(problems, where+": no responses")
			}
			names := map[string]bool{}
			ps, _ := op["parameters"].([]any)
			for _, p := range ps {
				names[p.(map[string]any)["name"].(string)] = true
			}
			for _, m := range openAPIParam.FindAllStringSubmatch(path, -1) {
				if !names[m[1]] {
					problems = append(problems, where+": path parameter "+m[1]+" is not declared")
				}
			}
		}
	}
	sort.Strings(problems)
	return problems
}

func TestOpenAPIShapes(t *testing.T) {
	doc, _ := buildOpenAPI(t)
	raw, _ := json.Marshal(doc)
	var d map[string]any
	_ = json.Unmarshal(raw, &d)
	paths := d["paths"].(map[string]any)
	op := func(method, path string) map[string]any {
		t.Helper()
		item, _ := paths[path].(map[string]any)
		o, _ := item[method].(map[string]any)
		if o == nil {
			t.Fatalf("%s %s is not described", method, path)
		}
		return o
	}
	// A task create takes the task fields and answers a task.
	create := op("post", "/api/v1/tasks")
	body := create["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
	if _, ok := body["properties"].(map[string]any)["title"]; !ok {
		t.Errorf("POST /api/v1/tasks: no title in the request: %v", body)
	}
	got, _ := json.Marshal(op("get", "/api/v1/tasks/{id}")["responses"])
	if !strings.Contains(string(got), "#/components/schemas/Task") {
		t.Errorf("GET /api/v1/tasks/{id} does not answer a Task: %s", got)
	}
	// Sync takes ops and a cursor.
	sync := op("post", "/api/v1/sync")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
	for _, f := range []string{"ops", "cursor", "device"} {
		if _, ok := sync["properties"].(map[string]any)[f]; !ok {
			t.Errorf("POST /api/v1/sync: no %s in the request", f)
		}
	}
	// Auth: public routes need nothing, session-only routes only the cookie.
	if s, _ := op("get", "/api/v1/health")["security"].([]any); s == nil || len(s) != 0 {
		t.Errorf("GET /api/v1/health should need no authentication: %v", s)
	}
	for path, item := range paths {
		for method, o := range item.(map[string]any) {
			o := o.(map[string]any)
			if strings.Contains(fmt.Sprint(o["x-opentodo-policy"]), "session-only") {
				if s, _ := json.Marshal(o["security"]); string(s) != `[{"session":[]}]` {
					t.Errorf("%s %s is session-only but its security is %s", method, path, s)
				}
			}
		}
	}
	// Every entity of the collections is a component schema with its fields.
	comps := d["components"].(map[string]any)["schemas"].(map[string]any)
	// The main synced entities are shared schemas (the others have routes of
	// their own and appear inline).
	for _, name := range []string{"Task", "Project", "Label", "Section", "Note", "Reminder", "View"} {
		if comps[name] == nil {
			t.Errorf("no component schema %s", name)
		}
	}
	if desc, _ := comps["Task"].(map[string]any)["properties"].(map[string]any)["estimate_minutes"].(map[string]any)["description"].(string); desc == "" {
		t.Errorf("Task.estimate_minutes has no description from internal/sync/ops.go")
	}
}
