package httpapi

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// TestErrorCodesFixture lists every error code the API can answer (writeError
// and oidcError calls, and "code" entries of hand-built envelopes) into
// testdata/error_codes.json, which the web client's translated error table is
// checked against (OpenSpec `app-localization`, design D6). Run with
// UPDATE_ERROR_CODES=1 to rewrite the fixture after adding a code.
func TestErrorCodesFixture(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	codes := map[string]bool{}
	fset := gotoken.NewFileSet()
	lit := func(e ast.Expr) (string, bool) {
		b, ok := e.(*ast.BasicLit)
		if !ok || b.Kind != gotoken.STRING {
			return "", false
		}
		s, err := strconv.Unquote(b.Value)
		return s, err == nil
	}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, f, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			switch n := n.(type) {
			case *ast.CallExpr:
				name := ""
				switch fn := n.Fun.(type) {
				case *ast.Ident:
					name = fn.Name
				case *ast.SelectorExpr:
					name = fn.Sel.Name
				}
				idx := map[string]int{"writeError": 2, "oidcError": 3}
				if i, ok := idx[name]; ok && len(n.Args) > i {
					if s, ok := lit(n.Args[i]); ok {
						codes[s] = true
					}
				}
			case *ast.KeyValueExpr:
				if k, ok := lit(n.Key); ok && k == "code" {
					if v, ok := lit(n.Value); ok {
						codes[v] = true
					}
				}
			}
			return true
		})
	}
	list := make([]string, 0, len(codes))
	for c := range codes {
		list = append(list, c)
	}
	sort.Strings(list)
	want, _ := json.MarshalIndent(list, "", "  ")
	want = append(want, '\n')
	path := filepath.Join("testdata", "error_codes.json")
	if os.Getenv("UPDATE_ERROR_CODES") != "" {
		if err := os.WriteFile(path, want, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(want) {
		t.Fatalf("%s is out of date: run UPDATE_ERROR_CODES=1 go test ./internal/httpapi -run TestErrorCodesFixture, then add the new codes to web/src/lib/i18n/errors.ts", path)
	}
}
