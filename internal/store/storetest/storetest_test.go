package storetest

import (
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

// schema is everything a migration leaves behind: the schema, the version, the
// applied files and the settings rows (their values, but the generation's).
func schema(t *testing.T, db *sql.DB) string {
	t.Helper()
	var out strings.Builder
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	fmt.Fprintf(&out, "user_version %d\n", version)
	for _, q := range []string{
		`SELECT type || ' ' || name || ' ' || COALESCE(sql, '') FROM sqlite_master ORDER BY type, name`,
		`SELECT name FROM schema_migrations ORDER BY name`,
		`SELECT key || '=' || CASE key WHEN 'generation' THEN '' ELSE value END FROM settings ORDER BY key`,
	} {
		rows, err := db.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out.WriteString(s + "\n")
		}
		rows.Close()
	}
	return out.String()
}

func generation(t *testing.T, db *sql.DB) string {
	t.Helper()
	var g string
	if err := db.QueryRow(`SELECT value FROM settings WHERE key = 'generation'`).Scan(&g); err != nil {
		t.Fatal(err)
	}
	return g
}

// TestCopyIsAMigratedDatabase: a copy of the template has the schema a new
// database gets from store.Open, and its own log generation.
func TestCopyIsAMigratedDatabase(t *testing.T) {
	fresh, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer fresh.Close()
	a, dirA := Open(t)
	b, _ := Open(t)
	if got, want := schema(t, a), schema(t, fresh); got != want {
		t.Fatalf("the copy's schema differs from a new database's:\n%s\nwant:\n%s", got, want)
	}
	if ga, gb := generation(t, a), generation(t, b); ga == gb || len(ga) != 32 {
		t.Fatalf("generations %q and %q: want two distinct ones", ga, gb)
	}
	if _, err := os.Stat(store.DBPath(dirA)); err != nil {
		t.Fatalf("the database is not in its directory: %v", err)
	}
	// The copies are independent files.
	if _, err := a.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('u','u@example.com','u','h',1)`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := b.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("users in the other copy: %d %v", n, err)
	}
}

// TestOpenDirRefusesAnExistingDatabase: a copy never replaces a database.
func TestOpenDirRefusesAnExistingDatabase(t *testing.T) {
	_, dir := Open(t)
	if db, err := OpenDir(dir); err == nil {
		db.Close()
		t.Fatal("OpenDir replaced an existing database")
	}
}

// TestServerDoesNotLinkStoretest: the template is a test helper.
func TestServerDoesNotLinkStoretest(t *testing.T) {
	gobin, err := exec.LookPath("go")
	if err != nil {
		if gobin, err = exec.LookPath(filepath.Join(os.Getenv("GOROOT"), "bin", "go")); err != nil {
			t.Skip("the go command is not on PATH")
		}
	}
	out, err := exec.Command(gobin, "list", "-deps", "../../../cmd/opentodo").CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, out)
	}
	if strings.Contains(string(out), "internal/store/storetest") {
		t.Fatal("the server binary links internal/store/storetest")
	}
}
