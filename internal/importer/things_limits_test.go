package importer

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// thingsVariant is the fixture database after stmts ran on a private copy.
func thingsVariant(t *testing.T, stmts ...string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/things-db/main.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "main.sqlite")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			db.Close()
			t.Fatalf("%s: %v", s, err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	out, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// A Things file is someone's upload: expressions in its schema must not run on
// the server while it is read (security audit M3). Each variant parsed before the
// fix, running the file's expression for every row.
func TestThingsRefusesSchemaThatComputes(t *testing.T) {
	// Each case replaces the TMTag table with create (fts5 is built into the driver).
	for name, c := range map[string]struct{ create, want string }{
		"virtual generated column": {"CREATE TABLE TMTag (uuid TEXT PRIMARY KEY, title TEXT GENERATED ALWAYS AS (printf('%.*c', 1000, 'x')) VIRTUAL, parent TEXT)",
			"TMTag has generated columns"},
		"stored generated column": {"CREATE TABLE TMTag (uuid TEXT PRIMARY KEY, title TEXT, parent TEXT, shadow TEXT GENERATED ALWAYS AS (upper(title)) STORED)",
			"TMTag has generated columns"},
		"virtual table": {"CREATE VIRTUAL TABLE TMTag USING fts5(uuid, title, parent)", "TMTag is a virtual table"},
	} {
		t.Run(name, func(t *testing.T) {
			data := thingsVariant(t, "ALTER TABLE TMTag RENAME TO TMTagOld", c.create, "INSERT INTO TMTag(uuid, parent) SELECT uuid, parent FROM TMTagOld", "DROP TABLE TMTagOld")
			_, err := parseWith(t, data, nil)
			wantFileError(t, err, c.want)
		})
	}
}

// No value longer than thingsMaxValue is read, stored or computed.
func TestThingsRefusesOversizedValue(t *testing.T) {
	data := thingsVariant(t, "UPDATE TMTask SET notes = printf('%.*c', 1100000, 'x') WHERE rowid = (SELECT MIN(rowid) FROM TMTask)")
	_, err := parseWith(t, data, nil)
	wantFileError(t, err, "too big")
	// The unchanged fixture still imports.
	if _, err := parseWith(t, thingsVariant(t), nil); err != nil {
		t.Fatal(err)
	}
}
