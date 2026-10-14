package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTodoistCSV(t *testing.T) {
	in := "\xef\xbb\xbfTYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG\n" +
		"meta,view_style=board,,,,,,,\n" +
		"section,Groceries,,,,,,,\n" +
		"task,Buy milk @errands,From the corner shop,4,1,Jane Doe (12345678),Jane Doe (12345678),21 Okt.,de\n"
	out, err := newScrubber().csvFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.HasPrefix(s, "\xef\xbb\xbf") {
		t.Fatal("BOM lost")
	}
	for _, gone := range []string{"Groceries", "milk", "corner", "Jane", "12345678", "errands"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
	for _, kept := range []string{"view_style=board", ",4,1,", "21 Okt.,de", "@label1"} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
}

func TestTickTickPreambleKept(t *testing.T) {
	in := "\xef\xbb\xbf\"Date: 2026-10-14+0000\"\n\"Version: 7.2\"\n\"Status: \n0 Normal\n2 Completed\"\n" +
		"Folder Name,List Name,Title,Kind,Tags,Content,Priority,Status,taskId,parentId\n" +
		"Home,Groceries,Buy milk,CHECKLIST,shop,\"▫Oat milk\n▪Bread\",5,0,abc,\n"
	out, err := newScrubber().csvFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, kept := range []string{"Date: 2026-10-14+0000", "Version: 7.2", "2 Completed", "CHECKLIST", "▫ Item", "▪ Item", ",5,0,t000001"} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
	for _, gone := range []string{"Home", "Groceries", "milk", "Bread", "shop", "abc"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
}

func TestLinearCSV(t *testing.T) {
	in := "ID,Team,Title,Description,Status,Priority,Project,Creator,Assignee,Labels,Parent issue\n" +
		"PIX-5,Pixari,Set up workspace,Invite people,Backlog,High,Knot,me@real.example,other@real.example,\"DevEx, Bug\",PIX-3\n"
	out, err := newScrubber().csvFile([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, kept := range []string{"ENG-5", "ENG-3", "Backlog", "High", "owner@example.test", "user2@example.test", "label1, label2"} {
		if !strings.Contains(s, kept) {
			t.Fatalf("%q lost:\n%s", kept, s)
		}
	}
	for _, gone := range []string{"PIX", "Pixari", "workspace", "real.example", "DevEx", "Knot"} {
		if strings.Contains(s, gone) {
			t.Fatalf("%q survived:\n%s", gone, s)
		}
	}
}

func TestTodoistZipNames(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("Private Stuff [6abcXyz].csv")
	io.WriteString(w, "TYPE,CONTENT,PRIORITY\ntask,Secret thing,4\n")
	zw.Close()
	out, err := newScrubber().zip(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	zr, _ := zip.NewReader(bytes.NewReader(out), int64(len(out)))
	if len(zr.File) != 1 || zr.File[0].Name != "Project 1 [p000001].csv" {
		t.Fatalf("names: %v", zr.File[0].Name)
	}
	rc, _ := zr.File[0].Open()
	b, _ := io.ReadAll(rc)
	if strings.Contains(string(b), "Secret") {
		t.Fatalf("content survived: %s", b)
	}
}

func TestThingsSQLite(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "in.sqlite")
	db, err := sql.Open("sqlite", in)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`CREATE TABLE TMTask (uuid TEXT, title TEXT, notes TEXT, cachedTags BLOB, notesSync BLOB, startDate INTEGER)`,
		`CREATE TABLE TMTag (uuid TEXT, title TEXT, shortcut TEXT)`,
		`CREATE TABLE TMSettings (uuid TEXT, uriSchemeAuthenticationToken TEXT)`,
		`INSERT INTO TMTask VALUES ('u1', 'Call grandma', 'about the birthday', NULL, NULL, 132819584)`,
		`INSERT INTO TMTag VALUES ('t1', 'family', 'f')`,
		`INSERT INTO TMSettings VALUES ('s', 'secret-token')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	out := filepath.Join(dir, "out.sqlite")
	if err := newScrubber().sqlite(in, out); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(out)
	for _, gone := range []string{"grandma", "birthday", "family", "secret-token"} {
		if bytes.Contains(raw, []byte(gone)) {
			t.Fatalf("%q survived in the file", gone)
		}
	}
	db, _ = sql.Open("sqlite", out)
	defer db.Close()
	var title string
	var start int64
	if err := db.QueryRow(`SELECT title, startDate FROM TMTask`).Scan(&title, &start); err != nil || title != "Item 1" || start != 132819584 {
		t.Fatalf("task: %q %d %v", title, start, err)
	}
}
