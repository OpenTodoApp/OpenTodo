package codesize

import (
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// TestRowLoopsCheckErr keeps every `for rows.Next()` loop in internal/ paired
// with a `rows.Err()` check in the same function (audit finding G7). Next
// returns false both at the end of the result and on an error part way
// through; without Err a partial read looks complete, and a sweep that deletes
// what it did not see would delete live data. Like rowserrcheck, but without a
// dependency: any `for x.Next()` loop counts, so another iterator with a
// boolean Next must check its Err too.
func TestRowLoopsCheckErr(t *testing.T) {
	root := ".."
	fset := token.NewFileSet()
	var missing []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if name := d.Name(); name == "testdata" || name == "dist" || name == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		rel := filepath.ToSlash(strings.TrimPrefix(path, root+string(filepath.Separator)))
		f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		for _, m := range uncheckedRowLoops(fset, f) {
			missing = append(missing, rel+":"+m)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(missing)
	for _, m := range missing {
		t.Errorf("%s: row loop without an Err() check in the same function", m)
	}
}

// uncheckedRowLoops reports "line (expr)" for the `for x.Next()` loops of a
// function that calls x.Err() fewer times than it loops over x (a variable
// reused for a second query needs its own check).
func uncheckedRowLoops(fset *token.FileSet, f *ast.File) []string {
	var out []string
	var visit func(body *ast.BlockStmt)
	visit = func(body *ast.BlockStmt) {
		if body == nil {
			return
		}
		loops := map[string][]token.Pos{}
		errs := map[string]int{}
		ast.Inspect(body, func(n ast.Node) bool {
			switch n := n.(type) {
			case *ast.FuncLit:
				visit(n.Body) // its own scope
				return false
			case *ast.ForStmt:
				if x, ok := methodCall(fset, n.Cond, "Next"); ok {
					loops[x] = append(loops[x], n.Pos())
				}
			case *ast.CallExpr:
				if x, ok := methodCall(fset, n, "Err"); ok {
					errs[x]++
				}
			}
			return true
		})
		for x, positions := range loops {
			if errs[x] >= len(positions) {
				continue
			}
			for _, p := range positions {
				out = append(out, strconv.Itoa(fset.Position(p).Line)+" ("+x+")")
			}
		}
	}
	for _, decl := range f.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok {
			visit(fn.Body)
		}
	}
	return out
}

// methodCall reports the receiver expression of a call `x.name()` without
// arguments.
func methodCall(fset *token.FileSet, e ast.Expr, name string) (string, bool) {
	call, ok := e.(*ast.CallExpr)
	if !ok || len(call.Args) != 0 {
		return "", false
	}
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != name {
		return "", false
	}
	var b strings.Builder
	if err := printer.Fprint(&b, fset, sel.X); err != nil {
		return "", false
	}
	return b.String(), true
}
