package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// failWriter is a ResponseWriter whose connection drops after `limit` bytes,
// standing in for a client that disconnects or a write that fails partway
// through a streamed export.
type failWriter struct {
	h     http.Header
	buf   bytes.Buffer
	limit int
	code  int
}

func (f *failWriter) Header() http.Header {
	if f.h == nil {
		f.h = http.Header{}
	}
	return f.h
}
func (f *failWriter) WriteHeader(code int) { f.code = code }
func (f *failWriter) Flush()               {}
func (f *failWriter) Write(p []byte) (int, error) {
	if f.buf.Len() >= f.limit {
		return 0, errors.New("connection reset by peer")
	}
	if room := f.limit - f.buf.Len(); len(p) > room {
		f.buf.Write(p[:room])
		return room, errors.New("connection reset by peer")
	}
	return f.buf.Write(p)
}

// TestExportAbortsOnMidStreamFailure: when a streamed export fails after the
// first bytes are on the wire — here a dropped connection, the same path a DB
// error on a later page takes — the handler aborts the connection
// (panic(http.ErrAbortHandler)) instead of finishing the response, so the client
// gets a broken transfer and never a valid-looking file whose contents are
// truncated. Before streaming, an export that failed this way left a 200 with a
// zip finished by a deferred Close, or a JSON body curl -o saved with exit 0.
func TestExportAbortsOnMidStreamFailure(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	uid := e.ownerID()
	secret := e.token("full")
	// Enough that the export (compressed, for the zip) exceeds the drop point, so
	// bytes are already sent when the write fails.
	e.seedTasks(uid, "", 0, 400)

	for _, tc := range []struct {
		name string
		path string
		zip  bool
	}{
		{"json", "/api/v1/export", false},
		{"zip", "/api/v1/export?format=zip", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			req.Header.Set("Authorization", "Bearer "+secret)
			fw := &failWriter{limit: 4096}
			func() {
				defer func() {
					if r := recover(); r != http.ErrAbortHandler {
						t.Fatalf("want panic(http.ErrAbortHandler) on a mid-stream failure, got %v", r)
					}
				}()
				e.handler.ServeHTTP(fw, req)
				t.Fatal("the handler returned normally; a mid-stream failure must abort the connection")
			}()
			// The bytes that did reach the client must not form a usable export.
			if tc.zip {
				if _, err := zip.NewReader(bytes.NewReader(fw.buf.Bytes()), int64(fw.buf.Len())); err == nil {
					t.Fatal("the partial transfer is a readable zip; it must be broken, not a truncated archive finished by Close")
				}
			} else {
				var doc any
				if json.Unmarshal(fw.buf.Bytes(), &doc) == nil {
					t.Fatal("the partial transfer is valid JSON; it must be truncated, not a document that looks complete")
				}
			}
		})
	}
}

// dbDropWriter accepts every byte, but closes the database as the first bytes of
// the export reach it: the pages read after that fail with a database error while
// the response is already under way.
type dbDropWriter struct {
	failWriter
	drop func()
}

func (d *dbDropWriter) Write(p []byte) (int, error) {
	if d.drop != nil {
		d.drop()
		d.drop = nil
	}
	return d.buf.Write(p)
}

// TestExportAbortsOnDatabaseErrorMidStream: a database error on a later page
// (not a failed write) aborts the connection too, for both formats, so the client
// never keeps a file that looks complete but stops at the failed page.
func TestExportAbortsOnDatabaseErrorMidStream(t *testing.T) {
	for _, tc := range []struct {
		name string
		path string
		zip  bool
	}{
		{"json", "/api/v1/export", false},
		{"zip", "/api/v1/export?format=zip", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newEnv(t, false)
			e.register("a@example.com")
			uid := e.ownerID()
			secret := e.token("full")
			e.seedTasks(uid, "", 0, 2000)
			req := httptest.NewRequest("GET", tc.path, nil)
			req.Header.Set("Authorization", "Bearer "+secret)
			dw := &dbDropWriter{drop: func() { _ = e.db.Close() }}
			func() {
				defer func() {
					if r := recover(); r != http.ErrAbortHandler {
						t.Fatalf("want panic(http.ErrAbortHandler) on a database error mid-stream, got %v", r)
					}
				}()
				e.handler.ServeHTTP(dw, req)
				t.Fatal("the handler returned normally; a database error mid-stream must abort the connection")
			}()
			if dw.buf.Len() == 0 {
				t.Fatal("nothing was sent before the database failed; the test did not reach the mid-stream path")
			}
			if tc.zip {
				if _, err := zip.NewReader(bytes.NewReader(dw.buf.Bytes()), int64(dw.buf.Len())); err == nil {
					t.Fatal("the partial transfer is a readable zip")
				}
			} else {
				var doc any
				if json.Unmarshal(dw.buf.Bytes(), &doc) == nil {
					t.Fatal("the partial transfer is valid JSON")
				}
			}
		})
	}
}

// TestExportAvatarErrorAbortsZip: a profile picture that exists but cannot be read
// aborts the zip export, as a failed attachment file does, instead of a finished
// archive without it; no picture at all is simply no entry.
func TestExportAvatarErrorAbortsZip(t *testing.T) {
	e := newEnv(t, false)
	e.register("a@example.com")
	uid := e.ownerID()
	secret := e.token("full")
	p := e.server.avatarPath(uid)
	if p == "" {
		t.Skip("no avatar storage in this environment")
	}
	// A directory where the picture file belongs: it exists, but reading it fails.
	if err := os.MkdirAll(p, 0o700); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/v1/export?format=zip", nil)
	req.Header.Set("Authorization", "Bearer "+secret)
	rec := httptest.NewRecorder()
	func() {
		defer func() {
			if r := recover(); r != http.ErrAbortHandler {
				t.Fatalf("want panic(http.ErrAbortHandler) when the picture cannot be read, got %v", r)
			}
		}()
		e.handler.ServeHTTP(rec, req)
		t.Fatal("the zip export finished without the picture it could not read")
	}()
}
