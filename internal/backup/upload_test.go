package backup

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func tempFileWith(t *testing.T, b []byte) *os.File {
	t.Helper()
	f, err := os.Create(filepath.Join(t.TempDir(), "archive"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.Close() })
	if _, err := f.Write(b); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	return f
}

func setMultipart(t *testing.T, threshold, part int64) {
	t.Helper()
	oldT, oldP := multipartThreshold, multipartPartSize
	multipartThreshold, multipartPartSize = threshold, part
	t.Cleanup(func() { multipartThreshold, multipartPartSize = oldT, oldP })
}

// TestS3MultipartUpload (reliable-background-jobs): archives above the
// threshold go up in signed parts, each with its own payload hash, and are
// assembled by CompleteMultipartUpload.
func TestS3MultipartUpload(t *testing.T) {
	setMultipart(t, 3000, 1024)
	f, srv := newFakeS3(t)
	d, err := newS3Dest(S3Settings{Endpoint: srv.URL, Region: f.creds.region, Bucket: "bkt", AccessKey: f.creds.accessKey, PathStyle: true}, f.creds.secretKey, srv.Client(), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	body := make([]byte, 3500) // four parts: 1024, 1024, 1024, 428
	rand.Read(body)
	name := "opentodo-20260101-000000-aaaaaaaa.tar.gz"
	if err := d.Put(context.Background(), name, tempFileWith(t, body), int64(len(body))); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(f.objects[name], body) {
		t.Fatalf("stored %d bytes, want the %d uploaded", len(f.objects[name]), len(body))
	}
	parts := 0
	for _, r := range f.reqs {
		if strings.HasPrefix(r, "PUT ") && strings.Contains(r, "partNumber=") {
			parts++
		}
	}
	if parts != 4 {
		t.Fatalf("%d parts uploaded, want 4: %v", parts, f.reqs)
	}
	// A small archive stays a single PutObject.
	putString(t, d, "opentodo-20260102-000000-aaaaaaaa.tar.gz", "small")
	if last := f.reqs[len(f.reqs)-1]; strings.Contains(last, "uploadId") {
		t.Fatalf("small archive used multipart: %s", last)
	}
}

// TestS3MultipartAbortsOnFailure: a failed part aborts the upload, so no
// orphaned parts are left (and billed) at the provider.
func TestS3MultipartAbortsOnFailure(t *testing.T) {
	setMultipart(t, 1000, 512)
	f, srv := newFakeS3(t)
	f.failPart = 2
	d, _ := newS3Dest(S3Settings{Endpoint: srv.URL, Region: f.creds.region, Bucket: "bkt", AccessKey: f.creds.accessKey, PathStyle: true}, f.creds.secretKey, srv.Client(), time.Now)
	body := make([]byte, 1500)
	err := d.Put(context.Background(), "opentodo-20260101-000000-aaaaaaaa.tar.gz", tempFileWith(t, body), int64(len(body)))
	if err == nil || !strings.Contains(err.Error(), "InternalError") {
		t.Fatalf("put = %v, want the part's error", err)
	}
	if len(f.uploads) != 0 {
		t.Fatalf("upload not aborted: %v", f.uploads)
	}
	if len(f.objects) != 0 {
		t.Fatalf("object stored after a failed part: %v", f.objects)
	}
}

// TestUploadStallTimesOut (reliable-background-jobs): requests to a
// destination are bounded by progress, not by one client-wide timeout: a
// destination that stops answering fails the upload once no byte moved for
// the idle limit, however large the archive.
func TestUploadStallTimesOut(t *testing.T) {
	old := requestIdle
	requestIdle = 200 * time.Millisecond
	t.Cleanup(func() { requestIdle = old })
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "MKCOL" {
			w.WriteHeader(http.StatusCreated)
			return
		}
		_, _ = io.Copy(io.Discard, r.Body)
		select { // never answers while the test runs
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(release)
	d, err := newWebDAVDest(WebDAVSettings{URL: srv.URL + "/dav/", AllowHTTP: true}, "", &http.Client{})
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	err = d.Put(context.Background(), "opentodo-20260101-000000-aaaaaaaa.tar.gz", strings.NewReader("archive"), 7)
	if err == nil || !errors.Is(err, errStalled) {
		t.Fatalf("put = %v, want a stall error", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatalf("stall noticed after %v", time.Since(start))
	}
}
