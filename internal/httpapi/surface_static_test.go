package httpapi

import (
	"go/ast"
	"go/constant"
	"go/importer"
	"go/parser"
	gotoken "go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The static half of the v1 surface (OpenSpec change `stability-contract`,
// design D1): request and response fields of each route, read from the types
// its handler decodes and encodes, and every error code with its statuses.
// The packages that register routes are type-checked from source; their
// dependencies come from the build cache (`go list -export`), so this needs
// the go command, like `go test` itself.

// surfacePackages are the packages that register routes, relative to this one.
var surfacePackages = []string{".", "./speech", "./maproutes", "./davroutes", "./httpx"}

// staticPkg is one type-checked package.
type staticPkg struct {
	fset  *gotoken.FileSet
	files []*ast.File
	info  *types.Info
	pkg   *types.Package
	decls map[*types.Func]*ast.FuncDecl
}

// loadStatic type-checks the route packages.
func loadStatic(t *testing.T) []*staticPkg {
	t.Helper()
	args := append([]string{"list", "-deps", "-export", "-f", "{{.ImportPath}}\t{{.Export}}\t{{.Dir}}\t{{join .GoFiles \",\"}}"}, surfacePackages...)
	out, err := exec.Command("go", args...).Output()
	if err != nil {
		t.Fatalf("go list: %v", err)
	}
	exports := map[string]string{}
	type src struct{ path, dir, files string }
	var sources []src
	targets := map[string]bool{}
	for _, p := range surfacePackages {
		abs, _ := filepath.Abs(p)
		targets[abs] = true
	}
	for line := range strings.SplitSeq(strings.TrimSpace(string(out)), "\n") {
		f := strings.Split(line, "\t")
		if len(f) != 4 {
			continue
		}
		exports[f[0]] = f[1]
		if targets[f[2]] {
			sources = append(sources, src{f[0], f[2], f[3]})
		}
	}
	fset := gotoken.NewFileSet()
	imp := importer.ForCompiler(fset, "gc", func(path string) (io.ReadCloser, error) {
		return os.Open(exports[path])
	})
	var pkgs []*staticPkg
	for _, s := range sources {
		p := &staticPkg{fset: fset, decls: map[*types.Func]*ast.FuncDecl{}}
		for name := range strings.SplitSeq(s.files, ",") {
			f, err := parser.ParseFile(fset, filepath.Join(s.dir, name), nil, 0)
			if err != nil {
				t.Fatal(err)
			}
			p.files = append(p.files, f)
		}
		p.info = &types.Info{Types: map[ast.Expr]types.TypeAndValue{}, Defs: map[*ast.Ident]types.Object{}, Uses: map[*ast.Ident]types.Object{}}
		conf := types.Config{Importer: imp}
		if p.pkg, err = conf.Check(s.path, fset, p.files, p.info); err != nil {
			t.Fatalf("type-check %s: %v", s.path, err)
		}
		for _, f := range p.files {
			for _, d := range f.Decls {
				if fd, ok := d.(*ast.FuncDecl); ok {
					if fn, ok := p.info.Defs[fd.Name].(*types.Func); ok {
						p.decls[fn] = fd
					}
				}
			}
		}
		pkgs = append(pkgs, p)
	}
	return pkgs
}

// staticRoute is what the sources say about one route.
type staticRoute struct {
	request  fieldSet
	response fieldSet
	statuses map[string]bool
}

// fieldSet maps a JSON path ("user.email", "tasks[].title") to its type.
type fieldSet map[string]string

// staticRoutes reads the request and response fields of every route
// registered with a constant pattern.
func staticRoutes(pkgs []*staticPkg) map[string]*staticRoute {
	routes := map[string]*staticRoute{}
	for _, p := range pkgs {
		for _, f := range p.files {
			ast.Inspect(f, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) != 3 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || (sel.Sel.Name != "handle" && sel.Sel.Name != "Handle" && sel.Sel.Name != "handler") {
					return true
				}
				tv := p.info.Types[call.Args[0]]
				if tv.Value == nil || tv.Value.Kind() != constant.String {
					return true
				}
				pattern := constant.StringVal(tv.Value)
				r := routes[pattern]
				if r == nil {
					r = &staticRoute{request: fieldSet{}, response: fieldSet{}, statuses: map[string]bool{}}
					routes[pattern] = r
				}
				w := &walker{p: p, seen: map[ast.Node]bool{}, route: r}
				w.expr(call.Args[2])
				return true
			})
		}
	}
	return routes
}

