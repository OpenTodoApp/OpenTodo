package blobs

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func spec(b []byte) Spec {
	h := sha256.Sum256(b)
	return Spec{Size: int64(len(b)), SHA256: hex.EncodeToString(h[:])}
}

func tmpEntries(t *testing.T, s *Store) int {
	t.Helper()
	es, err := os.ReadDir(s.tmp)
	if err != nil {
		t.Fatal(err)
	}
	return len(es)
}

func TestRoundTrip(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	body := []byte("hello attachment")
	if err := s.Write("a1b2c3", bytes.NewReader(body), spec(body)); err != nil {
		t.Fatal(err)
	}
	f, info, err := s.Open("a1b2c3")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(f)
	f.Close()
	if !bytes.Equal(got, body) || info.Size() != int64(len(body)) || info.Mode().Perm() != 0o600 {
		t.Fatalf("got %q size %d mode %v", got, info.Size(), info.Mode())
	}
	if p, _ := s.Path("a1b2c3"); filepath.Base(filepath.Dir(p)) != "a1" {
		t.Fatalf("path %s", p)
	}
	if err := s.Write("a1b2c3", bytes.NewReader(body), spec(body)); !errors.Is(err, ErrExists) {
		t.Fatalf("second write = %v", err)
	}
	var walked []string
	_ = s.Walk(func(id string, _ time.Time) error { walked = append(walked, id); return nil })
	if len(walked) != 1 || walked[0] != "a1b2c3" {
		t.Fatalf("walk %v", walked)
	}
	if err := s.Remove("a1b2c3"); err != nil || s.Exists("a1b2c3") {
		t.Fatalf("remove: %v", err)
	}
	if err := s.Remove("a1b2c3"); err != nil {
		t.Fatalf("second remove: %v", err)
	}
}

func TestMismatchLeavesNoFile(t *testing.T) {
	s, _ := New(t.TempDir())
	body := []byte("twelve bytes")
	for name, sp := range map[string]Spec{
		"digest":  {Size: int64(len(body)), SHA256: "00"},
		"shorter": spec(body[:5]),
		"longer":  {Size: 3, SHA256: spec(body[:3]).SHA256},
	} {
		if err := s.Write("id-"+name, bytes.NewReader(body), sp); !errors.Is(err, ErrMismatch) {
			t.Fatalf("%s: %v", name, err)
		}
		if s.Exists("id-" + name) {
			t.Fatalf("%s: file stored", name)
		}
	}
	if n := tmpEntries(t, s); n != 0 {
		t.Fatalf("%d temp files left", n)
	}
}

type failing struct{ n int }

func (f *failing) Read(p []byte) (int, error) {
	if f.n <= 0 {
		return 0, errors.New("connection reset")
	}
	f.n--
	return copy(p, bytes.Repeat([]byte{'x'}, len(p))), nil
}

func TestInterruptedReaderLeavesNoFile(t *testing.T) {
	s, _ := New(t.TempDir())
	if err := s.Write("cut", &failing{n: 3}, Spec{Size: 1 << 20, SHA256: "x"}); err == nil || errors.Is(err, ErrMismatch) {
		t.Fatalf("err = %v", err)
	}
	if s.Exists("cut") || tmpEntries(t, s) != 0 {
		t.Fatal("partial upload left behind")
	}
}

func TestBadIDRefused(t *testing.T) {
	s, _ := New(t.TempDir())
	for _, id := range []string{"", "../etc", "a/b", "a.b", string(make([]byte, 65))} {
		if _, err := s.Path(id); !errors.Is(err, ErrBadID) {
			t.Fatalf("%q: %v", id, err)
		}
		if err := s.Write(id, bytes.NewReader(nil), Spec{}); !errors.Is(err, ErrBadID) {
			t.Fatalf("write %q: %v", id, err)
		}
	}
}

// zeros is an io.Reader of n zero bytes that never allocates them all.
type zeros struct{ n int64 }

func (z *zeros) Read(p []byte) (int, error) {
	if z.n <= 0 {
		return 0, io.EOF
	}
	if int64(len(p)) > z.n {
		p = p[:z.n]
	}
	clear(p)
	z.n -= int64(len(p))
	return len(p), nil
}

func TestMemoryBounded(t *testing.T) {
	s, _ := New(t.TempDir())
	const size = 200 << 20
	h := sha256.New()
	_, _ = io.Copy(h, &zeros{n: size})
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	if err := s.Write("big", &zeros{n: size}, Spec{Size: size, SHA256: hex.EncodeToString(h.Sum(nil))}); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if grew := after.TotalAlloc - before.TotalAlloc; grew > 8<<20 {
		t.Fatalf("writing 200 MB allocated %d bytes", grew)
	}
}
