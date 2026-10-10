package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// SecretsDir is the directory under the data directory that holds secret files.
// Backups exclude it.
const SecretsDir = "secrets"

// Secrets is a set of named secret values. It deliberately refuses to be
// serialised or logged with its values: JSON encoding yields presence flags only
// and slog/fmt print a redacted form. Use Value to read one.
type Secrets map[string]string

// Value returns one secret ("" when unset).
func (s Secrets) Value(name string) string { return s[name] }

// Has reports whether a non-empty secret is stored under name.
func (s Secrets) Has(name string) bool { return s[name] != "" }

// MarshalJSON encodes presence flags only, never values.
func (s Secrets) MarshalJSON() ([]byte, error) {
	flags := make(map[string]bool, len(s))
	for k, v := range s {
		flags[k] = v != ""
	}
	return json.Marshal(flags)
}

// LogValue keeps secrets out of structured logs.
func (s Secrets) LogValue() slog.Value { return slog.StringValue(s.String()) }

// String lists the names of the secrets that are set, never their values.
func (s Secrets) String() string {
	names := make([]string, 0, len(s))
	for k, v := range s {
		if v != "" {
			names = append(names, k)
		}
	}
	sort.Strings(names)
	return fmt.Sprintf("secrets%v(redacted)", names)
}

// GoString keeps %#v redacted too.
func (s Secrets) GoString() string { return s.String() }

// SecretsFile is one JSON file of secrets under <data>/secrets/, created 0600 in
// a 0700 directory. Reads and writes are serialised.
type SecretsFile struct {
	path string
	mu   sync.Mutex
}

// NewSecretsFile returns the secrets file <dataDir>/secrets/<name>.json.
func NewSecretsFile(dataDir, name string) *SecretsFile {
	return &SecretsFile{path: filepath.Join(dataDir, SecretsDir, name+".json")}
}

// Path is the file location (for docs and tests).
func (f *SecretsFile) Path() string { return f.path }

// Load returns the stored secrets; a missing file is an empty set.
func (f *SecretsFile) Load() (Secrets, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.load()
}

func (f *SecretsFile) load() (Secrets, error) {
	raw, err := os.ReadFile(f.path)
	if errors.Is(err, fs.ErrNotExist) {
		return Secrets{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read secrets: %w", err)
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("decode secrets file %s: %w", f.path, err)
	}
	return Secrets(m), nil
}

// Update applies changes atomically: a nil pointer keeps the stored value, an
// empty string removes it, anything else replaces it.
func (f *SecretsFile) Update(changes map[string]*string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	cur, err := f.load()
	if err != nil {
		return err
	}
	changed := false
	for k, v := range changes {
		if v == nil {
			continue
		}
		changed = true
		if *v == "" {
			delete(cur, k)
		} else {
			cur[k] = *v
		}
	}
	if !changed {
		return nil
	}
	return f.write(cur)
}

func (f *SecretsFile) write(s Secrets) error {
	dir := filepath.Dir(f.path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create secrets dir: %w", err)
	}
	_ = os.Chmod(dir, 0o700)
	raw, err := json.Marshal(map[string]string(s))
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".secrets-*")
	if err != nil {
		return fmt.Errorf("write secrets: %w", err)
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return fmt.Errorf("write secrets: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), f.path); err != nil {
		return fmt.Errorf("write secrets: %w", err)
	}
	return nil
}
