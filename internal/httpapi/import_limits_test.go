package httpapi

import (
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/importer"
)

// A file under the size limit whose CSV field or JSON nesting is over a shape
// limit is refused with 413 too_large and creates no job (OpenSpec change
// `importer-field-limits`).
func TestImportShapeLimits413(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	field := []byte("title,description\nbig,\"" + strings.Repeat("x", importer.MaxCSVFieldBytes+1) + "\"\n")
	nested := []byte(`{"tasks":` + strings.Repeat("[", importer.MaxJSONDepth+1) + strings.Repeat("]", importer.MaxJSONDepth+1) + `}`)
	for _, c := range []struct {
		name string
		data []byte
		want string
	}{{"big.csv", field, "a CSV field may hold at most"}, {"deep.json", nested, "nested more than"}} {
		for _, path := range []string{"/api/v1/import/preview", "/api/v1/import"} {
			resp, out := e.upload(path, c.name, c.data, nil)
			e.mustStatus(resp, 413, out)
			if errCode(out) != "too_large" || !strings.Contains(out["error"].(map[string]any)["message"].(string), c.want) {
				t.Fatalf("%s %s: %v", path, c.name, out)
			}
		}
	}
	resp, out := e.do("GET", "/api/v1/import/jobs", nil)
	e.mustStatus(resp, 200, out)
	if len(out["jobs"].([]any)) != 0 {
		t.Fatalf("a job was created: %v", out)
	}
}