// walker follows a handler through the functions of its package it refers to.
type walker struct {
	p     *staticPkg
	seen  map[ast.Node]bool
	route *staticRoute
}

// expr walks a handler expression: a method value, a function, a factory
// call or a function literal, and every function of the package it names.
func (w *walker) expr(e ast.Node) {
	ast.Inspect(e, func(n ast.Node) bool {
		switch n := n.(type) {
		case *ast.Ident:
			w.ref(n)
		case *ast.FuncLit:
			w.body(n.Body)
			return false
		}
		return true
	})
}

// ref walks the declaration of a same-package function an identifier names.
func (w *walker) ref(id *ast.Ident) {
	fn, ok := w.p.info.Uses[id].(*types.Func)
	if !ok || fn.Pkg() != w.p.pkg {
		return
	}
	if fd := w.p.decls[fn]; fd != nil && fd.Body != nil {
		w.body(fd.Body)
	}
}

// body records the decodes and encodes of a function body, then follows the
// functions it names.
func (w *walker) body(b *ast.BlockStmt) {
	if w.seen[b] {
		return
	}
	w.seen[b] = true
	ast.Inspect(b, func(n ast.Node) bool {
		switch n := n.(type) {
		case *ast.CallExpr:
			w.call(n, b)
		case *ast.Ident:
			w.ref(n)
		}
		return true
	})
}

// call records one decode (request fields) or JSON answer (status and
// response fields).
func (w *walker) call(c *ast.CallExpr, scope *ast.BlockStmt) {
	switch calleeName(c) {
	case "readJSON", "readJSONLoose", "readJSONLimit", "readOptionalJSON", "ReadJSON", "ReadJSONLoose", "ReadJSONLimit", "ReadOptionalJSON":
		if len(c.Args) >= 2 {
			w.decoded(c.Args[1], scope)
		}
	case "Decode":
		if len(c.Args) == 1 {
			if sel, ok := c.Fun.(*ast.SelectorExpr); ok {
				if inner, ok := sel.X.(*ast.CallExpr); ok && calleeName(inner) == "NewDecoder" {
					w.decoded(c.Args[0], scope)
				}
			}
		}
	case "writeJSON", "WriteJSON":
		if len(c.Args) != 3 {
			return
		}
		if v := w.p.info.Types[c.Args[1]].Value; v != nil {
			w.route.statuses[v.ExactString()] = true
		}
		w.encoded(c.Args[2], scope, "", w.route.response, 0)
	}
}

// decoded records the fields of a decode destination (&in).
func (w *walker) decoded(e ast.Expr, scope *ast.BlockStmt) {
	t := w.p.info.TypeOf(e)
	if t == nil {
		return
	}
	if ptr, ok := t.(*types.Pointer); ok {
		t = ptr.Elem()
	}
	describeType(t, "", w.route.request, true, map[types.Type]bool{}, 0)
}

