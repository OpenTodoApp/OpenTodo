package importer

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// sqliteFile builds a database from statements and returns its bytes.
func sqliteFile(t *testing.T, stmts ...string) []byte {
	t.Helper()
	path := filepath.Join(t.TempDir(), "db.sqlite3")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range stmts {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	db.Close()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// The real Tududi 1.14 database: area Home holds project Garden, which holds
// "Plant tulips" with the subtask "Buy bulbs", tagged, prioritised and due.
func TestTududiStructure(t *testing.T) {
	data, err := os.ReadFile("testdata/tududi-db/production.sqlite3")
	if err != nil {
		t.Fatal(err)
	}
	p, err := parseWith(t, data, nil)
	if err != nil || p.Format != tududiFormat {
		t.Fatalf("%v %v", p, err)
	}
	by := map[string]Row{}
	for _, r := range p.Rows {
		by[r.SourceID] = r
	}
	garden, home := by["tududi:project:1"], by["tududi:area:1"]
	tulips, bulbs := by["tududi:s30q801uwx6ae57"], by["tududi:k7v2w2eeem4aqvi"]
	if home.Kind != KindProject || garden.ParentSourceID != home.SourceID {
		t.Fatalf("area/project: %+v %+v", home, garden)
	}
	if tulips.ProjectSourceID != garden.SourceID || bulbs.ParentSourceID != tulips.SourceID {
		t.Fatalf("task/subtask: %+v %+v", tulips, bulbs)
	}
	if tulips.Priority != 1 || bulbs.Priority != 2 || len(tulips.Labels) != 2 || tulips.Due == nil || tulips.Due.Date != "2026-11-20" || tulips.Description == "" {
		t.Fatalf("tulips = %+v", tulips)
	}
	if !by["tududi:vi2yttzxjcd1prf"].Completed || !by["tududi:cp7jsbz5dtane0p"].Completed || by["tududi:z558misj586huds"].Completed {
		t.Fatal("done and archived tasks are completed, in-progress ones are not")
	}
	if !strings.Contains(garden.Description, "## Note 1") {
		t.Fatalf("project notes not appended: %q", garden.Description)
	}
}

// A SQLite file with Tududi's tables but not the columns the mapping reads is
// refused as an unsupported format, and its temporary copy is gone.
func TestTududiUnknownSchema(t *testing.T) {
	data := sqliteFile(t,
		"CREATE TABLE `users` (`id` INTEGER PRIMARY KEY, `timezone` TEXT)",
		"CREATE TABLE `areas` (`id` INTEGER PRIMARY KEY, `name` TEXT, `user_id` INTEGER)",
		"CREATE TABLE `projects` (`id` INTEGER PRIMARY KEY, `uid` TEXT, `name` TEXT, `description` TEXT, `area_id` INTEGER, `user_id` INTEGER)",
		"CREATE TABLE `tasks` (`id` INTEGER PRIMARY KEY, `name` TEXT, `recurrence_type` TEXT)",
		"CREATE TABLE `tags` (`id` INTEGER PRIMARY KEY, `name` TEXT)",
		"CREATE TABLE `tasks_tags` (`task_id` INTEGER, `tag_id` INTEGER)",
		"CREATE TABLE `notes` (`id` INTEGER PRIMARY KEY, `title` TEXT, `content` TEXT, `project_id` INTEGER, `user_id` INTEGER)",
	)
	if p, err := Detect(data, ""); err != nil || p.Name() != tududiFormat {
		t.Fatalf("detected %v %v", p, err)
	}
	tmp := t.TempDir()
	_, err := parseWith(t, data, func(o *Options) { o.tempDir = tmp })
	if !errors.Is(err, ErrUnsupportedFormat) || !strings.Contains(err.Error(), "the tasks table has no uid column") || !strings.Contains(err.Error(), "Tududi 1.14") {
		t.Fatalf("err = %v", err)
	}
	left, _ := os.ReadDir(tmp)
	if len(left) != 0 {
		t.Fatalf("temporary copy left behind: %v", left)
	}
}

// Recurrences the grammar can say map onto it; the rest warn.
func TestTududiRecurrence(t *testing.T) {
	r := &tududiReader{}
	n := func(v int64) sql.NullInt64 { return sql.NullInt64{Int64: v, Valid: true} }
	cases := []struct {
		k    tududiTask
		want string
		warn bool
	}{
		{tududiTask{recType: "daily", interval: n(1)}, "every day", false},
		{tududiTask{recType: "daily", interval: n(10), completionBased: n(1)}, "every 10 days after completion", false},
		{tududiTask{recType: "weekly", interval: n(1), weekdays: sql.NullString{String: "[1,4]", Valid: true}}, "every monday, thursday", false},
		{tududiTask{recType: "weekly", interval: n(2), weekdays: sql.NullString{String: "[1,4]", Valid: true}}, "every 2 weeks", true},
		{tududiTask{recType: "monthly", interval: n(1), monthDay: n(15)}, "every 15th", false},
		{tududiTask{recType: "monthly_weekday", interval: n(1), weekday: n(2), weekOfMonth: n(2)}, "every 2nd tuesday", false},
		{tududiTask{recType: "monthly_weekday", interval: n(1), weekday: n(5), weekOfMonth: n(5)}, "every last friday", false},
		{tududiTask{recType: "monthly_last_day", interval: n(1), recEnd: "2027-06-30 00:00:00.000 +00:00"}, "every last day until 2027-06-30", false},
		{tududiTask{recType: "hourly"}, "", true},
	}
	for _, c := range cases {
		row := Row{Due: &Due{Date: "2026-11-10"}}
		r.recurrence(&row, c.k)
		if row.Recurrence != c.want || (len(row.Warnings) > 0) != c.warn {
			t.Errorf("%+v: got %q %v", c.k, row.Recurrence, row.Warnings)
		}
	}
}

// A ZIP holding the database is read the same way.
func TestTududiZipped(t *testing.T) {
	data, err := os.ReadFile("testdata/tududi-db/production.sqlite3")
	if err != nil {
		t.Fatal(err)
	}
	z := zipOf(t, map[string]string{"tududi/production.sqlite3": string(data)})
	p, err := parseWith(t, z, nil)
	if err != nil || p.Format != tududiFormat || len(p.Rows) < 20 {
		t.Fatalf("%v %v", p, err)
	}
}
