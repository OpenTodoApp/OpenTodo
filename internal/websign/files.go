package websign

import (
	"crypto/sha256"
	"encoding/hex"
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
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

// CheckFS compares a built web app with its manifest: every listed file
// present with its size and hash, the worker's hash, and no file left out.
// The problems are sorted by path.
func CheckFS(fsys fs.FS, m *Manifest) ([]Problem, error) {
	var problems []Problem
	seen := map[string]bool{}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !Listed(p) {
			return nil
		}
		seen[p] = true
		want, ok := m.Files[p]
		if !ok {
			problems = append(problems, Problem{p, "unlisted-file"})
			return nil
		}
		sum, size, err := HashFile(fsys, p)
		if err != nil {
			return err
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
