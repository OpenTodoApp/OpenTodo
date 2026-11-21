package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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