// encoded records the fields of an answered value: the keys of a map literal
// (and of assignments to a local map), or the fields of its type.
func (w *walker) encoded(e ast.Expr, scope *ast.BlockStmt, prefix string, out fieldSet, depth int) {
	if depth > 4 {
		return
	}
	e = ast.Unparen(e)
	if lit, ok := e.(*ast.CompositeLit); ok {
		if m, ok := w.p.info.TypeOf(lit).Underlying().(*types.Map); ok && isString(m.Key()) {
			for _, el := range lit.Elts {
				kv, ok := el.(*ast.KeyValueExpr)
				if !ok {
					continue
				}
				if key, ok := constString(w.p.info, kv.Key); ok {
					w.member(prefix+key, kv.Value, scope, out, depth)
				}
			}
			return
		}
	}
	if id, ok := e.(*ast.Ident); ok {
		if obj, ok := w.p.info.Uses[id].(*types.Var); ok {
			if m, ok := obj.Type().Underlying().(*types.Map); ok && isString(m.Key()) {
				if w.localMap(obj, scope, prefix, out, depth) {
					return
				}
			}
		}
	}
	if c, ok := e.(*ast.CallExpr); ok && w.returned(c, prefix, out, depth) {
		return
	}
	if t := w.p.info.TypeOf(e); t != nil {
		describeType(t, strings.TrimSuffix(prefix, "."), out, false, map[types.Type]bool{}, 0)
	}
}

// returned records what a same-package function returns when its result is
// answered as a map (writeJSON(w, 200, s.status(r))). It reports whether the
// call was such a function.
func (w *walker) returned(c *ast.CallExpr, prefix string, out fieldSet, depth int) bool {
	var id *ast.Ident
	switch f := c.Fun.(type) {
	case *ast.Ident:
		id = f
	case *ast.SelectorExpr:
		id = f.Sel
	}
	fn, ok := w.p.info.Uses[id].(*types.Func)
	if !ok || fn.Pkg() != w.p.pkg {
		return false
	}
	fd := w.p.decls[fn]
	if fd == nil || fd.Body == nil || fd.Type.Results == nil || len(fd.Type.Results.List) != 1 {
		return false
	}
	if m, ok := fn.Signature().Results().At(0).Type().Underlying().(*types.Map); !ok || !isString(m.Key()) {
		return false
	}
	ast.Inspect(fd.Body, func(n ast.Node) bool {
		switch n := n.(type) {
		case *ast.FuncLit:
			return false
		case *ast.ReturnStmt:
			if len(n.Results) == 1 {
				w.encoded(n.Results[0], fd.Body, prefix, out, depth+1)
			}
		}
		return true
	})
	return true
}

// member records one key of an answered map and its value.
func (w *walker) member(path string, v ast.Expr, scope *ast.BlockStmt, out fieldSet, depth int) {
	t := w.p.info.TypeOf(v)
	if t == nil {
		return
	}
	out[path] = jsonType(t)
	switch u := t.Underlying().(type) {
	case *types.Map, *types.Struct, *types.Pointer:
		w.encoded(v, scope, path+".", out, depth+1)
	case *types.Slice:
		if _, isBytes := u.Elem().Underlying().(*types.Basic); !isBytes {
			describeElemType(u.Elem(), path+"[]", out, map[types.Type]bool{})
		}
	}
}

// localMap records the keys of a local map variable: its composite literal and
// every out["key"] = value assignment in the function. It reports whether it
// found any.
func (w *walker) localMap(obj *types.Var, scope *ast.BlockStmt, prefix string, out fieldSet, depth int) bool {
	found := false
	ast.Inspect(scope, func(n ast.Node) bool {
		as, ok := n.(*ast.AssignStmt)
		if !ok {
			return true
		}
		for i, lhs := range as.Lhs {
			if i >= len(as.Rhs) {
				break
			}
			if id, ok := lhs.(*ast.Ident); ok && w.p.info.ObjectOf(id) == obj {
				if lit, ok := ast.Unparen(as.Rhs[i]).(*ast.CompositeLit); ok {
					w.encoded(lit, scope, prefix, out, depth)
					found = true
				}
			}
			if ix, ok := lhs.(*ast.IndexExpr); ok {
				if id, ok := ix.X.(*ast.Ident); ok && w.p.info.ObjectOf(id) == obj {
					if key, ok := constString(w.p.info, ix.Index); ok {
						w.member(prefix+key, as.Rhs[i], scope, out, depth)
						found = true
					}
				}
			}
		}
		return true
	})
	// var out = map[...]...{...}
	ast.Inspect(scope, func(n ast.Node) bool {
		vs, ok := n.(*ast.ValueSpec)
		if !ok {
			return true
		}
		for i, name := range vs.Names {
			if w.p.info.Defs[name] == obj && i < len(vs.Values) {
				w.encoded(vs.Values[i], scope, prefix, out, depth)
				found = true
			}
		}
		return true
	})
	return found
}

