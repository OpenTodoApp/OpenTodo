package httpapi

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// The example check of the OpenAPI description (openapi-description): every
// example fits the schema next to it, as an OpenAPI linter checks it, over
// the subset of JSON Schema the description uses ($ref, const, enum, type
// with null, required, properties, additionalProperties, items, allOf, anyOf,
// oneOf). A recorded example is what the server really sent or accepted, so
// a mismatch is a schema that does not agree with the server.

// exampleProblems lists every example of the operations and shared
// responses that does not fit its schema.
func exampleProblems(doc map[string]any) []string {
	comps, _ := doc["components"].(map[string]any)
	schemas, _ := comps["schemas"].(map[string]any)
	var problems []string
	check := func(media map[string]any, where string) {
		s, ok := media["schema"].(map[string]any)
		if !ok {
			return
		}
		if ex, ok := media["example"]; ok {
			problems = append(problems, fitsSchema(ex, s, schemas, where+" example", 0)...)
		}
		examples, _ := media["examples"].(map[string]any)
		for _, name := range sortedKeys(examples) {
			if e, ok := examples[name].(map[string]any); ok {
				problems = append(problems, fitsSchema(e["value"], s, schemas, where+" example "+name, 0)...)
			}
		}
	}
	paths, _ := doc["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range sortedKeys(item) {
			op, _ := item[method].(map[string]any)
			where := strings.ToUpper(method) + " " + path
			if body, ok := op["requestBody"].(map[string]any); ok {
				check(jsonMedia(body), where+" request")
			}
			responses, _ := op["responses"].(map[string]any)
			for _, st := range sortedKeys(responses) {
				if r, ok := responses[st].(map[string]any); ok {
					check(jsonMedia(r), where+" "+st)
				}
			}
		}
	}
	shared, _ := comps["responses"].(map[string]any)
	for _, name := range sortedKeys(shared) {
		if r, ok := shared[name].(map[string]any); ok {
			check(jsonMedia(r), "#/components/responses/"+name)
		}
	}
	return problems
}

// fitsSchema lists where v does not fit s; at names v ("POST /x request
// example.ops[0].actor").
func fitsSchema(v any, s map[string]any, schemas map[string]any, at string, depth int) []string {
	if depth > 32 {
		return nil
	}
	if r, ok := s["$ref"].(string); ok {
		target, _ := schemas[strings.TrimPrefix(r, "#/components/schemas/")].(map[string]any)
		return fitsSchema(v, target, schemas, at, depth+1)
	}
	if c, ok := s["const"]; ok && !reflect.DeepEqual(v, c) {
		return []string{fmt.Sprintf("%s: %s, not the const %v", at, exampleJSON(v), c)}
	}
	if list, ok := s["enum"].([]any); ok && !containsValue(list, v) {
		return []string{fmt.Sprintf("%s: %s is not one of %v", at, exampleJSON(v), list)}
	}
	if t, ok := s["type"]; ok && !fitsType(v, t) {
		return []string{fmt.Sprintf("%s: %s is not of type %v", at, exampleJSON(v), t)}
	}
	var problems []string
	if all, ok := s["allOf"].([]any); ok {
		for _, part := range all {
			p, _ := part.(map[string]any)
			problems = append(problems, fitsSchema(v, p, schemas, at, depth+1)...)
		}
	}
	for _, k := range []string{"anyOf", "oneOf"} {
		alts, ok := s[k].([]any)
		if !ok {
			continue
		}
		fit := 0
		for _, alt := range alts {
			a, _ := alt.(map[string]any)
			if len(fitsSchema(v, a, schemas, at, depth+1)) == 0 {
				fit++
			}
		}
		if fit == 0 || (k == "oneOf" && fit > 1) {
			problems = append(problems, fmt.Sprintf("%s: %s fits %d of the %d alternatives of %s", at, exampleJSON(v), fit, len(alts), k))
		}
	}
	switch x := v.(type) {
	case map[string]any:
		problems = append(problems, fitsObject(x, s, schemas, at, depth)...)
	case []any:
		if items, ok := s["items"].(map[string]any); ok {
			for i, e := range x {
				problems = append(problems, fitsSchema(e, items, schemas, fmt.Sprintf("%s[%d]", at, i), depth+1)...)
			}
		}
	}
	return problems
}

// fitsObject checks an object's required members, its properties and the
// schema of its other members.
func fitsObject(x map[string]any, s map[string]any, schemas map[string]any, at string, depth int) []string {
	var problems []string
	required, _ := s["required"].([]any)
	for _, r := range required {
		if _, ok := x[fmt.Sprint(r)]; !ok {
			problems = append(problems, fmt.Sprintf("%s: the required member %v is missing", at, r))
		}
	}
	props, _ := s["properties"].(map[string]any)
	extra, _ := s["additionalProperties"].(map[string]any)
	for _, k := range sortedKeys(x) {
		if p, ok := props[k].(map[string]any); ok {
			problems = append(problems, fitsSchema(x[k], p, schemas, at+"."+k, depth+1)...)
		} else if extra != nil {
			problems = append(problems, fitsSchema(x[k], extra, schemas, at+"."+k, depth+1)...)
		}
	}
	return problems
}

