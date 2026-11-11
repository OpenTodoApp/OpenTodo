package main

import (
	"bytes"
	"flag"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
)

var update = flag.Bool("update", false, "rewrite testdata/want from testdata/sample.txt")

// TestSampleLog: the sample holds the shapes a tester's log comes in (an
// OkHttp log with the body on its own lines, a body under a log prefix, a
// server response that must not be kept, a JSON log line with an escaped
// body). The PUT bodies come out numbered and sanitised, as testdata/want.
func TestSampleLog(t *testing.T) {
	out := t.TempDir()
	var report bytes.Buffer
	if err := run("testdata/sample.txt", out, false, &report); err != nil {
		t.Fatal(err)
	}
	wantReport := "01.ics  PUT /dav/calendars/<account>/calendar-1/uid-1.ics  VTODO,VALARM uid-1\n" +
		"02.ics  PUT /dav/calendars/<account>/calendar-1/uid-2.ics  VTODO uid-2\n" +
		"03.ics  PUT /dav/calendars/<account>/inbox/uid-2.ics  VTODO uid-2\n"
	if report.String() != wantReport {
		t.Errorf("report:\n%s\nwant:\n%s", report.String(), wantReport)
	}
	files, _ := filepath.Glob(filepath.Join(out, "*.ics"))
	if len(files) != 3 {
		t.Fatalf("files: %v", files)
	}
	for _, f := range files {
		got, _ := os.ReadFile(f)
		want := filepath.Join("testdata", "want", filepath.Base(f))
		if *update {
			if err := os.MkdirAll(filepath.Dir(want), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(want, got, 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		w, err := os.ReadFile(want)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, w) {
			t.Errorf("%s:\n%s\nwant:\n%s", filepath.Base(f), got, w)
		}
	}
}

// TestNothingPrivateRemains: no name, address, email, URL, coordinate, UID or
// account id of the sample survives, and the server reads the same dates,
// priority, alarm and parent from the fixture as from the original.
func TestNothingPrivateRemains(t *testing.T) {
	out := t.TempDir()
	if err := run("testdata/sample.txt", out, false, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	private := []string{"Rossi", "Alice", "alice", "Bianchi", "mail.example.net", "Milano", "Roma", "biopsy", "allergy", "333", "45.46", "9.19",
		"clinic", "Health", "Family", "referral", "5f0c2a7e", "0b7e3c1a", "3f1a2b4c", "9d8e7f6a", "line one"}
	files, _ := filepath.Glob(filepath.Join(out, "*.ics"))
	for _, f := range files {
		b, _ := os.ReadFile(f)
		for _, p := range private {
			if bytes.Contains(b, []byte(p)) {
				t.Errorf("%s still holds %q", filepath.Base(f), p)
			}
		}
		for i, l := range strings.Split(strings.TrimSuffix(string(b), "\r\n"), "\r\n") {
			if len(l) > 75 || strings.Contains(l, "\n") {
				t.Errorf("%s line %d is not folded at 75 octets with CRLF: %q", filepath.Base(f), i+1, l)
			}
		}
	}
	read := func(name string) *caldav.Inbound {
		b, _ := os.ReadFile(filepath.Join(out, name))
		in, err := caldav.Decode(b)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		return in
	}
	parent, child, done := read("01.ics"), read("02.ics"), read("03.ics")
	if parent.UID != "uid-1" || parent.Title != "Task 1" || parent.Priority != 1 || parent.Due == nil || parent.Due.Date != "2026-11-18" ||
		parent.Due.Time == nil || *parent.Due.Time != "09:30" || parent.Due.TZ == nil || *parent.Due.TZ != "Europe/Rome" || len(parent.Alarms) != 1 || len(parent.Categories) != 2 {
		t.Errorf("parent: %+v", parent)
	}
	if child.ParentUID != "uid-1" || child.Due == nil || child.Due.Date != "2026-11-17" || child.Due.Time != nil {
		t.Errorf("child: %+v", child)
	}
	if done.ParentUID != "uid-1" || !done.Completed {
		t.Errorf("completed child: %+v", done)
	}
}

func TestAllKeepsResponsesAndHAR(t *testing.T) {
	if got := extract(mustRead(t, "testdata/sample.txt"), true); len(got) != 4 {
		t.Fatalf("-all: %d bodies, want 4 (three PUTs and the served one)", len(got))
	}
	har := `{"log":{"entries":[{"request":{"method":"PUT","url":"https://h.example/dav/calendars/u/inbox/a.ics","postData":{"text":"BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:a\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"}}},` +
		`{"request":{"method":"REPORT","url":"https://h.example/dav/","postData":{"text":"<x/>"}}}]}}`
	got := extract(har, false)
	if len(got) != 1 || got[0].method != "PUT" || !strings.Contains(got[0].ics, "UID:a") {
		t.Fatalf("HAR: %+v", got)
	}
	if err := run(writeTemp(t, "no calendar here\n"), t.TempDir(), false, &bytes.Buffer{}); err == nil {
		t.Fatal("a log without calendar data must be an error")
	}
}

func mustRead(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func writeTemp(t *testing.T, s string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "log.txt")
	if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

// TestServerDoesNotLinkCapture: the capture is a tool for testers, like
// internal/importer/sanitize; nothing in the server imports it.
func TestServerDoesNotLinkCapture(t *testing.T) {
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
	if bytes.Contains(out, []byte("internal/caldav/capture")) {
		t.Fatal("the server binary links internal/caldav/capture")
	}
}
