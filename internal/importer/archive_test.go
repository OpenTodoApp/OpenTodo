package importer

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func zipOf(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(body))
	}
	zw.Close()
	return buf.Bytes()
}

func parseWith(t *testing.T, data []byte, mutate func(*Options)) (*Parsed, error) {
	t.Helper()
	opts := Options{}
	if err := opts.Normalize(); err != nil {
		t.Fatal(err)
	}
	opts.exportedAt = time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC)
	opts.tempDir = t.TempDir()
	if mutate != nil {
		mutate(&opts)
	}
	return Parse(data, opts)
}

func wantFileError(t *testing.T, err error, substr string) {
	t.Helper()
	var fe *FileError
	if !errors.As(err, &fe) || !strings.Contains(fe.Error(), substr) {
		t.Fatalf("want a FileError containing %q, got %v", substr, err)
	}
}

const todoistCSV = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\n" +
	"meta,view_style=list,,,,,,,,\n,,,,,,,,,\ntask,Buy milk @errands,,1,1,,,21 Okt.,de,Europe/Berlin\ntask,Oat milk,,4,2,,,,,\n"

func TestArchiveTodoistBackup(t *testing.T) {
	data := zipOf(t, map[string]string{"Home [123].csv": todoistCSV, "Inbox [9].csv": todoistCSV, "__MACOSX/._x.csv": "junk", ".DS_Store": "junk"})
	p, err := parseWith(t, data, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.Format != todoistBackupFormat {
		t.Fatalf("format %q", p.Format)
	}
	projects, tasks := 0, 0
	for _, r := range p.Rows {
		switch r.Kind {
		case KindProject:
			projects++
			if r.Title != "Home" {
				t.Fatalf("project %q", r.Title)
			}
		case KindTask:
			tasks++
			if r.File == "" {
				t.Fatal("task without its archive entry name")
			}
		}
	}
	if projects != 1 || tasks != 4 {
		t.Fatalf("projects %d tasks %d (the Inbox file maps onto the Inbox)", projects, tasks)
	}
}

func TestArchiveTooManyEntries(t *testing.T) {
	files := map[string]string{}
	for i := 0; i <= MaxArchiveEntries; i++ {
		files[filepath.Join("d", strings.Repeat("x", 3)+string(rune('a'+i%26))+time.Duration(i).String()+".csv")] = "x"
	}
	_, err := parseWith(t, zipOf(t, files), nil)
	wantFileError(t, err, "more than 1000 entries")
}

func TestArchiveOversizedExpansion(t *testing.T) {
	big := strings.Repeat("a", 3<<20) // compresses to almost nothing
	_, err := parseWith(t, zipOf(t, map[string]string{"a.csv": big, "b.csv": big}), func(o *Options) { o.maxBytes = 512 << 10 })
	wantFileError(t, err, "too large when unpacked")
}

func TestArchiveMixedFormats(t *testing.T) {
	linear := "ID,Team,Title,Status,Priority,UUID\nENG-1,Team,Do it,Todo,High,u1\n"
	_, err := parseWith(t, zipOf(t, map[string]string{"a.csv": todoistCSV, "b.csv": linear}), nil)
	wantFileError(t, err, "mixes formats")
}

func TestArchiveUnsafeName(t *testing.T) {
	_, err := parseWith(t, zipOf(t, map[string]string{"../evil.csv": todoistCSV}), nil)
	wantFileError(t, err, "unsafe entry name")
}

func TestArchiveZippedThingsFolder(t *testing.T) {
	db, err := os.ReadFile("testdata/things-db/main.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("Things Database.thingsdatabase/main.sqlite")
	w.Write(db)
	zw.Close()
	p, err := parseWith(t, buf.Bytes(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.Format != thingsFormat || len(p.Rows) == 0 {
		t.Fatalf("format %q, %d rows", p.Format, len(p.Rows))
	}
}

func TestThingsOpenerRefusesOtherSQLite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "other.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("CREATE TABLE notes (id INTEGER, body TEXT)"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	data, _ := os.ReadFile(path)
	tmp := t.TempDir()
	_, err = parseWith(t, data, func(o *Options) { o.tempDir = tmp })
	wantFileError(t, err, "not a Things database")
	if left, _ := os.ReadDir(tmp); len(left) != 0 {
		t.Fatalf("temporary copy left behind: %v", left)
	}
}

func TestThingsOpenerTruncatedFile(t *testing.T) {
	data, err := os.ReadFile("testdata/things-db/main.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	_, err = parseWith(t, data[:4096], func(o *Options) { o.tempDir = tmp })
	var fe *FileError
	if !errors.As(err, &fe) {
		t.Fatalf("truncated database: want a FileError, got %v", err)
	}
	if left, _ := os.ReadDir(tmp); len(left) != 0 {
		t.Fatalf("temporary copy left behind: %v", left)
	}
}

func TestThingsOpenerCleansUpAfterSuccess(t *testing.T) {
	data, err := os.ReadFile("testdata/things-db/main.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	if _, err := parseWith(t, data, func(o *Options) { o.tempDir = tmp }); err != nil {
		t.Fatal(err)
	}
	if left, _ := os.ReadDir(tmp); len(left) != 0 {
		t.Fatalf("temporary copy left behind: %v", left)
	}
}

func TestThingsPackedValues(t *testing.T) {
	if d, ok := thingsDate(132819584); !ok || d != "2026-10-21" {
		t.Fatalf("packed date: %q %v", d, ok)
	}
	if _, ok := thingsDate(0); ok {
		t.Fatal("zero is not a date")
	}
	if c, ok := thingsClock(9<<26 | 30<<20); !ok || c != "09:30" {
		t.Fatalf("packed clock: %q %v", c, ok)
	}
	rule, ok := thingsRecurrence([]byte(`<?xml version="1.0"?><plist version="1.0"><dict><key>fu</key><integer>256</integer><key>fa</key><integer>1</integer><key>of</key><array><dict><key>wd</key><integer>2</integer></dict></array><key>tp</key><integer>0</integer></dict></plist>`))
	if !ok || rule != "every monday" {
		t.Fatalf("weekly on Monday: %q %v", rule, ok)
	}
	rule, ok = thingsRecurrence([]byte(`<plist><dict><key>fu</key><integer>16</integer><key>fa</key><integer>3</integer><key>tp</key><integer>1</integer></dict></plist>`))
	if !ok || rule != "every 3 days after completion" {
		t.Fatalf("every 3 days after completion: %q %v", rule, ok)
	}
}

// Every fixture is detected as its own format and nothing else.
func TestNamedFormatDetection(t *testing.T) {
	cases := map[string]string{
		"testdata/ticktick-csv/backup.csv":             tickTickFormat,
		"testdata/linear-csv/export.csv":               linearFormat,
		"testdata/things-db/main.sqlite":               thingsFormat,
		"testdata/ticktick-csv/rich.csv":               tickTickFormat,
		"testdata/linear-csv/rich.csv":                 linearFormat,
		"testdata/things-db/rich.sqlite":               thingsFormat,
		"testdata/google-tasks-json/Tasks.json":        "google-tasks-json",
		"testdata/google-tasks-json/rich.json":         "google-tasks-json",
		"testdata/trello-json/board.json":              "trello-json",
		"testdata/trello-json/rich.json":               "trello-json",
		"testdata/asana-csv/export.csv":                "asana-csv",
		"testdata/asana-csv/rich.csv":                  "asana-csv",
		"testdata/microsoft-todo-json/todo.json":       "microsoft-todo-json",
		"testdata/microsoft-todo-json/rich.json":       "microsoft-todo-json",
		"testdata/apple-reminders-json/reminders.json": "apple-reminders-json",
		"testdata/apple-reminders-json/rich.json":      "apple-reminders-json",
		"testdata/anydo-json/data.json":                "anydo-json",
		"testdata/anydo-json/rich.json":                "anydo-json",
		"testdata/tasks.csv":                           "csv",
		"testdata/items.json":                          "json-items",
		"testdata/lists.json":                          "json-lists",
		"testdata/generic.json":                        "json-generic",
	}
	for path, want := range cases {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		p, err := Detect(data, "")
		if err != nil || p.Name() != want {
			t.Errorf("%s: detected %v (%v), want %s", path, p, err, want)
		}
	}
	for _, path := range []string{"testdata/todoist-backup/backup.zip", "testdata/todoist-backup/rich.zip"} {
		z, _ := os.ReadFile(path)
		if p, err := parseWith(t, z, nil); err != nil || p.Format != todoistBackupFormat {
			t.Errorf("%s: %v %v", path, p, err)
		}
	}
	if p, err := Detect([]byte(todoistCSV), ""); err != nil || p.Name() != todoistFormat {
		t.Errorf("todoist csv: %v %v", p, err)
	}
}
