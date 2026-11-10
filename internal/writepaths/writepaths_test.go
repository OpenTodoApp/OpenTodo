// Package writepaths holds the repository check that synced data is written
// only through the op log (AGENTS.md non-negotiable 2; OpenSpec change
// external-security-review, task 5.6). It scans the non-test Go files under
// internal/ and cmd/, outside internal/sync, and fails when
//
//   - code refers to a method named Apply (a call or a method value) at a
//     place allowApply does not list: sync's Apply keeps the ops a batch
//     accepts and drops the refused ones, so REST handlers write with
//     ApplyStrict, which refuses the whole batch;
//   - a SQL string inserts, updates or deletes rows of a synced table, or
//     writes a table named at runtime at a place allowDynamicTable does not
//     list.
//
// Every allow-list entry carries its reason; an entry that no longer matches
// anything fails the check too, so the lists stay exact.
package writepaths

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// syncedTables hold synced data: the op log (ops, op_scopes), the
// materialized field values (scope_fields), the purge records devices pull
// (purges) and the scope a project's data lives in (project_scopes). Only
// internal/sync writes them; migrations (SQL files) are not scanned.
var syncedTables = []string{"ops", "op_scopes", "scope_fields", "purges", "project_scopes"}

// allowApply lists the places outside internal/sync that may refer to a
// method named Apply, as "path/from/repo.go:Recv.Func", with the reason.
var allowApply = map[string]string{
	"internal/httpapi/sync_handlers.go:Server.handleSync":  "the sync endpoint: a device's batch keeps the ops it may write and gets the refused ones back, by design (docs/sync-protocol.md)",
	"internal/importer/service.go:Service.writeBatch":      "an import job's batches (and the uploaded_at ops of its stored files): an op refused for authorization, such as a shared project whose role changed during the job, is counted as refused instead of failing the job; every op is still validated and authorized",
	"internal/importer/service.go:Service.Undo":            "undoing an import job tombstones what it created and repairs references to it; an op the account can no longer write is refused alone, so the rest of the undo still applies",
	"internal/push/service.go:Service.recordReminderField": "one server op recording that the user's reminder was delivered or dismissed: with a single op, Apply and ApplyStrict refuse the same thing",
	"internal/agenttools/registry.go:Registry.write":       "agenttools.Registry.Apply, not sync's: it writes with ApplyStrict (internal/agenttools/apply.go)",
	"internal/agenttools/rest.go:Registry.writeAll":        "agenttools.Registry.Apply, not sync's: it writes with ApplyStrict (internal/agenttools/apply.go)",
	"internal/vault/exchange.go:engine.absorb":             "vault.Store.Apply, the CLI vault's own in-memory replica, not the server",
	"internal/vault/engine.go:Sync":                        "vault.Store.Apply, the CLI vault's own in-memory replica, not the server",
}

// allowDynamicTable lists the places whose SQL writes a table named at run
// time, with the table names they can take.
var allowDynamicTable = map[string]string{
	"internal/deliveryq/deliveryq.go:Prune":       "the webhook and notification channel delivery queues (webhook_deliveries, notification_deliveries)",
	"internal/assistant/config.go:Store.AddUsage": "the assistant's monthly token usage (assistant_usage, assistant_usage_own_key)",
	"internal/mcpoauth/mcpoauth.go:Store.rotate":  "a refresh token's rotation (mcp_oauth_grant and mcp_oauth_refresh_used, or app_sign_in_grant and app_sign_in_refresh_used)",
}

// allowSyncedTable lists the places outside internal/sync that write a
// synced table, as "path:Func table", with the reason.
var allowSyncedTable = map[string]string{
	"internal/demo/sandbox.go:Service.deleteAccounts purges": "removing a demo visitor's sandbox: sync.DeleteAccountData has just deleted the scopes' data in the same transaction, and their purge records go with them",
}

var (
	writeSQL    = regexp.MustCompile(`(?is)\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["` + "`" + `]?(\w+)`)
	dynamicSQL  = regexp.MustCompile(`(?is)\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|DELETE\s+FROM)\s*$`)
	createTable = regexp.MustCompile(`(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)`)
)

// file is one parsed non-test Go file outside internal/sync.
type file struct {
	rel string
	f   *ast.File
}

