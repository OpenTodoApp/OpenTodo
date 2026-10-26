package calsync

import (
	"context"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/settings"
)

// SecretsName is the secrets file of calendar sync: <data>/secrets/calendar-sync.json
// (design D3). Backups exclude the directory and the export never reads it.
const SecretsName = "calendar-sync"

// GoogleSecretKey holds the owner's Google client secret in the same file.
const GoogleSecretKey = "google.client_secret"

// reserved keys are never swept.
func reserved(key string) bool { return strings.HasPrefix(key, "google.") }

// Secrets keeps connection passwords and refresh tokens, and the Google client
// secret, in the secrets file.
type Secrets struct{ file *settings.SecretsFile }

// NewSecrets opens the secrets file of dataDir.
func NewSecrets(dataDir string) *Secrets {
	return &Secrets{file: settings.NewSecretsFile(dataDir, SecretsName)}
}

// Path is the file location (docs and tests).
func (s *Secrets) Path() string { return s.file.Path() }

// Get returns a stored value, "" when none is.
func (s *Secrets) Get(key string) (string, error) {
	v, err := s.file.Load()
	if err != nil {
		return "", err
	}
	return v.Value(key), nil
}

// Has reports whether a value is stored for each key.
func (s *Secrets) Has(keys ...string) (map[string]bool, error) {
	v, err := s.file.Load()
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(keys))
	for _, k := range keys {
		out[k] = v.Has(k)
	}
	return out, nil
}

// Set stores or replaces a value.
func (s *Secrets) Set(key, value string) error {
	return s.file.Update(map[string]*string{key: &value})
}

// Delete removes a value.
func (s *Secrets) Delete(key string) error {
	empty := ""
	return s.file.Update(map[string]*string{key: &empty})
}

// Sweep removes the secrets of connections that no longer exist (an account
// deleted, its rows gone by cascade) and reports how many it removed; the
// Google client secret stays.
func (s *Secrets) Sweep(ctx context.Context, store *Store) (int, error) {
	live, err := store.IDs(ctx)
	if err != nil {
		return 0, err
	}
	v, err := s.file.Load()
	if err != nil {
		return 0, err
	}
	empty := ""
	drop := map[string]*string{}
	for k := range v {
		if !live[k] && !reserved(k) {
			drop[k] = &empty
		}
	}
	if len(drop) == 0 {
		return 0, nil
	}
	return len(drop), s.file.Update(drop)
}
