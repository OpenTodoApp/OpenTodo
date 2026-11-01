package httpapi

import (
	"bytes"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// quotaRaceSetup stores two 1 MB files under a 2 MB quota and removes the
// second, so the account has room for exactly one more 1 MB file: either the
// removed one restored or a new upload, never both (issue #676). It returns
// the env, a restore of the removed file through sync (the rejection reasons,
// empty when it was applied) and the new upload's row id and bytes.
func quotaRaceSetup(t *testing.T) (e *env, uid string, restore func() []string, newID string, newFile []byte) {
	t.Helper()
	e, uid, task := attachmentSetup(t)
	resp, out := e.do("PUT", "/api/v1/settings/attachments", map[string]any{"enabled": true, "max_file_mb": 1, "quota_mb": 2})
	e.mustStatus(resp, 200, out)
	file := func(i int) []byte { return append([]byte{byte(i)}, bytes.Repeat([]byte{9}, 1<<20-1)...) }
	for i, id := range []string{"q0", "q1"} {
		queueRow(e, "laptop", id, task, uid, id+".bin", "application/octet-stream", file(i))
		if resp, body := e.raw("PUT", "/api/v1/attachments/"+id+"/content", file(i)); resp.StatusCode != 204 {
			t.Fatalf("%s: %d %s", id, resp.StatusCode, body)
		}
	}
	setDeleted := func(v any) []string {
		out := syncOnce(e, "laptop", 0, []map[string]any{{"id": ids.New(), "entity": "attachment", "entityId": "q1", "field": "deleted_at",
			"value": v, "ts": deviceNow(), "device": "laptop"}})
		var reasons []string
		rej, _ := out["rejected"].([]any)
		for _, r := range rej {
			reasons = append(reasons, r.(map[string]any)["reason"].(string))
		}
		return reasons
	}
	if rej := setDeleted(time.Now().UnixMilli()); len(rej) > 0 {
		t.Fatalf("remove: %v", rej)
	}
	newFile = file(2)
	queueRow(e, "laptop", "q2", task, uid, "q2.bin", "application/octet-stream", newFile)
	return e, uid, func() []string { return setDeleted(nil) }, "q2", newFile
}

// startUpload begins a PUT of content whose body the test feeds through the
// returned writer; the status arrives on the channel (0 on a transport error).
func startUpload(e *env, id string, size int) (*io.PipeWriter, <-chan int) {
	pr, pw := io.Pipe()
	// A failing test must not leave the server waiting for the rest of the body.
	e.t.Cleanup(func() { pw.CloseWithError(io.ErrUnexpectedEOF) })
	done := make(chan int, 1)
	go func() {
		req, _ := http.NewRequest("PUT", e.srv.URL+"/api/v1/attachments/"+id+"/content", pr)
		req.ContentLength = int64(size)
		resp, err := e.client.Do(req)
		if err != nil {
			done <- 0
			return
		}
		resp.Body.Close()
		done <- resp.StatusCode
	}()
	return pw, done
}

// Issue #676: a restore through sync while an upload is in flight counts the
// upload's held size, so the two cannot together go over the quota. The
// upload's body is gated, so the restore lands deterministically while the
// upload is in progress.
func TestAttachmentQuotaRestoreDuringUpload(t *testing.T) {
	e, uid, restore, id, content := quotaRaceSetup(t)
	pw, done := startUpload(e, id, len(content))
	if _, err := pw.Write(content[:1024]); err != nil {
		t.Fatal(err)
	}
	waitUploading(t, e.server, uid, int64(len(content)))
	if rej := restore(); len(rej) != 1 || rej[0] != "quota_exceeded" {
		t.Fatalf("restore while an upload holds the last room: %v", rej)
	}
	if _, err := pw.Write(content[1024:]); err != nil {
		t.Fatal(err)
	}
	pw.Close()
	if code := <-done; code != 204 {
		t.Fatalf("upload: %d", code)
	}
	if held := e.server.sync.QuotaHolds().Held(uid); held != 0 {
		t.Fatalf("%d bytes still held", held)
	}
	used, err := e.server.attachmentUsage(t.Context(), uid)
	if err != nil || used != 2<<20 {
		t.Fatalf("usage %d (%v), want the 2 MB quota", used, err)
	}
}

// Issue #676: a restore and an upload racing for the last room, in either
// order, never both succeed (run with -race -count=200).
func TestAttachmentQuotaRestoreRacesUpload(t *testing.T) {
	e, uid, restore, id, content := quotaRaceSetup(t)
	pw, done := startUpload(e, id, len(content))
	start := make(chan struct{})
	go func() {
		<-start
		_, _ = pw.Write(content)
		pw.Close()
	}()
	close(start)
	rej := restore()
	code := <-done
	restored := len(rej) == 0
	if restored && code == 204 {
		t.Fatal("the restore and the upload both took the last room")
	}
	if !restored && (len(rej) != 1 || rej[0] != "quota_exceeded") {
		t.Fatalf("restore: %v", rej)
	}
	if !restored && code != 204 {
		t.Fatalf("neither got the room: restore %v, upload %d", rej, code)
	}
	if held := e.server.sync.QuotaHolds().Held(uid); held != 0 {
		t.Fatalf("%d bytes still held", held)
	}
	used, err := e.server.attachmentUsage(t.Context(), uid)
	if err != nil || used > 2<<20 {
		t.Fatalf("usage %d (%v) over the 2 MB quota", used, err)
	}
}
