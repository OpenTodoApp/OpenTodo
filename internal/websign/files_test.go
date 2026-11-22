package websign

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"testing"
	"testing/fstest"
)

// A build's compressed forms (OpenSpec change compressed-static-assets): a .gz file
// is checked as the file it decodes to, in place of it or beside it; a bad one is
// named by its own path, the file that is wrong.
func TestCheckFSCompressedForms(t *testing.T) {
	js := bytes.Repeat([]byte("const a = 1;\n"), 100)
	gz := func(b []byte) []byte {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		zw.Write(b)
		zw.Close()
		return buf.Bytes()
	}
	sum := sha256.Sum256(js)
	m := &Manifest{Files: map[string]File{
		"assets/a.js": {SHA256: hex.EncodeToString(sum[:]), Size: int64(len(js))},
	}}
	check := func(name string, fsys fstest.MapFS, want []Problem) {
		t.Helper()
		got, err := CheckFS(fsys, m)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if len(got) == 0 {
			got = nil
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%s: problems %v, want %v", name, got, want)
		}
	}
	check("only the compressed form", fstest.MapFS{"assets/a.js.gz": {Data: gz(js)}}, nil)
	check("both forms", fstest.MapFS{"assets/a.js": {Data: js}, "assets/a.js.gz": {Data: gz(js)}}, nil)
	check("a compressed form of other bytes", fstest.MapFS{"assets/a.js.gz": {Data: gz([]byte("evil()"))}},
		[]Problem{{"assets/a.js.gz", "changed-file"}})
	check("a changed copy beside the file", fstest.MapFS{"assets/a.js": {Data: js}, "assets/a.js.gz": {Data: gz([]byte("evil()"))}},
		[]Problem{{"assets/a.js.gz", "changed-file"}})
	check("not gzip at all", fstest.MapFS{"assets/a.js.gz": {Data: []byte("not gzip")}},
		[]Problem{{"assets/a.js.gz", "changed-file"}})
	check("a compressed form of an unlisted file", fstest.MapFS{"assets/a.js": {Data: js}, "assets/b.js.gz": {Data: gz(js)}},
		[]Problem{{"assets/b.js", "unlisted-file"}})
	check("neither form", fstest.MapFS{}, []Problem{{"assets/a.js", "missing-file"}})
}

// A compressed form that decodes to more than its listed size, a decompression bomb
// among them, is a changed file, read no further than one byte past that size.
func TestCheckFSDecodeCap(t *testing.T) {
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	zw.Write(make([]byte, 64<<20)) // 64 MiB of zeros, about 64 KiB compressed
	zw.Close()
	m := &Manifest{Files: map[string]File{"assets/a.js": {SHA256: "00", Size: 200}}}
	got, err := CheckFS(fstest.MapFS{"assets/a.js.gz": {Data: buf.Bytes()}}, m)
	if err != nil {
		t.Fatal(err)
	}
	if want := []Problem{{"assets/a.js.gz", "changed-file"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("problems %v, want %v", got, want)
	}
	if _, n, err := hashGzip(fstest.MapFS{"b.gz": {Data: buf.Bytes()}}, "b.gz", 200); !errors.Is(err, ErrGzipTooLarge) || n != 201 {
		t.Fatalf("read %d bytes (%v), want ErrGzipTooLarge after the cap and one more: 201", n, err)
	}
}

// A compressed form is decoded as a browser decodes it: exactly one gzip member and
// nothing after it, and only under assets/, where the server sends one from (the
// security read of #1753).
func TestCheckFSCompressedFormIsOneMember(t *testing.T) {
	js := bytes.Repeat([]byte("const a = 1;\n"), 100)
	member := func(b []byte) []byte {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		zw.Write(b)
		zw.Close()
		return buf.Bytes()
	}
	sum := sha256.Sum256(js)
	m := &Manifest{Files: map[string]File{
		"assets/a.js": {SHA256: hex.EncodeToString(sum[:]), Size: int64(len(js))},
		"sw.js":       {SHA256: hex.EncodeToString(sum[:]), Size: int64(len(js))},
	}}
	half := len(js) / 2
	for name, tc := range map[string]struct {
		fsys fstest.MapFS
		want []Problem
	}{
		// Go would decode both members to the listed bytes; a browser may stop after the first.
		"two members": {fstest.MapFS{"assets/a.js.gz": {Data: append(member(js[:half]), member(js[half:])...)}, "sw.js": {Data: js}},
			[]Problem{{"assets/a.js.gz", "changed-file"}}},
		"bytes after the member": {fstest.MapFS{"assets/a.js.gz": {Data: append(member(js), "trailer"...)}, "sw.js": {Data: js}},
			[]Problem{{"assets/a.js.gz", "changed-file"}}},
		"a compressed form outside assets/": {fstest.MapFS{"assets/a.js.gz": {Data: member(js)}, "sw.js.gz": {Data: member(js)}},
			[]Problem{{"sw.js", "missing-file"}, {"sw.js.gz", "unlisted-file"}}},
		"one member, nothing after": {fstest.MapFS{"assets/a.js.gz": {Data: member(js)}, "sw.js": {Data: js}}, nil},
	} {
		got, err := CheckFS(tc.fsys, m)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if len(got) == 0 {
			got = nil
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: problems %v, want %v", name, got, tc.want)
		}
	}
}
