package httpapi

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// errorCodesFixture lists every error code this package can answer with. The web
// client translates the codes it knows (OpenSpec change app-localization, design
// D6); its test (web/src/lib/i18n/errors.test.ts) fails when a code here has no
// translatable message.
const errorCodesFixture = "../../web/src/lib/i18n/server-error-codes.json"

// TestErrorCodesFixture collects the literal codes passed to writeError,
// oidcError and oidcFail, and the codes checkSubscriptionURL returns, and
// compares them with the fixture. UPDATE_ERROR_CODES=1 rewrites the fixture.
func TestErrorCodesFixture(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	set := map[string]bool{}
	fset := gotoken.NewFileSet()
	lit := func(e ast.Expr) (string, bool) {
		b, ok := e.(*ast.BasicLit)
		if !ok || b.Kind != gotoken.STRING {
			return "", false
		}
		s, err := strconv.Unquote(b.Value)
		return s, err == nil && s != ""
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
				var name string
				switch fn := n.Fun.(type) {
				case *ast.Ident:
					name = fn.Name
				case *ast.SelectorExpr:
					name = fn.Sel.Name
				}
				idx := map[string]int{"writeError": 2, "oidcError": 3, "oidcFail": 3}[name]
				if idx > 0 && len(n.Args) > idx {
					if s, ok := lit(n.Args[idx]); ok {
						set[s] = true
					}
				}
			case *ast.FuncDecl:
				if n.Name.Name != "checkSubscriptionURL" || n.Body == nil {
					return true
				}
				ast.Inspect(n.Body, func(m ast.Node) bool {
					if r, ok := m.(*ast.ReturnStmt); ok && len(r.Results) == 3 {
						if s, ok := lit(r.Results[1]); ok {
							set[s] = true
						}
					}
					return true
				})
			}
			return true
		})
	}
	codes := make([]string, 0, len(set))
	for c := range set {
		codes = append(codes, c)
	}
	slices.Sort(codes)
	want, _ := json.MarshalIndent(codes, "", "  ")
	want = append(want, '\n')
	if os.Getenv("UPDATE_ERROR_CODES") == "1" {
		if err := os.WriteFile(errorCodesFixture, want, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	got, err := os.ReadFile(errorCodesFixture)
	if err != nil || string(got) != string(want) {
		t.Fatalf("%s is out of date: run UPDATE_ERROR_CODES=1 go test ./internal/httpapi -run TestErrorCodesFixture and add a message for each new code to web/src/lib/i18n/errors.ts", errorCodesFixture)
	}
}
