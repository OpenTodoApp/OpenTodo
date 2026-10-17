package sync

import (
	"encoding/json"
	"maps"
	"os"
	"slices"
	"testing"

	"github.com/pixari/opentodo/internal/e2ee"
)

// schemaFixture is the op schema contract shared with the web client
// (OpenSpec change test-integrity); web/src/lib/schemaFixture.test.ts reads the
// same file.
type schemaFixture struct {
	Entities        map[string][]string `json:"entities"`
	FieldPrefixes   map[string][]string `json:"field_prefixes"`
	ContentFields   map[string][]string `json:"content_fields"`
	ContentPrefixes map[string][]string `json:"content_prefixes"`
}

func readSchemaFixture(t *testing.T) schemaFixture {
	t.Helper()
	raw, err := os.ReadFile("testdata/schema_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f schemaFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func sortedLists(m map[string][]string) map[string][]string {
	out := map[string][]string{}
	for k, v := range m {
		out[k] = slices.Sorted(slices.Values(v))
	}
	return out
}

func TestSchemaMatchesSharedFixture(t *testing.T) {
	t.Parallel()
	f := readSchemaFixture(t)
	got := map[string][]string{}
	for e, fields := range Schema {
		got[e] = slices.Sorted(maps.Keys(fields))
	}
	if !maps.EqualFunc(got, sortedLists(f.Entities), slices.Equal) {
		t.Fatalf("sync.Schema and testdata/schema_fixture.json differ:\nSchema  %v\nfixture %v", got, f.Entities)
	}
	if !maps.EqualFunc(map[string][]string{"task": {FieldValuePrefix}}, f.FieldPrefixes, slices.Equal) {
		t.Fatalf("field prefixes: fixture %v, FieldValuePrefix %q", f.FieldPrefixes, FieldValuePrefix)
	}
	if !maps.EqualFunc(sortedLists(e2ee.ContentFields), sortedLists(f.ContentFields), slices.Equal) {
		t.Fatalf("e2ee.ContentFields and the fixture differ:\ncode    %v\nfixture %v", e2ee.ContentFields, f.ContentFields)
	}
	if !maps.EqualFunc(sortedLists(e2ee.ContentPrefixes), sortedLists(f.ContentPrefixes), slices.Equal) {
		t.Fatalf("e2ee.ContentPrefixes and the fixture differ:\ncode    %v\nfixture %v", e2ee.ContentPrefixes, f.ContentPrefixes)
	}
	// Every encrypted field is a field the schema accepts.
	for e, fields := range f.ContentFields {
		for _, name := range fields {
			if _, ok := Schema[e][name]; !ok {
				t.Errorf("content field %s.%s is not in the schema", e, name)
			}
		}
	}
	for e, ps := range f.ContentPrefixes {
		for _, p := range ps {
			if !slices.Contains(f.FieldPrefixes[e], p) {
				t.Errorf("content prefix %s.%s is not a field prefix", e, p)
			}
		}
	}
}
