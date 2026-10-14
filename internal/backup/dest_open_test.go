package backup

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// backup-restore-web 2.1: every destination streams an archive back by name,
// and refuses anything that is not an archive name without contacting it.
func TestDestinationOpen(t *testing.T) {
	ctx := context.Background()
	const name = "opentodo-20261013-030000-4f1c0a9e.tar.gz"
	fs3, s3srv := newFakeS3(t)
	s3d, err := newS3Dest(S3Settings{Endpoint: s3srv.URL, Region: fs3.creds.region, Bucket: "bkt", Prefix: "p", AccessKey: fs3.creds.accessKey, PathStyle: true},
		fs3.creds.secretKey, s3srv.Client(), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	fdav, davsrv := newFakeDAV(t)
	davd, err := newWebDAVDest(WebDAVSettings{URL: davsrv.URL + "/dav/backups/", Username: "me", AllowHTTP: true}, "pw", davsrv.Client())
	if err != nil {
		t.Fatal(err)
	}
	dests := map[string]Destination{"local": &localDest{dir: t.TempDir()}, "s3": s3d, "webdav": davd}
	for kind, d := range dests {
		t.Run(kind, func(t *testing.T) {
			putString(t, d, name, "archive bytes")
			before := len(fs3.reqs) + len(fdav.methods)
			for _, bad := range []string{"../opentodo.db", "opentodo.db", "notes.txt", "opentodo-20261013-030000-4f1c0a9e.tar.gz/../x"} {
				if _, _, err := d.Open(ctx, bad); !errors.Is(err, ErrNotArchiveName) {
					t.Fatalf("Open(%q) err = %v", bad, err)
				}
			}
			if after := len(fs3.reqs) + len(fdav.methods); after != before {
				t.Fatal("a refused name contacted the destination")
			}
			body, size, err := d.Open(ctx, name)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := io.ReadAll(body)
			body.Close()
			if string(raw) != "archive bytes" || (size != -1 && size != int64(len(raw))) {
				t.Fatalf("got %q size %d", raw, size)
			}
			if _, _, err := d.Open(ctx, "opentodo-20200101-000000-00000000.tar"); !errors.Is(err, ErrArchiveNotFound) {
				t.Fatalf("missing archive err = %v", err)
			}
		})
	}
}

// backup-restore-web 2.2: fetching an archive into the staging directory
// streams it: a 64 MiB archive arrives intact without the heap growing with it.
func TestFetchArchiveStreams(t *testing.T) {
	src := t.TempDir()
	const name = "opentodo-20261013-030000-4f1c0a9e.tar"
	f, err := os.Create(filepath.Join(src, name))
	if err != nil {
		t.Fatal(err)
	}
	want := sha256.New()
	if _, err := io.CopyN(io.MultiWriter(f, want), rand.Reader, 64<<20); err != nil {
		t.Fatal(err)
	}
	f.Close()
	dst := filepath.Join(t.TempDir(), "archive")
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	n, err := fetchArchive(context.Background(), &localDest{dir: src}, name, dst, -1)
	runtime.ReadMemStats(&after)
	if err != nil || n != 64<<20 {
		t.Fatalf("fetch: %d %v", n, err)
	}
	if grown := int64(after.HeapAlloc) - int64(before.HeapAlloc); grown > 16<<20 {
		t.Fatalf("heap grew by %d bytes while streaming", grown)
	}
	got := sha256.New()
	g, _ := os.Open(dst)
	io.Copy(got, g)
	g.Close()
	if string(got.Sum(nil)) != string(want.Sum(nil)) {
		t.Fatal("fetched archive differs")
	}
}
