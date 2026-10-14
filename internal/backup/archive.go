package backup

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

// Archive format identifiers (see docs/backups.md).
const (
	ManifestName      = "manifest.json"
	ManifestFormat    = "opentodo-backup"
	ManifestVersion   = 1
	CompressionGzip   = "gzip"
	CompressionNone   = "none"
	archiveTimeLayout = "20060102-150405"
)

// Manifest is the first entry of every archive.
type Manifest struct {
	Format        string         `json:"format"`
	FormatVersion int            `json:"formatVersion"`
	AppVersion    string         `json:"appVersion"`
	SchemaVersion int            `json:"schemaVersion"`
	CreatedAt     string         `json:"createdAt"` // RFC 3339, UTC
	Generation    string         `json:"generation"`
	Compression   string         `json:"compression"`
	Encrypted     bool           `json:"encrypted"`
	Files         []ManifestFile `json:"files"`
}

// ManifestFile describes one archive entry after the manifest.
type ManifestFile struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// archiveNameRE matches every archive this package writes. Retention only ever
// considers names that match, so unrelated objects under a shared prefix are safe.
var archiveNameRE = regexp.MustCompile(`^opentodo-(\d{8}-\d{6})-([0-9a-f]{8})\.tar(\.gz)?(\.enc)?$`)

// ArchiveName builds the file name for an archive created at t.
func ArchiveName(t time.Time, generation string, compressed, encrypted bool) string {
	g := generation
	if len(g) > 8 {
		g = g[:8]
	}
	for len(g) < 8 {
		g += "0"
	}
	name := "opentodo-" + t.UTC().Format(archiveTimeLayout) + "-" + g + ".tar"
	if compressed {
		name += ".gz"
	}
	if encrypted {
		name += ".enc"
	}
	return name
}

// archiveTime parses the creation time out of an archive name.
func archiveTime(name string) (time.Time, bool) {
	m := archiveNameRE.FindStringSubmatch(name)
	if m == nil {
		return time.Time{}, false
	}
	t, err := time.Parse(archiveTimeLayout, m[1])
	return t, err == nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// snapshot writes a transactionally consistent, WAL-free copy of the live
// database into the temp directory with VACUUM INTO and returns its path.
func (s *Service) snapshot(ctx context.Context) (string, error) {
	if err := os.MkdirAll(s.tmpDir(), 0o700); err != nil {
		return "", fmt.Errorf("create temp dir: %w", err)
	}
	path := filepath.Join(s.tmpDir(), "snapshot-"+s.now().UTC().Format(archiveTimeLayout)+"-"+randomHex(4)+".db")
	if _, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		os.Remove(path)
		return "", fmt.Errorf("snapshot database: %w", err)
	}
	return path, nil
}

// generation returns the current log generation.
func (s *Service) generation(ctx context.Context) (string, error) {
	return s.settings.GetString(ctx, settings.GenerationKey)
}

// fileDigest returns the size and hex SHA-256 of a file.
func fileDigest(path string) (int64, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, "", err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return 0, "", err
	}
	return n, hex.EncodeToString(h.Sum(nil)), nil
}

// ExtraFiles are data-directory files packaged after the database when they
// exist: the web push key pair (internal/push.KeyFile, OpenSpec `reminders`), so
// a restored server keeps serving the key existing subscriptions are bound to.
// Restore puts them back next to the database; archives without them are fine.
var ExtraFiles = []string{"push_vapid.pem"}

// maxExtraFileSize bounds an extra file read from an archive.
const maxExtraFileSize = 64 << 10

// archiveOptions select the outer layers of an archive.
type archiveOptions struct {
	compress   bool
	passphrase string
	chunkSize  int // encryption chunk size; 0 = DefaultChunkSize
	// extras are paths of extra files (see ExtraFiles), stored under their base name.
	extras []string
}

