package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// newEnvConfig is newEnv with a caller-supplied configuration.
func newEnvConfig(t *testing.T, cfg config.Config) *env {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if cfg.SessionTTL == 0 {
		cfg.SessionTTL = time.Hour
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, cfg.AllowSignup), syncSvc, nil, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
}

// upload posts a multipart import request: the file plus an options JSON part.
func (e *env) upload(path, filename string, data []byte, opts map[string]any, headers ...string) (*http.Response, map[string]any) {
	e.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if opts != nil {
		b, _ := json.Marshal(opts)
		_ = mw.WriteField("options", string(b))
	}
	fw, _ := mw.CreateFormFile("file", filename)
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequest("POST", e.srv.URL+path, &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(raw, &out)
	return resp, out
}

// importAndWait starts a job and polls it until it leaves "running".
func (e *env) importAndWait(filename string, data []byte, opts map[string]any) map[string]any {
	e.t.Helper()
	resp, out := e.upload("/api/v1/import", filename, data, opts)
	e.mustStatus(resp, 202, out)
	id := out["job"].(map[string]any)["id"].(string)
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		resp, out = e.do("GET", "/api/v1/import/jobs/"+id, nil)
		e.mustStatus(resp, 200, out)
		job := out["job"].(map[string]any)
		if job["status"] != "running" {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	e.t.Fatalf("job %s still running", id)
	return nil
}

func TestImportRoutesRequireAuth(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	csv := []byte("title\nA\n")
	for _, path := range []string{"/api/v1/import/preview", "/api/v1/import", "/api/v1/import/jobs/x/undo"} {
		resp, out := anon.upload(path, "a.csv", csv, nil)
		anon.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s: %v", path, out)
		}
	}
	for _, path := range []string{"/api/v1/import/jobs", "/api/v1/import/jobs/x"} {
		resp, out := anon.do("GET", path, nil)
		anon.mustStatus(resp, 401, out)
	}
	resp, out := anon.upload("/api/v1/import/preview", "a.csv", csv, nil, "Authorization", "Bearer ot_wrong")
	anon.mustStatus(resp, 401, out)
	// Cookie-authenticated uploads from another site are refused like any write.
	resp, out = e.upload("/api/v1/import", "a.csv", csv, nil, "Origin", "https://evil.example")
	e.mustStatus(resp, 403, out)
	// A bearer token works (scripts and the CLI).
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	e.mustStatus(resp, 201, out)
	resp, out = anon.upload("/api/v1/import/preview", "a.csv", csv, nil, "Authorization", "Bearer "+out["secret"].(string))
	anon.mustStatus(resp, 200, out)
}

func TestImportTooLarge413(t *testing.T) {
	e := newEnvConfig(t, config.Config{ImportMaxMB: 1})
	e.register("o@example.com")
	big := bytes.Repeat([]byte("title\n"), 1)
	big = append(big, bytes.Repeat([]byte("a fairly long task title for padding\n"), 40_000)...) // ~1.5 MB
	for _, path := range []string{"/api/v1/import/preview", "/api/v1/import"} {
		resp, out := e.upload(path, "big.csv", big, nil)
		e.mustStatus(resp, 413, out)
		if errCode(out) != "too_large" || !strings.Contains(out["error"].(map[string]any)["message"].(string), "1 MB") {
			t.Fatalf("%s: %v", path, out)
		}
	}
	// More than 50,000 rows is refused even under the size limit.
	e2 := newEnv(t, false)
	e2.register("o@example.com")
	rows := append([]byte("title\n"), bytes.Repeat([]byte("x\n"), 50_001)...)
	resp, out := e2.upload("/api/v1/import/preview", "rows.csv", rows, nil)
	e2.mustStatus(resp, 413, out)
	if !strings.Contains(fmt.Sprint(out), "50000") {
		t.Fatalf("row limit message = %v", out)
	}
	resp, out = e2.do("GET", "/api/v1/import/jobs", nil)
	e2.mustStatus(resp, 200, out)
	if len(out["jobs"].([]any)) != 0 {
		t.Fatalf("a job was created: %v", out)
	}
}

func TestImportInvalidOptions400(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	other := newClientAt(e, "10.0.0.2")
	// A second account (signup is closed, so use an invitation).
	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{})
	e.mustStatus(resp, 201, out)
	link := out["link"].(string)
	resp, out = other.do("POST", "/api/v1/auth/register", map[string]string{"email": "b@example.com", "password": "correct horse battery", "invitation": link[strings.LastIndex(link, "/")+1:]})
	other.mustStatus(resp, 201, out)
	resp, out = other.do("POST", "/api/v1/projects", map[string]any{"name": "B's"})
	other.mustStatus(resp, 201, out)
	foreignProject := out["id"].(string)

	csv := []byte("title\nA\n")
	cases := []struct {
		opts map[string]any
		code string
	}{
		{map[string]any{"timeZone": "Atlantis/Capital"}, "invalid_input"},
		{map[string]any{"targetProject": foreignProject}, "invalid_input"},
		{map[string]any{"duplicates": "maybe"}, "invalid_input"},
		{map[string]any{"format": "spreadsheet"}, "invalid_input"},
		{map[string]any{"unknownOption": true}, "invalid_input"},
	}
	for _, c := range cases {
		for _, path := range []string{"/api/v1/import/preview", "/api/v1/import"} {
			resp, out := e.upload(path, "a.csv", csv, c.opts)
			e.mustStatus(resp, 400, out)
			if errCode(out) != c.code {
				t.Fatalf("%s %v: %v", path, c.opts, out)
			}
		}
	}
	resp, out = e.upload("/api/v1/import/preview", "notes.txt", []byte("name,email\nx,y\n"), nil)
	e.mustStatus(resp, 400, out)
	msg := out["error"].(map[string]any)["message"].(string)
	if errCode(out) != "unsupported_format" || !strings.Contains(msg, "csv") || !strings.Contains(msg, "opentodo") ||
		!strings.Contains(msg, "todoist-backup") || !strings.Contains(msg, "things-db") || !strings.Contains(msg, "linear-csv") {
		t.Fatalf("unsupported: %v", out)
	}
	resp, out = e.upload("/api/v1/import/preview", "broken.json", []byte(`{"format":"opentodo-export","version":1,"tasks":{}}`), nil)
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_file" {
		t.Fatalf("invalid file: %v", out)
	}
	// Not multipart at all.
	resp, out = e.do("POST", "/api/v1/import/preview", map[string]any{"title": "x"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/import/jobs", nil)
	e.mustStatus(resp, 200, out)
	if len(out["jobs"].([]any)) != 0 {
		t.Fatalf("jobs created by rejected requests: %v", out)
	}
}

func TestUndoForeignJob404(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	job := e.importAndWait("a.csv", []byte("title\nMine\n"), nil)
	id := job["id"].(string)

	resp, out := e.do("POST", "/api/v1/invitations", map[string]any{})
	e.mustStatus(resp, 201, out)
	link := out["link"].(string)
	other := newClientAt(e, "10.0.0.3")
	resp, out = other.do("POST", "/api/v1/auth/register", map[string]string{"email": "b@example.com", "password": "correct horse battery", "invitation": link[strings.LastIndex(link, "/")+1:]})
	other.mustStatus(resp, 201, out)

	resp, out = other.do("POST", "/api/v1/import/jobs/"+id+"/undo", nil)
	other.mustStatus(resp, 404, out)
	if errCode(out) != "not_found" {
		t.Fatalf("foreign undo: %v", out)
	}
	resp, out = other.do("GET", "/api/v1/import/jobs/"+id, nil)
	other.mustStatus(resp, 404, out)
	resp, out = other.do("GET", "/api/v1/import/jobs", nil)
	other.mustStatus(resp, 200, out)
	if len(out["jobs"].([]any)) != 0 {
		t.Fatalf("other user sees jobs: %v", out)
	}
	// The owner's data is untouched; the owner can undo, twice.
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if len(out["tasks"].([]any)) != 1 {
		t.Fatalf("tasks = %v", out)
	}
	for i := 0; i < 2; i++ {
		resp, out = e.do("POST", "/api/v1/import/jobs/"+id+"/undo", nil)
		e.mustStatus(resp, 200, out)
		if out["job"].(map[string]any)["status"] != "undone" {
			t.Fatalf("undo: %v", out)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if len(out["tasks"].([]any)) != 0 {
		t.Fatalf("tasks after undo = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if len(out["tasks"].([]any)) != 1 {
		t.Fatalf("undone task must stay in the export: %v", out)
	}
}

// exportEntities fetches the export and drops the volatile exportedAt.
func exportEntities(e *env) map[string]any {
	e.t.Helper()
	resp, out := e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	delete(out, "exportedAt")
	delete(out, "userId") // the exporting account differs between instances
	return out
}

func TestRoundTripExportImportExport(t *testing.T) {
	a := newEnv(t, false)
	a.register("a@example.com")
	mk := func(path string, body map[string]any) string {
		resp, out := a.do("POST", path, body)
		a.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	errand := mk("/api/v1/labels", map[string]any{"name": "errand"})
	old := mk("/api/v1/labels", map[string]any{"name": "old"})
	// project-notes 5.3: a project note round-trips with both fields.
	home := mk("/api/v1/projects", map[string]any{"name": "Home", "description": "# House\n- [ ] gutters", "notes_doc": "ydoc:v1:AQID"})
	garden := mk("/api/v1/projects", map[string]any{"name": "Garden", "parent_id": home})
	trip := mk("/api/v1/tasks", map[string]any{"title": "Plan trip", "project_id": garden, "labels": []string{errand}, "priority": 1, "due": map[string]any{"date": "2026-10-11", "time": "09:00"}})
	hotel := mk("/api/v1/tasks", map[string]any{"title": "Hotel", "project_id": garden, "parent_id": trip})
	mk("/api/v1/tasks", map[string]any{"title": "Compare prices", "project_id": garden, "parent_id": hotel, "description": "three sites"})
	done := mk("/api/v1/tasks", map[string]any{"title": "Done", "completed_at": 1234})
	gone := mk("/api/v1/tasks", map[string]any{"title": "Gone"})
	for _, p := range []string{"/api/v1/tasks/" + gone, "/api/v1/labels/" + old} {
		resp, out := a.do("DELETE", p, nil)
		a.mustStatus(resp, 204, out)
	}
	_ = done
	// import-completeness: sections, a recurring series with an occurrence
	// record, absolute and relative reminders, saved views, the newer task fields
	// and a comment (which is reported, not imported).
	// icons-and-section-style 3.5: a section's colour and icon round-trip; the other section has neither.
	doing := mk("/api/v1/sections", map[string]any{"name": "Doing", "project_id": garden, "color": "#3b82f6", "icon": "hourglass"})
	mk("/api/v1/sections", map[string]any{"name": "Later", "project_id": garden})
	water := mk("/api/v1/tasks", map[string]any{"title": "Water plants", "project_id": garden, "section_id": doing, "recurrence": "Every Monday",
		"due": map[string]any{"date": "2027-03-01", "time": "08:00", "tz": "Europe/Rome"}, "estimate_minutes": 15,
		"notes_doc": "ydoc:v1:AQID", "description": "rain water", "ical_extra": "X-FOO:bar"})
	resp0, out0 := a.do("PATCH", "/api/v1/tasks/"+water, map[string]any{"completed_at": time.Now().UnixMilli()})
	a.mustStatus(resp0, 200, out0)
	mk("/api/v1/reminders", map[string]any{"task_id": water, "kind": "absolute", "fire_at": 1893456000000})
	mk("/api/v1/reminders", map[string]any{"task_id": water, "kind": "relative", "offset_minutes": -30})
	today := mk("/api/v1/views", map[string]any{"name": "Today", "query": "today"})
	mk("/api/v1/views", map[string]any{"name": "Board", "kind": "dashboard", "panels": []string{today}})
	resp0, out0 = a.do("POST", "/api/v1/tasks/"+water+"/comments", map[string]any{"body": "Use rain water"})
	a.mustStatus(resp0, 201, out0)
	exportA := exportEntities(a)
	noted := false
	for _, p := range exportA["projects"].([]any) {
		if m := p.(map[string]any); m["id"] == home && m["description"] == "# House\n- [ ] gutters" && m["notes_doc"] == "ydoc:v1:AQID" {
			noted = true
		}
	}
	if !noted {
		t.Fatal("the export lacks the project note")
	}
	styled := 0
	for _, s := range exportA["sections"].([]any) {
		m := s.(map[string]any)
		if m["id"] == doing && m["color"] == "#3b82f6" && m["icon"] == "hourglass" {
			styled++
		}
		if _, has := m["icon"]; !has {
			t.Fatalf("an exported section lacks icon: %v", m)
		}
	}
	if styled != 1 {
		t.Fatal("the export lacks the section's colour and icon")
	}
	fileA, _ := json.Marshal(exportA)

	b := newEnv(t, false)
	b.register("b@example.com")
	resp, out := b.upload("/api/v1/import/preview", "opentodo-export.json", fileA, nil)
	b.mustStatus(resp, 200, out)
	if out["format"] != "opentodo" || out["version"] != float64(1) {
		t.Fatalf("preview = %v", out)
	}
	totals := out["totals"].(map[string]any)
	// 9 earlier entities + 2 sections, the series and its occurrence record, 2
	// reminders and 2 views.
	if totals["create"] != float64(17) || totals["error"] != float64(0) || totals["newSections"] != float64(2) ||
		totals["reminders"] != float64(2) || totals["recurring"].(float64) < 1 {
		t.Fatalf("preview totals = %v", totals)
	}
	if notes, _ := out["notes"].([]any); len(notes) != 1 || !strings.HasPrefix(notes[0].(string), "1 comment is not imported") {
		t.Fatalf("preview notes = %v", out["notes"])
	}
	job := b.importAndWait("opentodo-export.json", fileA, nil)
	if job["status"] != "done" || job["format"] != "opentodo" {
		t.Fatalf("job = %v", job)
	}
	exportB := exportEntities(b)
	if c, _ := exportA["comments"].([]any); len(c) != 1 {
		t.Fatalf("source comments = %v", exportA["comments"])
	}
	if c, _ := exportB["comments"].([]any); len(c) != 0 {
		t.Fatalf("comments were imported: %v", exportB["comments"])
	}
	delete(exportA, "comments")
	delete(exportB, "comments")
	for _, k := range []string{"projects", "tasks", "labels", "sections", "reminders", "views"} {
		if !reflect.DeepEqual(exportA[k], exportB[k]) {
			ja, _ := json.MarshalIndent(exportA[k], "", " ")
			jb, _ := json.MarshalIndent(exportB[k], "", " ")
			t.Fatalf("%s differ after round trip:\nA=%s\nB=%s", k, ja, jb)
		}
	}
	if !reflect.DeepEqual(exportA, exportB) {
		t.Fatalf("exports differ: %v vs %v", exportA, exportB)
	}
	// A device on B receives the imported data as ordinary ops from device "import".
	resp, out = b.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": []any{}})
	b.mustStatus(resp, 200, out)
	ops := out["ops"].([]any)
	if len(ops) == 0 || ops[0].(map[string]any)["device"] != "import" {
		t.Fatalf("sync ops = %v", out)
	}
	// Importing the same file again changes nothing.
	job = b.importAndWait("opentodo-export.json", fileA, nil)
	if job["totals"].(map[string]any)["written"] != float64(0) {
		t.Fatalf("second import = %v", job)
	}
}

func TestImportCSVPreviewAndCommit(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	var b strings.Builder
	b.WriteString("title,project,priority,due_date,labels\n")
	for i := 1; i <= 100; i++ {
		prio := "p2"
		if i%34 == 0 { // rows 34, 68, 102→none: 3 bad rows below
			prio = "urgent!"
		}
		if i == 100 {
			prio = "9"
		}
		fmt.Fprintf(&b, "Task %d,Work,%s,2026-10-%02d,\"a, b\"\n", i, prio, 1+i%28)
	}
	csv := []byte(b.String())
	resp, out := e.upload("/api/v1/import/preview", "tasks.csv", csv, map[string]any{"timeZone": "Europe/Rome"})
	e.mustStatus(resp, 200, out)
	totals := out["totals"].(map[string]any)
	if out["format"] != "csv" || totals["rows"] != float64(100) || totals["create"] != float64(97) || totals["error"] != float64(3) {
		t.Fatalf("preview = %v", totals)
	}
	cols := out["columns"].(map[string]any)
	if len(cols["recognised"].([]any)) != 5 || len(cols["ignored"].([]any)) != 0 {
		t.Fatalf("columns = %v", cols)
	}
	var errs []string
	for _, r := range out["rows"].([]any) {
		row := r.(map[string]any)
		if row["outcome"] == "error" {
			errs = append(errs, fmt.Sprintf("%v:%v", row["row"], row["reason"]))
		}
	}
	if len(errs) != 3 || !strings.HasPrefix(errs[0], "35:") || !strings.Contains(errs[0], `"urgent!"`) || !strings.HasPrefix(errs[2], "101:") {
		t.Fatalf("row errors = %v", errs)
	}
	// Nothing was written by the preview.
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	if len(out["tasks"].([]any)) != 0 {
		t.Fatal("preview wrote tasks")
	}
	job := e.importAndWait("tasks.csv", csv, map[string]any{"timeZone": "Europe/Rome"})
	if job["status"] != "done" || len(job["errors"].([]any)) != 3 {
		t.Fatalf("job = %v", job)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	tasks := out["tasks"].([]any)
	if len(tasks) != 97 {
		t.Fatalf("tasks = %d", len(tasks))
	}
	resp, out = e.do("GET", "/api/v1/projects", nil)
	e.mustStatus(resp, 200, out)
	if len(out["projects"].([]any)) != 1 {
		t.Fatalf("projects = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/labels", nil)
	e.mustStatus(resp, 200, out)
	if len(out["labels"].([]any)) != 2 {
		t.Fatalf("labels = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/import/jobs", nil)
	e.mustStatus(resp, 200, out)
	if jobs := out["jobs"].([]any); len(jobs) != 1 || jobs[0].(map[string]any)["status"] != "done" {
		t.Fatalf("jobs = %v", out)
	}
	// Repeating the preview reports every imported row as already imported.
	resp, out = e.upload("/api/v1/import/preview", "tasks.csv", csv, nil)
	e.mustStatus(resp, 200, out)
	totals = out["totals"].(map[string]any)
	if totals["create"] != float64(0) || totals["skip"] != float64(97) {
		t.Fatalf("re-preview = %v", totals)
	}
}

func TestImportGenericJSONOverHTTP(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	doc := []byte(`{"tasks":[{"id":"1","title":"Parent","project":"Side","tags":["x"],"subtasks":[{"id":"2","title":"Child","done":true}]},
		{"id":"3","title":"Repeats","due":"2026-10-12T08:00:00Z","recurrence":"daily"}]}`)
	resp, out := e.upload("/api/v1/import/preview", "export.json", doc, map[string]any{"timeZone": "Asia/Tokyo"})
	e.mustStatus(resp, 200, out)
	if out["format"] != "json-generic" {
		t.Fatalf("format = %v", out["format"])
	}
	rows := out["rows"].([]any)
	if w := rows[2].(map[string]any)["warnings"]; w != nil {
		t.Fatalf("warnings = %v", rows[2])
	}
	job := e.importAndWait("export.json", doc, map[string]any{"timeZone": "Asia/Tokyo"})
	if job["status"] != "done" {
		t.Fatalf("job = %v", job)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	byTitle := map[string]map[string]any{}
	for _, t := range out["tasks"].([]any) {
		byTitle[t.(map[string]any)["title"].(string)] = t.(map[string]any)
	}
	if byTitle["Child"]["parent_id"] != byTitle["Parent"]["id"] || byTitle["Child"]["completed_at"] == nil {
		t.Fatalf("subtask = %v", byTitle["Child"])
	}
	if fmt.Sprint(byTitle["Repeats"]["due"]) != "map[date:2026-10-12 time:17:00]" {
		t.Fatalf("due = %v", byTitle["Repeats"]["due"])
	}
	// The recurrence is imported as a rule (import-completeness).
	if byTitle["Repeats"]["recurrence"] != "every day" {
		t.Fatalf("recurrence = %v", byTitle["Repeats"]["recurrence"])
	}
}

// OpenSpec change named-importers: archive and database refusals are 400s with a
// clear message, and real exports import over HTTP.
func TestImportNamedFormatRefusals(t *testing.T) {
	e := newEnv(t, false)
	e.register("o@example.com")
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, _ := zw.Create("../evil.csv")
	w.Write([]byte("title\nA\n"))
	zw.Close()
	resp, out := e.upload("/api/v1/import/preview", "backup.zip", buf.Bytes(), nil)
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_file" || !strings.Contains(fmt.Sprint(out), "unsafe entry name") {
		t.Fatalf("unsafe archive: %v", out)
	}
	resp, out = e.upload("/api/v1/import/preview", "main.sqlite", []byte("SQLite format 3\x00 not really a database"), nil)
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_file" {
		t.Fatalf("broken database: %v", out)
	}
	anon := &env{t: t, srv: e.srv, client: &http.Client{}}
	resp, out = anon.upload("/api/v1/import/preview", "backup.zip", buf.Bytes(), nil)
	anon.mustStatus(resp, 401, out)
}

func TestImportLinearOverHTTP(t *testing.T) {
	e := newEnv(t, false)
	e.register("owner@example.test")
	data, err := os.ReadFile("../importer/testdata/linear-csv/export.csv")
	if err != nil {
		t.Fatal(err)
	}
	resp, out := e.upload("/api/v1/import", "export.csv", data, nil)
	e.mustStatus(resp, 202, out)
	job := out["job"].(map[string]any)
	if job["format"] != "linear-csv" || len(job["viewHints"].([]any)) != 1 {
		t.Fatalf("job: %v", job)
	}
	id := job["id"].(string)
	for deadline := time.Now().Add(10 * time.Second); ; {
		_, st := e.do("GET", "/api/v1/import/jobs/"+id, nil)
		if j, _ := st["job"].(map[string]any); j != nil && j["status"] != "running" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("import did not finish")
		}
		time.Sleep(20 * time.Millisecond)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	assigned := 0
	for _, task := range out["tasks"].([]any) {
		if task.(map[string]any)["assignee_id"] != nil {
			assigned++
		}
	}
	if assigned != 3 {
		t.Fatalf("issues assigned to the importer: %d, want 3", assigned)
	}
}
