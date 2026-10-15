// Package blobs stores attachment bytes as immutable files (OpenSpec change
// attachments, design D2): <data>/attachments/<id[:2]>/<id>, written once through a
// temporary file with the size and SHA-256 digest checked against the metadata,
// fsynced and renamed into place. Nothing reads a file whole: writes stream through
// a 32 KB copy buffer and the hash, reads hand out an *os.File.
package blobs

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var (
	// ErrBadID: the id is not a usable file name.
	ErrBadID = errors.New("blobs: invalid id")
	// ErrMismatch: the bytes do not match the expected size or digest.
	ErrMismatch = errors.New("blobs: size or digest mismatch")
	// ErrExists: a file for this id is already stored (files are immutable).
	ErrExists = errors.New("blobs: already stored")
	// ErrNotFound: no file for this id.
	ErrNotFound = errors.New("blobs: not found")
)

var idRe = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// ValidID reports whether id may name a file.
func ValidID(id string) bool { return idRe.MatchString(id) }

// Store is the file store rooted at a data directory.
type Store struct {
	dir string // <data>/attachments
	tmp string // <data>/tmp
}

// New returns the store for a data directory, creating its directories.
func New(dataDir string) (*Store, error) {
	s := &Store{dir: filepath.Join(dataDir, "attachments"), tmp: filepath.Join(dataDir, "tmp")}
	for _, d := range []string{s.dir, s.tmp} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, fmt.Errorf("blobs: create %s: %w", d, err)
		}
	}
	return s, nil
}

// Dir is the store's root, <data>/attachments.
func (s *Store) Dir() string { return s.dir }

// Path is where a file is stored. id must be valid.
func (s *Store) Path(id string) (string, error) {
	if !ValidID(id) {
		return "", ErrBadID
	}
	prefix := id
	if len(prefix) > 2 {
		prefix = prefix[:2]
	}
	return filepath.Join(s.dir, prefix, id), nil
}

// Spec is what the stored bytes must be.
type Spec struct {
	Size   int64
	SHA256 string // hex
}

// Write streams r into the file of id. The bytes must be exactly want.Size long and
// hash to want.SHA256; otherwise nothing is stored and ErrMismatch is returned.
func (s *Store) Write(id string, r io.Reader, want Spec) error {
	dst, err := s.Path(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dst); err == nil {
		return ErrExists
	}
	var nonce [6]byte
	_, _ = rand.Read(nonce[:])
	tmp, err := os.OpenFile(filepath.Join(s.tmp, "upload-"+id+"-"+hex.EncodeToString(nonce[:])), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("blobs: temp file: %w", err)
	}
	ok := false
	defer func() {
		if !ok {
			tmp.Close()
			os.Remove(tmp.Name())
		}
	}()
	h := sha256.New()
	// One byte more than allowed tells an oversized body from an exact one.
	n, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(r, want.Size+1))
	if err != nil {
		return fmt.Errorf("blobs: write: %w", err)
	}
	if n != want.Size || hex.EncodeToString(h.Sum(nil)) != want.SHA256 {
		return ErrMismatch
	}
	if err := tmp.Sync(); err != nil {
		return fmt.Errorf("blobs: sync: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("blobs: close: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
		return fmt.Errorf("blobs: dir: %w", err)
	}
	if err := os.Rename(tmp.Name(), dst); err != nil {
		return fmt.Errorf("blobs: rename: %w", err)
	}
	ok = true
	return nil
}

// Open returns the stored file of id and its info; ErrNotFound when there is none.
func (s *Store) Open(id string) (*os.File, os.FileInfo, error) {
	p, err := s.Path(id)
	if err != nil {
		return nil, nil, err
	}
	f, err := os.Open(p)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, nil, err
	}
	return f, info, nil
}

// Exists reports whether a file is stored for id.
func (s *Store) Exists(id string) bool {
	p, err := s.Path(id)
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// Remove deletes the file of id; a missing file is not an error.
func (s *Store) Remove(id string) error {
	p, err := s.Path(id)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

// Walk calls fn for every stored file with its id and modification time.
func (s *Store) Walk(fn func(id string, modified time.Time) error) error {
	return filepath.WalkDir(s.dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		if d.IsDir() || !ValidID(d.Name()) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		return fn(d.Name(), info.ModTime())
	})
}

// RelPath is a file's path relative to the data directory ("attachments/ab/abc…"),
// as backups and the ZIP export name it.
func (s *Store) RelPath(id string) (string, error) {
	p, err := s.Path(id)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Join("attachments", filepath.Base(filepath.Dir(p)), id)), nil
}