// describe records the JSON fields of t under prefix. Request fields that may
// be left out (a pointer, omitempty) carry a "?" after their type.
func describeType(t types.Type, prefix string, out fieldSet, request bool, seen map[types.Type]bool, depth int) {
	if depth > 5 || seen[t] {
		return
	}
	if ptr, ok := t.(*types.Pointer); ok {
		t = ptr.Elem()
	}
	if customJSON(t) {
		return
	}
	switch u := t.Underlying().(type) {
	case *types.Struct:
		seen[t] = true
		defer delete(seen, t)
		for i := range u.NumFields() {
			f := u.Field(i)
			name, opts, ok := jsonName(f, u.Tag(i))
			if !ok {
				continue
			}
			if name == "" { // embedded struct: inlined
				describeType(f.Type(), prefix, out, request, seen, depth+1)
				continue
			}
			path := join(prefix, name)
			typ := jsonType(f.Type())
			if request {
				if _, isPtr := f.Type().(*types.Pointer); isPtr || strings.Contains(opts, "omitempty") || strings.Contains(opts, "omitzero") {
					typ += "?"
				}
			}
			out[path] = typ
			describeType(f.Type(), path, out, request, seen, depth+1)
			if s, ok := derefType(f.Type()).Underlying().(*types.Slice); ok {
				describeElemType(s.Elem(), path+"[]", out, seen)
			}
		}
	case *types.Slice:
		if prefix != "" {
			return
		}
		describeElemType(u.Elem(), "[]", out, seen)
	}
}

// describeElem records the fields of a list element type.
func describeElemType(t types.Type, prefix string, out fieldSet, seen map[types.Type]bool) {
	if _, ok := derefType(t).Underlying().(*types.Struct); ok && !customJSON(derefType(t)) {
		describeType(t, prefix, out, false, seen, 1)
	}
}

// jsonName is a struct field's JSON name and tag options; ok is false for a
// field encoding/json leaves out. An embedded struct without a name is "".
func jsonName(f *types.Var, tag string) (name, opts string, ok bool) {
	jt, _ := reflectTag(tag, "json")
	name, opts, _ = strings.Cut(jt, ",")
	switch {
	case name == "-" && opts == "":
		return "", "", false
	case !f.Exported() && !f.Embedded():
		return "", "", false
	case name == "" && f.Embedded():
		if _, ok := derefType(f.Type()).Underlying().(*types.Struct); ok {
			return "", opts, true
		}
		return f.Name(), opts, f.Exported()
	case name == "":
		return f.Name(), opts, true
	}
	return name, opts, true
}

// reflectTag is reflect.StructTag.Lookup over a raw tag string.
func reflectTag(tag, key string) (string, bool) {
	for tag != "" {
		i := strings.Index(tag, `:"`)
		if i < 0 {
			return "", false
		}
		name := strings.TrimSpace(tag[:i])
		rest := tag[i+1:]
		j := 1
		for j < len(rest) && rest[j] != '"' {
			if rest[j] == '\\' {
				j++
			}
			j++
		}
		if j >= len(rest) {
			return "", false
		}
		if name == key {
			v, err := strconv.Unquote(rest[:j+1])
			return v, err == nil
		}
		tag = rest[j+1:]
	}
	return "", false
}

