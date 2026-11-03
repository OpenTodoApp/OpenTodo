package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// ---- SQLite (Tududi) ----

// tududiKeep are the tables the tududi-db importer reads; every other table
// (sessions, tokens, push subscriptions, notifications, settings) is emptied.
var tududiKeep = map[string]bool{
	"users": true, "areas": true, "projects": true, "tasks": true, "tags": true, "tasks_tags": true,
	"projects_tags": true, "notes": true, "notes_tags": true, "inbox_items": true, "comments": true,
	"daily_plans": true, "daily_plan_items": true, "task_relations": true, "task_attachments": true,
	"recurring_completions": true, "SequelizeMeta": true,
}

// tududiUserKeep are the users columns that hold no personal data.
var tududiUserKeep = map[string]bool{"id": true, "uid": true, "timezone": true, "language": true, "created_at": true, "updated_at": true}

// isTududi reports whether the database has Tududi's tables.
func isTududi(db *sql.DB) bool {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'areas', 'tasks_tags', 'projects')`).Scan(&n)
	return err == nil && n == 4
}

// tududi replaces the text of a Tududi database: names, notes, comments and
// inbox items become placeholders (the built-in tags someday and today stay),
// the account's email becomes owner@example.test, its other text settings
// are blanked, and tables the importer does not read are emptied.
func (s *scrubber) tududi(db *sql.DB) error {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		return err
	}
	var tables []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		tables = append(tables, n)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, t := range tables {
		if !tududiKeep[t] {
			if _, err := db.Exec(fmt.Sprintf(`DELETE FROM "%s"`, t)); err != nil {
				return fmt.Errorf("empty %s: %w", t, err)
			}
		}
	}
	type col struct{ table, column, kind, where string }
	for _, c := range []col{
		{"areas", "name", "Area", ""}, {"areas", "description", "Notes", ""},
		{"projects", "name", "Project", ""}, {"projects", "description", "Notes", ""},
		{"tasks", "name", "Task", ""}, {"tasks", "note", "Notes", ""},
		{"tags", "name", "Tag", "tag_type != 'system'"},
		{"notes", "title", "Note", ""}, {"notes", "content", "Notes", ""},
		{"comments", "body", "Comment", ""},
		{"inbox_items", "title", "Inbox", ""}, {"inbox_items", "content", "Inbox", ""}, {"inbox_items", "cleaned_content", "Inbox", ""},
		{"task_attachments", "original_filename", "File", ""}, {"task_attachments", "title", "File", ""},
	} {
		if err := s.scrubColumnWhere(db, c.table, c.column, c.kind, c.where); err != nil {
			return fmt.Errorf("%s.%s: %w", c.table, c.column, err)
		}
	}
	return s.tududiUsers(db)
}

func (s *scrubber) tududiUsers(db *sql.DB) error {
	rows, err := db.Query(`SELECT name, type, "notnull" FROM pragma_table_info('users')`)
	if err != nil {
		return err
	}
	var sets []string
	for rows.Next() {
		var name, typ string
		var notNull int
		if err := rows.Scan(&name, &typ, &notNull); err != nil {
			rows.Close()
			return err
		}
		t := strings.ToUpper(typ)
		if tududiUserKeep[name] || !(strings.Contains(t, "CHAR") || strings.Contains(t, "TEXT") || strings.Contains(t, "JSON")) {
			continue
		}
		switch {
		case name == "email":
			sets = append(sets, `"email" = 'owner@example.test'`)
		case notNull == 1:
			sets = append(sets, fmt.Sprintf(`"%s" = ''`, name))
		default:
			sets = append(sets, fmt.Sprintf(`"%s" = NULL`, name))
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(sets) == 0 {
		return nil
	}
	_, err = db.Exec(`UPDATE users SET ` + strings.Join(sets, ", "))
	return err
}

// scrubColumnWhere is scrubColumn limited to the rows matching where ("" for all).
func (s *scrubber) scrubColumnWhere(db *sql.DB, table, column, kind, where string) error {
	cond := fmt.Sprintf(`"%s" IS NOT NULL AND "%s" != ''`, column, column)
	if where != "" {
		cond += " AND " + where
	}
	rows, err := db.Query(fmt.Sprintf(`SELECT rowid, "%s" FROM "%s" WHERE %s`, column, table, cond))
	if err != nil {
		if strings.Contains(err.Error(), "no such") {
			return nil
		}
		return err
	}
	type upd struct {
		id int64
		v  string
	}
	var ups []upd
	for rows.Next() {
		var id int64
		var v string
		if err := rows.Scan(&id, &v); err != nil {
			rows.Close()
			return err
		}
		ups = append(ups, upd{id, s.text(kind, v)})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, u := range ups {
		if _, err := db.Exec(fmt.Sprintf(`UPDATE "%s" SET "%s" = ? WHERE rowid = ?`, table, column), u.v, u.id); err != nil {
			return err
		}
	}
	return nil
}
