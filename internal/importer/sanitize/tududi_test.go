package main

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// A Tududi database keeps its tables, ids, dates and codes; names, notes and
// the account's text become placeholders, the built-in tags stay, and tables
// the importer does not read are emptied.
func TestTududiSQLite(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "in.sqlite3")
	db, err := sql.Open("sqlite", in)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"CREATE TABLE `users` (`id` INTEGER PRIMARY KEY, `uid` TEXT, `email` TEXT NOT NULL, `name` TEXT, `password_digest` TEXT NOT NULL, `timezone` TEXT)",
		"CREATE TABLE `areas` (`id` INTEGER PRIMARY KEY, `name` TEXT, `description` TEXT)",
		"CREATE TABLE `projects` (`id` INTEGER PRIMARY KEY, `name` TEXT, `description` TEXT)",
		"CREATE TABLE `tasks` (`id` INTEGER PRIMARY KEY, `name` TEXT, `note` TEXT, `due_date` TEXT, `status` INTEGER)",
		"CREATE TABLE `tags` (`id` INTEGER PRIMARY KEY, `name` TEXT, `tag_type` TEXT)",
		"CREATE TABLE `tasks_tags` (`task_id` INTEGER, `tag_id` INTEGER)",
		"CREATE TABLE `Sessions` (`sid` TEXT, `data` TEXT)",
		"INSERT INTO users VALUES (1, 'u1', 'jane@private.example', 'Jane', 'bcrypt-hash', 'Europe/Rome')",
		"INSERT INTO areas VALUES (1, 'Family', 'Kids and school')",
		"INSERT INTO projects VALUES (1, 'Wedding', 'Venue ideas')",
		"INSERT INTO tasks VALUES (1, 'Call grandma', 'about the birthday', '2026-11-20 23:59:59.999 +00:00', 2)",
		"INSERT INTO tags VALUES (1, 'someday', 'system'), (2, 'secretlabel', 'user')",
		"INSERT INTO Sessions VALUES ('abc', 'session-cookie')",
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	out := filepath.Join(dir, "out.sqlite3")
	if err := newScrubber().sqlite(in, out); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(out)
	for _, gone := range []string{"jane@", "Jane", "bcrypt", "Family", "Kids", "Wedding", "Venue", "grandma", "birthday", "secretlabel", "session-cookie"} {
		if bytes.Contains(raw, []byte(gone)) {
			t.Fatalf("%q survived in the file", gone)
		}
	}
	db, _ = sql.Open("sqlite", out)
	defer db.Close()
	var name, due, tz, email, system string
	var status int
	if err := db.QueryRow("SELECT name, due_date, status FROM tasks").Scan(&name, &due, &status); err != nil || name != "Task 1" || due != "2026-11-20 23:59:59.999 +00:00" || status != 2 {
		t.Fatalf("task: %q %q %d %v", name, due, status, err)
	}
	if err := db.QueryRow("SELECT timezone, email FROM users").Scan(&tz, &email); err != nil || tz != "Europe/Rome" || email != "owner@example.test" {
		t.Fatalf("user: %q %q %v", tz, email, err)
	}
	if err := db.QueryRow("SELECT name FROM tags WHERE id = 1").Scan(&system); err != nil || system != "someday" {
		t.Fatalf("system tag: %q %v", system, err)
	}
}
