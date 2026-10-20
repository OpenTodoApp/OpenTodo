package issues

import (
	"context"

	"github.com/pixari/opentodo/internal/settings"
)

// SecretsName is the secrets file of issue connections: <data>/secrets/issues.json,
// one entry per connection id (design D3). Backups exclude the directory and
// the export never reads it.
const SecretsName = "issues"

// Tokens keeps connection tokens in the secrets file.
type Tokens struct{ file *settings.SecretsFile }

// NewTokens opens the tokens file of dataDir.
func NewTokens(dataDir string) *Tokens {
	return &Tokens{file: settings.NewSecretsFile(dataDir, SecretsName)}
}

// Path is the file location (docs and tests).
func (t *Tokens) Path() string { return t.file.Path() }

// Get returns the connection's token, "" when none is stored.
func (t *Tokens) Get(connID string) (string, error) {
	s, err := t.file.Load()
	if err != nil {
		return "", err
	}
	return s.Value(connID), nil
}

// Has reports whether a token is stored for each of ids.
func (t *Tokens) Has(ids ...string) (map[string]bool, error) {
	s, err := t.file.Load()
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = s.Has(id)
	}
	return out, nil
}

// Set stores or replaces a connection's token.
func (t *Tokens) Set(connID, token string) error {
	return t.file.Update(map[string]*string{connID: &token})
}

// Delete removes a connection's token.
func (t *Tokens) Delete(connID string) error {
	empty := ""
	return t.file.Update(map[string]*string{connID: &empty})
}

// Sweep removes the tokens of connections that no longer exist (an account
// deleted, its rows gone by cascade) and reports how many it removed.
func (t *Tokens) Sweep(ctx context.Context, store *Store) (int, error) {
	live, err := store.IDs(ctx)
	if err != nil {
		return 0, err
	}
	s, err := t.file.Load()
	if err != nil {
		return 0, err
	}
	empty := ""
	drop := map[string]*string{}
	for id := range s {
		if !live[id] {
			drop[id] = &empty
		}
	}
	if len(drop) == 0 {
		return 0, nil
	}
	return len(drop), t.file.Update(drop)
}