// writeArchive streams tar(manifest.json, opentodo.db) through optional gzip and
// optional encryption into w. Only the database snapshot is packaged, so the
// secrets directory and earlier backups are never part of an archive.
func writeArchive(w io.Writer, snapshotPath string, m Manifest, o archiveOptions) error {
	m.Compression = CompressionNone
	if o.compress {
		m.Compression = CompressionGzip
	}
	m.Encrypted = o.passphrase != ""
	size, sum, err := fileDigest(snapshotPath)
	if err != nil {
		return fmt.Errorf("checksum snapshot: %w", err)
	}
	m.Files = []ManifestFile{{Name: store.DBFile, Size: size, SHA256: sum}}
	for _, p := range o.extras {
		n, sum, err := fileDigest(p)
		if err != nil {
			return fmt.Errorf("checksum %s: %w", filepath.Base(p), err)
		}
		m.Files = append(m.Files, ManifestFile{Name: filepath.Base(p), Size: n, SHA256: sum})
	}
	manifest, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}

	out := w
	var enc *encryptWriter
	if o.passphrase != "" {
		enc, err = newEncryptWriter(w, o.passphrase, o.chunkSize)
		if err != nil {
			return err
		}
		out = enc
	}
	var gz *gzip.Writer
	if o.compress {
		gz = gzip.NewWriter(out)
		out = gz
	}
	tw := tar.NewWriter(out)
	mtime, _ := time.Parse(time.RFC3339, m.CreatedAt)
	if err := tw.WriteHeader(&tar.Header{Name: ManifestName, Mode: 0o600, Size: int64(len(manifest)), ModTime: mtime, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	if _, err := tw.Write(manifest); err != nil {
		return err
	}
	f, err := os.Open(snapshotPath)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := tw.WriteHeader(&tar.Header{Name: store.DBFile, Mode: 0o600, Size: size, ModTime: mtime, Typeflag: tar.TypeReg}); err != nil {
		return err
	}
	if _, err := io.Copy(tw, f); err != nil {
		return err
	}
	for i, p := range o.extras {
		raw, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if int64(len(raw)) != m.Files[i+1].Size {
			return fmt.Errorf("%s changed while archiving", filepath.Base(p))
		}
		if err := tw.WriteHeader(&tar.Header{Name: filepath.Base(p), Mode: 0o600, Size: int64(len(raw)), ModTime: mtime, Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		if _, err := tw.Write(raw); err != nil {
			return err
		}
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if gz != nil {
		if err := gz.Close(); err != nil {
			return err
		}
	}
	if enc != nil {
		return enc.Close()
	}
	return nil
}

// ErrPassphraseRequired is returned when an encrypted archive is opened without one.
var ErrPassphraseRequired = errors.New("archive is encrypted: a passphrase is required (--passphrase-file)")

// ErrIntegrity covers checksum mismatches and authentication failures.
var ErrIntegrity = errors.New("archive integrity check failed")

// ErrPassphraseInvalid is returned when the first encrypted chunk fails to open:
// almost always a wrong passphrase. It wraps ErrIntegrity, so callers that only
// tell "verified" from "not verified" keep working; later chunks failing stay
// plain ErrIntegrity (tampering or truncation).
var ErrPassphraseInvalid = fmt.Errorf("%w: wrong passphrase or corrupted archive", ErrIntegrity)

// openArchive peels the outer layers off r and returns a tar reader plus a
// function that must be called after the tar stream is read: it drains and
// authenticates whatever follows, so truncation and tampering past the last tar
// entry are detected too.
func openArchive(r io.Reader, passphrase string) (*tar.Reader, func() error, bool, error) {
	br := bufio.NewReaderSize(r, 64<<10)
	head, _ := br.Peek(len(encMagic))
	encrypted := bytes.Equal(head, []byte(encMagic))
	var inner io.Reader = br
	if encrypted {
		if passphrase == "" {
			return nil, nil, true, ErrPassphraseRequired
		}
		dr, err := newDecryptReader(br, passphrase)
		if err != nil {
			return nil, nil, true, err
		}
		inner = bufio.NewReaderSize(dr, 64<<10)
		// Open the first chunk now, so a wrong passphrase is reported as such
		// rather than as whatever layer reads first.
		if _, err := inner.(*bufio.Reader).Peek(1); err != nil && !errors.Is(err, io.EOF) {
			return nil, nil, true, err
		}
	}
	ib := inner.(*bufio.Reader)
	if magic, _ := ib.Peek(2); len(magic) == 2 && magic[0] == 0x1f && magic[1] == 0x8b {
		gz, err := gzip.NewReader(ib)
		if err != nil {
			return nil, nil, encrypted, fmt.Errorf("%w: %v", ErrIntegrity, err)
		}
		finish := func() error {
			if _, err := io.Copy(io.Discard, gz); err != nil {
				return fmt.Errorf("%w: %v", ErrIntegrity, err)
			}
			if _, err := io.Copy(io.Discard, ib); err != nil {
				return fmt.Errorf("%w: %v", ErrIntegrity, err)
			}
			return nil
		}
		return tar.NewReader(gz), finish, encrypted, nil
	}
	finish := func() error {
		if _, err := io.Copy(io.Discard, ib); err != nil {
			return fmt.Errorf("%w: %v", ErrIntegrity, err)
		}
		return nil
	}
	return tar.NewReader(ib), finish, encrypted, nil
}
