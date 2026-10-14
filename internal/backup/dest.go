package backup

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/settings"
)

// Object is one file at a destination.
type Object struct {
	Name    string
	Size    int64
	ModTime time.Time
}

// Destination stores archives. Implementations stream: Put reads body once (S3
// reads it twice: once to hash, once to send) and never buffers it whole.
type Destination interface {
	// Kind is "local", "s3" or "webdav".
	Kind() string
	// Describe names the target without credentials, for status and errors.
	Describe() string
	Put(ctx context.Context, name string, body io.ReadSeeker, size int64) error
	List(ctx context.Context) ([]Object, error)
	Delete(ctx context.Context, name string) error
	// Open streams an archive back (backup-restore-web). Only archive names are
	// accepted, never paths; size is -1 when the destination does not say.
	Open(ctx context.Context, name string) (body io.ReadCloser, size int64, err error)
}

// ErrNotArchiveName is returned by Open for anything but an OpenTodo archive name.
var ErrNotArchiveName = errors.New("not an OpenTodo archive name")

// ErrArchiveNotFound is returned by Open when the destination has no such archive.
var ErrArchiveNotFound = errors.New("archive not found at the destination")

// IsArchiveName reports whether name is an archive this package writes.
func IsArchiveName(name string) bool { return archiveNameRE.MatchString(name) }

// validObjectName keeps names flat: archives and probes never contain a path.
func validObjectName(name string) error {
	if name == "" || strings.ContainsAny(name, `/\`) || name == "." || name == ".." || strings.HasPrefix(name, ".") {
		return fmt.Errorf("invalid object name %q", name)
	}
	return nil
}

// destination builds the configured destination. No network request is made here.
func (s *Service) destination(set Settings, sec settings.Secrets) (Destination, error) {
	switch set.Destination {
	case DestLocal, "":
		dir := set.Local.Dir
		if dir == "" {
			dir = s.defaultLocalDir()
		}
		return &localDest{dir: dir}, nil
	case DestS3:
		return newS3Dest(set.S3, sec.Value(SecretS3Key), s.client, s.now)
	case DestWebDAV:
		return newWebDAVDest(set.WebDAV, sec.Value(SecretWebDAVPass), s.client)
	}
	return nil, fmt.Errorf("unknown destination %q", set.Destination)
}

// ---- local directory ----

type localDest struct{ dir string }

func (d *localDest) Kind() string     { return DestLocal }
func (d *localDest) Describe() string { return d.dir }

// Put writes to a temp file in the destination directory and renames it into
// place, so a crash never leaves a half-written archive under the final name.
func (d *localDest) Put(_ context.Context, name string, body io.ReadSeeker, _ int64) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	if err := os.MkdirAll(d.dir, 0o700); err != nil {
		return fmt.Errorf("create %s: %w", d.dir, err)
	}
	tmp, err := os.CreateTemp(d.dir, ".tmp-"+name+"-*")
	if err != nil {
		return fmt.Errorf("write to %s: %w", d.dir, err)
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, body); err != nil {
		tmp.Close()
		return fmt.Errorf("write to %s: %w", d.dir, err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(d.dir, name))
}

func (d *localDest) List(context.Context) ([]Object, error) {
	entries, err := os.ReadDir(d.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("list %s: %w", d.dir, err)
	}
	var out []Object
	for _, e := range entries {
		if !e.Type().IsRegular() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Object{Name: e.Name(), Size: info.Size(), ModTime: info.ModTime()})
	}
	return out, nil
}

func (d *localDest) Delete(_ context.Context, name string) error {
	if err := validObjectName(name); err != nil {
		return err
	}
	err := os.Remove(filepath.Join(d.dir, name))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

func (d *localDest) Open(_ context.Context, name string) (io.ReadCloser, int64, error) {
	if !IsArchiveName(name) {
		return nil, 0, ErrNotArchiveName
	}
	f, err := os.Open(filepath.Join(d.dir, name))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, 0, ErrArchiveNotFound
	}
	if err != nil {
		return nil, 0, fmt.Errorf("open in %s: %w", d.dir, err)
	}
	fi, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, 0, err
	}
	return f, fi.Size(), nil
}

// ---- probe ----

// probe writes and deletes a small object to prove the destination works.
func probe(ctx context.Context, d Destination, now time.Time) error {
	name := fmt.Sprintf("opentodo-probe-%d.txt", now.UnixMilli())
	body := []byte("OpenTodo destination test. Safe to delete.\n")
	if err := d.Put(ctx, name, bytes.NewReader(body), int64(len(body))); err != nil {
		return fmt.Errorf("write test object to %s: %w", d.Describe(), err)
	}
	if err := d.Delete(ctx, name); err != nil {
		return fmt.Errorf("delete test object from %s: %w", d.Describe(), err)
	}
	return nil
}

// TestDestination probes the stored destination settings. It is the only call,
// besides a run, that contacts a remote destination.
func (s *Service) TestDestination(ctx context.Context) error {
	set, err := s.LoadSettings(ctx)
	if err != nil {
		return err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return err
	}
	if err := set.Validate(sec); err != nil {
		return err
	}
	d, err := s.destination(set, sec)
	if err != nil {
		return err
	}
	return probe(ctx, d, s.now())
}
