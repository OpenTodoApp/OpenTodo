package websign

import (
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"sort"
	"strings"
)

// Problem is one file that does not match its list.
type Problem struct {
	Path string
	// Cause is "changed-file", "missing-file" or "unlisted-file".
	Cause string
}

func (p Problem) String() string { return p.Cause + " " + p.Path }

// Unlisted are the built files the list leaves out: the list itself, and the
// web app manifest, which the server rewrites for a branded instance and
// serves as data (design D7).
var Unlisted = map[string]bool{FileName: true, "manifest.webmanifest": true}

// Listed reports whether a path of the built web app belongs in the list:
// every file except Unlisted and dot files (internal/web/dist/.gitkeep).
func Listed(p string) bool {
	if Unlisted[p] {
		return false
	}
	for _, part := range strings.Split(p, "/") {
		if strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

// HashFile returns the lowercase hex SHA-256 and size of one file.
func HashFile(fsys fs.FS, name string) (string, int64, error) {
	f, err := fsys.Open(name)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	return hashReader(f)
}

// GzipSuffix marks a build's compressed form of a file (OpenSpec change
// compressed-static-assets): assets/x.js.gz stands for assets/x.js, which the
// build may leave out. It is checked as the file it decodes to, never listed.
const GzipSuffix = ".gz"

// Errors from DecodeGzip for a compressed form that is not exactly one file.
var (
	ErrGzipTooLarge = errors.New("websign: the compressed form decodes to more than its size")
	ErrGzipTrailing = errors.New("websign: the compressed form has bytes after its gzip member")
)

// CompressedDir is where a build keeps compressed forms (compress-dist.mjs); a
// compressed form anywhere else is not one, so the server never sends it.
const CompressedDir = "assets/"

// DecodeGzip writes what a compressed form decodes to into dst, at most max bytes.
// It reads exactly one gzip member, as a browser does, and refuses bytes after it
// (ErrGzipTrailing) and a form that decodes to more than max, a decompression
// bomb among them (ErrGzipTooLarge), without reading past max+1 decoded bytes.
// The server and CheckFS both decode through it, so they see what a browser sees.
func DecodeGzip(dst io.Writer, src io.Reader, max int64) (int64, error) {
	br := bufio.NewReader(src)
	zr, err := gzip.NewReader(br)
	if err != nil {
		return 0, err
	}
	zr.Multistream(false)
	n, err := io.Copy(dst, io.LimitReader(zr, max+1))
	if err != nil {
		return n, err
	}
	if n > max {
		return n, ErrGzipTooLarge
	}
	if err := zr.Close(); err != nil {
		return n, err
	}
	if _, err := br.ReadByte(); err != io.EOF {
		return n, ErrGzipTrailing
	}
	return n, nil
}

// hashGzip returns the SHA-256 and size of what a compressed form decodes to
// (DecodeGzip, capped at max: a changed file is not read out).
func hashGzip(fsys fs.FS, name string, max int64) (string, int64, error) {
	f, err := fsys.Open(name)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := DecodeGzip(h, f, max)
	if err != nil {
		return "", n, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

func hashReader(r io.Reader) (string, int64, error) {
	h := sha256.New()
	n, err := io.Copy(h, r)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// CheckFS compares a built web app with its manifest: every listed file
// present with its size and hash, the worker's hash, and no file left out. A
// compressed form (GzipSuffix) counts as the file it decodes to: in place of a
// file the build left out, or beside it, where it must decode to the same bytes.
// One that does not decode is a changed file. The problems are sorted by path.
func CheckFS(fsys fs.FS, m *Manifest) ([]Problem, error) {
	var problems []Problem
	seen := map[string]bool{}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name, compressed := p, strings.HasSuffix(p, GzipSuffix)
		if compressed {
			name = strings.TrimSuffix(p, GzipSuffix)
		}
		if d.IsDir() || !Listed(name) {
			return nil
		}
		// Only the build's own compressed forms stand for a file: under CompressedDir,
		// which is all the server sends (security read of #1753). Any other .gz is a
		// file of its own the list does not name.
		if compressed && !strings.HasPrefix(p, CompressedDir) {
			problems = append(problems, Problem{p, "unlisted-file"})
			return nil
		}
		seen[name] = true
		want, ok := m.Files[name]
		if !ok {
			problems = append(problems, Problem{name, "unlisted-file"})
			return nil
		}
		var sum string
		var size int64
		if compressed {
			sum, size, err = hashGzip(fsys, p, want.Size)
		} else {
			sum, size, err = HashFile(fsys, p)
		}
		if err != nil {
			if !compressed {
				return err
			}
			sum, size = "", -1 // not gzip: it cannot be the listed file
		}
		if sum != want.SHA256 || size != want.Size {
			problems = append(problems, Problem{p, "changed-file"})
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("websign: read the files: %w", err)
	}
	for p := range m.Files {
		if !seen[p] {
			problems = append(problems, Problem{p, "missing-file"})
		}
	}
	if m.Worker.Path != "" {
		if f, ok := m.Files[m.Worker.Path]; !ok || f.SHA256 != m.Worker.SHA256 {
			problems = append(problems, Problem{m.Worker.Path, "changed-file"})
		}
	}
	sort.Slice(problems, func(i, j int) bool {
		if problems[i].Path != problems[j].Path {
			return problems[i].Path < problems[j].Path
		}
		return problems[i].Cause < problems[j].Cause
	})
	return problems, nil
}

// ValidPath reports whether a listed path is a clean relative path.
func ValidPath(p string) bool {
	return p != "" && !strings.HasPrefix(p, "/") && path.Clean(p) == p && !strings.HasPrefix(p, "../") && p != ".."
}