func sources(t *testing.T) []file {
	t.Helper()
	fset := token.NewFileSet()
	var out []file
	for _, top := range []string{"internal", "cmd"} {
		err := filepath.WalkDir(filepath.Join("..", "..", top), func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			rel := filepath.ToSlash(strings.TrimPrefix(path, filepath.Join("..", "..")+string(filepath.Separator)))
			if d.IsDir() {
				if name := d.Name(); name == "testdata" || name == "dist" || name == "node_modules" || rel == "internal/sync" {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
			if err != nil {
				return err
			}
			out = append(out, file{rel, f})
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(out) < 100 {
		t.Fatalf("only %d source files found; is the check run from internal/writepaths?", len(out))
	}
	return out
}

// funcName is "Recv.Name" for a method and "Name" for a function.
func funcName(fn *ast.FuncDecl) string {
	if fn.Recv == nil || len(fn.Recv.List) == 0 {
		return fn.Name.Name
	}
	typ := fn.Recv.List[0].Type
	for {
		switch x := typ.(type) {
		case *ast.StarExpr:
			typ = x.X
			continue
		case *ast.IndexExpr:
			typ = x.X
			continue
		case *ast.IndexListExpr:
			typ = x.X
			continue
		}
		break
	}
	if id, ok := typ.(*ast.Ident); ok {
		return id.Name + "." + fn.Name.Name
	}
	return fn.Name.Name
}

// eachDecl calls visit for every node of f with the name of the function it
// is in ("" at package level).
func eachDecl(f *ast.File, visit func(fn string, n ast.Node)) {
	for _, decl := range f.Decls {
		name := ""
		if fn, ok := decl.(*ast.FuncDecl); ok {
			name = funcName(fn)
		}
		ast.Inspect(decl, func(n ast.Node) bool {
			if n != nil {
				visit(name, n)
			}
			return true
		})
	}
}

// imported is the names a file's imports bind.
func imported(f *ast.File) map[string]bool {
	out := map[string]bool{}
	for _, im := range f.Imports {
		p, _ := strconv.Unquote(im.Path.Value)
		name := p[strings.LastIndex(p, "/")+1:]
		if im.Name != nil {
			name = im.Name.Name
		}
		out[name] = true
	}
	return out
}

func checkAllowList(t *testing.T, what string, allow map[string]string, seen map[string]bool) {
	t.Helper()
	var stale []string
	for k, reason := range allow {
		if strings.TrimSpace(reason) == "" {
			t.Errorf("%s allow-list entry %s has no reason", what, k)
		}
		if !seen[k] {
			stale = append(stale, k)
		}
	}
	sort.Strings(stale)
	for _, k := range stale {
		t.Errorf("%s allow-list entry %s matches nothing; remove it", what, k)
	}
}

// TestWritesGoThroughApplyStrict fails on a reference to a method named
// Apply outside internal/sync that allowApply does not list. A REST handler
// writes with sync's ApplyStrict; the sync endpoint is the one handler that
// uses Apply.
func TestWritesGoThroughApplyStrict(t *testing.T) {
	seen := map[string]bool{}
	var bad []string
	for _, src := range sources(t) {
		pkgs := imported(src.f)
		eachDecl(src.f, func(fn string, n ast.Node) {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "Apply" {
				return
			}
			if id, ok := sel.X.(*ast.Ident); ok && pkgs[id.Name] {
				return // a package's function, not a method
			}
			key := src.rel + ":" + fn
			seen[key] = true
			if _, ok := allowApply[key]; !ok {
				bad = append(bad, key)
			}
		})
	}
	sort.Strings(bad)
	for _, k := range bad {
		t.Errorf("%s refers to a method named Apply: write with sync's ApplyStrict, or add it to allowApply with the reason", k)
	}
	checkAllowList(t, "allowApply", allowApply, seen)
	for k := range allowApply {
		if strings.HasPrefix(k, "internal/httpapi/") && k != "internal/httpapi/sync_handlers.go:Server.handleSync" {
			t.Errorf("%s: a REST handler writes with ApplyStrict; only the sync endpoint uses Apply", k)
		}
	}
}

// TestNoSyncedTableWritesOutsideSync fails on SQL outside internal/sync that
// writes a synced table, or a table named at run time, unless allow-listed.
func TestNoSyncedTableWritesOutsideSync(t *testing.T) {
	synced := map[string]bool{}
	for _, tbl := range syncedTables {
		synced[tbl] = true
	}
	checkTablesExist(t, synced)
	seenSynced, seenDynamic := map[string]bool{}, map[string]bool{}
	var bad []string
	for _, src := range sources(t) {
		eachDecl(src.f, func(fn string, n ast.Node) {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return
			}
			s, err := strconv.Unquote(lit.Value)
			if err != nil {
				return
			}
			where := src.rel + ":" + fn
			for _, m := range writeSQL.FindAllStringSubmatch(s, -1) {
				if tbl := strings.ToLower(m[1]); synced[tbl] {
					key := where + " " + tbl
					seenSynced[key] = true
					if _, ok := allowSyncedTable[key]; !ok {
						bad = append(bad, key+": writes the synced table "+tbl+"; write through the op log (internal/sync)")
					}
				}
			}
			if dynamicSQL.MatchString(s) {
				seenDynamic[where] = true
				if _, ok := allowDynamicTable[where]; !ok {
					bad = append(bad, where+": writes a table named at run time; name it in the SQL, or add the place to allowDynamicTable with the tables it can take")
				}
			}
		})
	}
	sort.Strings(bad)
	for _, b := range bad {
		t.Error(b)
	}
	checkAllowList(t, "allowSyncedTable", allowSyncedTable, seenSynced)
	checkAllowList(t, "allowDynamicTable", allowDynamicTable, seenDynamic)
}

// checkTablesExist keeps syncedTables honest: each one is created by a
// migration.
func checkTablesExist(t *testing.T, synced map[string]bool) {
	t.Helper()
	dir := filepath.Join("..", "store", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	created := map[string]bool{}
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range createTable.FindAllStringSubmatch(string(b), -1) {
			created[strings.ToLower(m[1])] = true
		}
	}
	for tbl := range synced {
		if !created[tbl] {
			t.Errorf("synced table %s is created by no migration", tbl)
		}
	}
}
