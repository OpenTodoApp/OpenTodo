package importer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/blobs"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// OpenSpec change attachments, design D12: link attachments from foreign files.

func TestGenericJSONLinksBecomeAttachments(t *testing.T) {
	p, err := parseWith(t, []byte(`[{"title":"Design review","attachments":["https://example.com/a.pdf",{"name":"Mockups","url":"https://figma.example/x"},{"url":"C:\\\\local\\\\file.png"}]}]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	r := p.Rows[0]
	if len(r.Links) != 2 || r.Links[1].Name != "Mockups" || r.Links[0].URL != "https://example.com/a.pdf" {
		t.Fatalf("links = %+v", r.Links)
	}
	if len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], "dropped") {
		t.Fatalf("warnings = %v", r.Warnings)
	}
}

func TestCSVAttachmentColumnAndImport(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	data := "title,attachment\nReport,https://example.com/r.pdf;https://example.com/s.pdf\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.Attachments != 2 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	if job := h.run(data, Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	var links []string
	for _, a := range h.list("attachment", false) {
		links = append(links, str(a, "url"))
		if str(a, "author_id") != h.uid {
			t.Fatalf("author = %s", str(a, "author_id"))
		}
	}
	if len(links) != 2 {
		t.Fatalf("attachments = %v", links)
	}
}

func ownAttachmentExport(digest string) string {
	return `{"format":"opentodo-export","version":2,"projects":[],"labels":[],
"tasks":[{"id":"t-att","title":"With files","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"project_id":null,"parent_id":null,"description":""}],
"attachments":[
 {"id":"a-file","task_id":"t-att","comment_id":"c-gone","name":"report.txt","mime":"text/plain","size":5,"sha256":"` + digest + `","url":null,"encrypted":false,"author_id":"someone-else","created_at":2,"uploaded_at":3,"deleted_at":null},
 {"id":"a-link","task_id":"t-att","comment_id":null,"name":"Spec","mime":null,"size":null,"sha256":null,"url":"https://example.com/spec","encrypted":false,"author_id":"someone-else","created_at":2,"uploaded_at":null,"deleted_at":null}]}`
}

func TestOwnZipExportRestoresFiles(t *testing.T) {
	h := newHarness(t)
	store, err := blobs.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h.svc.SetBlobs(store, nil)
	sum := sha256.Sum256([]byte("hello"))
	digest := hex.EncodeToString(sum[:])
	data := zipOf(t, map[string]string{"export.json": ownAttachmentExport(digest), "attachments/a-file/report.txt": "hello"})
	job := h.run(string(data), Options{TimeZone: "UTC"})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	got := map[string]opsync.Entity{}
	for _, a := range h.list("attachment", false) {
		got[str(a, "id")] = a
	}
	file, link := got["a-file"], got["a-link"]
	if file == nil || link == nil {
		t.Fatalf("attachments = %v", got)
	}
	if str(file, "author_id") != h.uid || string(file["comment_id"]) != "null" || isNull(file["uploaded_at"]) {
		t.Fatalf("file = %v", file)
	}
	if !isNull(link["uploaded_at"]) || str(link, "url") != "https://example.com/spec" {
		t.Fatalf("link = %v", link)
	}
	f, _, err := store.Open("a-file")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(f)
	f.Close()
	if string(b) != "hello" {
		t.Fatalf("file bytes = %q", b)
	}

	// Undo tombstones what the import created.
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	h.svc.Wait()
	if live := h.list("attachment", false); len(live) != 0 {
		t.Fatalf("after undo = %v", live)
	}
}

func TestOwnJSONExportSkipsFiles(t *testing.T) {
	h := newHarness(t)
	data := ownAttachmentExport(strings.Repeat("0", 64))
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Notes) == 0 || !strings.Contains(strings.Join(plan.Notes, " "), "ZIP export") {
		t.Fatalf("notes = %v", plan.Notes)
	}
	if job := h.run(data, Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	live := h.list("attachment", false)
	if len(live) != 1 || str(live[0], "id") != "a-link" {
		t.Fatalf("attachments = %v", live)
	}
}

func TestOwnZipExportRespectsTotal(t *testing.T) {
	h := newHarness(t)
	store, err := blobs.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h.svc.SetBlobs(store, func(context.Context, string) (int64, int64, error) { return 1 << 20, 3, nil })
	sum := sha256.Sum256([]byte("hello"))
	data := zipOf(t, map[string]string{"export.json": ownAttachmentExport(hex.EncodeToString(sum[:])), "attachments/a-file/report.txt": "hello"})
	job := h.run(string(data), Options{TimeZone: "UTC"})
	if job.Status != StatusDone || len(job.Errors) != 1 || !strings.Contains(job.Errors[0].Reason, "total") {
		t.Fatalf("job = %+v", job)
	}
	if live := h.list("attachment", false); len(live) != 1 || str(live[0], "id") != "a-link" {
		t.Fatalf("attachments = %v", live)
	}
	if store.Exists("a-file") {
		t.Fatal("refused file was stored")
	}
}