// fitsType reports a decoded JSON value of the type, or one of the types, t.
func fitsType(v any, t any) bool {
	var types []any
	switch t := t.(type) {
	case string:
		types = []any{t}
	case []any:
		types = t
	}
	for _, typ := range types {
		switch typ {
		case "null":
			if v == nil {
				return true
			}
		case "string":
			if _, ok := v.(string); ok {
				return true
			}
		case "boolean":
			if _, ok := v.(bool); ok {
				return true
			}
		case "number":
			if _, ok := v.(float64); ok {
				return true
			}
		case "integer":
			if f, ok := v.(float64); ok && f == math.Trunc(f) {
				return true
			}
		case "object":
			if _, ok := v.(map[string]any); ok {
				return true
			}
		case "array":
			if _, ok := v.([]any); ok {
				return true
			}
		}
	}
	return false
}

func containsValue(list []any, v any) bool {
	for _, e := range list {
		if reflect.DeepEqual(e, v) {
			return true
		}
	}
	return false
}

// exampleJSON is a short form of a value for a problem's message.
func exampleJSON(v any) string {
	switch v.(type) {
	case map[string]any:
		return "an object"
	case []any:
		return "an array"
	case nil:
		return "null"
	}
	return fmt.Sprintf("%#v", v)
}

// bodyRequiredProblems lists the request bodies whose `required` does not
// say what their handler's reader does (bodies, from buildOpenAPI): a reader
// that refuses an empty body makes it required, readOptionalJSON optional.
func bodyRequiredProblems(doc map[string]any, bodies map[string]bool) []string {
	var problems []string
	paths, _ := doc["paths"].(map[string]any)
	for _, path := range sortedKeys(paths) {
		item, _ := paths[path].(map[string]any)
		for _, method := range sortedKeys(item) {
			op, _ := item[method].(map[string]any)
			body, ok := op["requestBody"].(map[string]any)
			if !ok || jsonMedia(body)["schema"] == nil {
				continue // a body only the example shows
			}
			where := strings.ToUpper(method) + " " + path
			want, known := bodies[where]
			if got := body["required"] == true; !known || got != want {
				problems = append(problems, fmt.Sprintf("%s: requestBody.required is %v, but its handler's reader says %v", where, got, want))
			}
		}
	}
	sort.Strings(problems)
	return problems
}

func TestOpenAPIExampleCheck(t *testing.T) {
	schemas := map[string]any{"Due": map[string]any{"type": "object", "required": []any{"date"}, "properties": map[string]any{"date": map[string]any{"type": "string"}}}}
	s := map[string]any{"type": "object", "required": []any{"ops"}, "properties": map[string]any{
		"energy":   map[string]any{"type": "string"},
		"sector":   map[string]any{"type": []any{"string", "null"}},
		"priority": map[string]any{"type": "integer", "enum": []any{1.0, 2.0, 3.0, 4.0}},
		"due":      map[string]any{"anyOf": []any{map[string]any{"$ref": "#/components/schemas/Due"}, map[string]any{"type": "null"}}},
		"ops": map[string]any{"type": "array", "items": map[string]any{"type": "object", "required": []any{"id", "seq"},
			"properties": map[string]any{"id": map[string]any{"type": "string"}, "seq": map[string]any{"type": "number"}}}},
		"value": map[string]any{"description": "Any JSON."},
	}}
	ok := map[string]any{"sector": nil, "priority": 1.0, "due": nil, "ops": []any{map[string]any{"id": "a", "seq": 1.0}}, "value": []any{1.0}}
	if p := fitsSchema(ok, s, schemas, "x", 0); len(p) != 0 {
		t.Errorf("a fitting example: %q", p)
	}
	bad := map[string]any{"energy": nil, "priority": 1.5, "due": map[string]any{}, "ops": []any{map[string]any{"id": "a"}}}
	got := strings.Join(fitsSchema(bad, s, schemas, "x", 0), "\n")
	for _, want := range []string{
		"x.energy: null is not of type string",
		"x.priority: 1.5 is not one of",
		"x.due: an object fits 0 of the 2 alternatives of anyOf",
		"x.ops[0]: the required member seq is missing",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("problems %q lack %q", got, want)
		}
	}
	doc := map[string]any{"paths": map[string]any{"/api/v1/x": map[string]any{
		"post":  map[string]any{"requestBody": map[string]any{"required": false, "content": map[string]any{"application/json": map[string]any{"schema": s}}}},
		"patch": map[string]any{"requestBody": map[string]any{"required": false, "content": map[string]any{"application/json": map[string]any{"schema": s}}}},
	}}}
	p := bodyRequiredProblems(doc, map[string]bool{"POST /api/v1/x": true, "PATCH /api/v1/x": false})
	if len(p) != 1 || !strings.HasPrefix(p[0], "POST /api/v1/x: requestBody.required is false") {
		t.Errorf("bodyRequiredProblems = %q", p)
	}
}