// jsonType is the JSON type a Go type encodes as.
func jsonType(t types.Type) string {
	nullable := ""
	if ptr, ok := t.(*types.Pointer); ok {
		t, nullable = ptr.Elem(), "|null"
	}
	if named, ok := t.(*types.Named); ok {
		switch named.Obj().Pkg().Path() + "." + named.Obj().Name() {
		case "time.Time":
			return "string" + nullable
		case "encoding/json.RawMessage":
			return "any"
		}
	}
	if customJSON(t) {
		return "any"
	}
	switch u := t.Underlying().(type) {
	case *types.Basic:
		switch {
		case u.Info()&types.IsString != 0:
			return "string" + nullable
		case u.Info()&types.IsBoolean != 0:
			return "boolean" + nullable
		case u.Info()&types.IsNumeric != 0:
			return "number" + nullable
		}
	case *types.Slice:
		if b, ok := u.Elem().Underlying().(*types.Basic); ok && b.Kind() == types.Byte {
			return "string" + nullable
		}
		return "array"
	case *types.Array:
		return "array"
	case *types.Map, *types.Struct:
		return "object" + nullable
	}
	return "any"
}

// customJSON reports a named type with its own MarshalJSON or UnmarshalJSON.
func customJSON(t types.Type) bool {
	named, ok := t.(*types.Named)
	if !ok {
		return false
	}
	if p := named.Obj().Pkg(); p != nil && p.Path() == "time" {
		return true
	}
	ms := types.NewMethodSet(types.NewPointer(named))
	for _, m := range []string{"MarshalJSON", "UnmarshalJSON", "MarshalText"} {
		if ms.Lookup(named.Obj().Pkg(), m) != nil || ms.Lookup(nil, m) != nil {
			return true
		}
	}
	return false
}

func derefType(t types.Type) types.Type {
	if p, ok := t.(*types.Pointer); ok {
		return p.Elem()
	}
	return t
}

func isString(t types.Type) bool {
	b, ok := t.Underlying().(*types.Basic)
	return ok && b.Info()&types.IsString != 0
}

func join(prefix, name string) string {
	if prefix == "" {
		return name
	}
	return prefix + "." + name
}

func constString(info *types.Info, e ast.Expr) (string, bool) {
	tv := info.Types[e]
	if tv.Value == nil || tv.Value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(tv.Value), true
}

// calleeName is the name of the function a call calls (writeJSON,
// httpx.WriteJSON, s.helper).
func calleeName(c *ast.CallExpr) string {
	switch f := c.Fun.(type) {
	case *ast.Ident:
		return f.Name
	case *ast.SelectorExpr:
		return f.Sel.Name
	}
	return ""
}

// errorStatuses reads every error code the route packages answer with a
// constant status and code: code → statuses.
func errorStatuses(pkgs []*staticPkg) map[string][]string {
	found := map[string]map[string]bool{}
	add := func(code, status string) {
		if found[code] == nil {
			found[code] = map[string]bool{}
		}
		found[code][status] = true
	}
	for _, p := range pkgs {
		for _, f := range p.files {
			ast.Inspect(f, func(n ast.Node) bool {
				c, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				switch calleeName(c) {
				case "writeError", "WriteError", "writeErrorWith", "WriteErrorWith":
					if len(c.Args) < 3 {
						return true
					}
					code, ok := constString(p.info, c.Args[2])
					if st := p.info.Types[c.Args[1]].Value; ok && st != nil {
						add(code, st.ExactString())
					}
				case "badBodyWith", "BadBodyWith":
					if len(c.Args) == 4 {
						if code, ok := constString(p.info, c.Args[2]); ok {
							add(code, "400")
						}
					}
				}
				return true
			})
		}
	}
	out := map[string][]string{}
	for code, sts := range found {
		for s := range sts {
			out[code] = append(out[code], s)
		}
		sort.Strings(out[code])
	}
	return out
}
