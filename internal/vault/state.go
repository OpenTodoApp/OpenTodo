package vault

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// StateDir is the vault's own folder inside the vault.
const StateDir = ".opentodo"

// stateFile is the vault's state inside StateDir.
const stateFile = "state.json"

// StateVersion is the state file format.
const StateVersion = 1

// State is what the vault remembers between syncs (design D6): its device, the
// cursor and log generation, its clock, the last-synced value of every field it
// reads (with the clock that wrote it), and what it last wrote to each file.
// It is written atomically, owner-only.
type State struct {
	Version    int    `json:"version"`
	Device     string `json:"device"`
	Profile    string `json:"profile"`
	Server     string `json:"server"`
	Cursor     int64  `json:"cursor"`
	Generation string `json:"generation,omitempty"`
	// Clock is the last timestamp the vault stamped; Offset its correction
	// towards the server's clock (docs/sync.md "Clocks").
	Clock       int64 `json:"clock"`
	Offset      int64 `json:"offset"`
	BackfillAck int64 `json:"backfill_ack,omitempty"`
	// Shared lists the account's shared projects (from the last exchange).
	Shared []string `json:"shared,omitempty"`
	// Store is the base: the account as of the last sync.
	Store Store `json:"store"`
	// Files maps a file's path (slash-separated, relative) to what was written.
	Files map[string]FileState `json:"files"`
	// Printed maps a task id to the file its line was written in.
	Printed map[string]string `json:"printed"`
	// Extra holds the text a task's line carries that the vault does not map.
	Extra map[string]string `json:"extra,omitempty"`
	// Initialized is false until the first sync wrote the files.
	Initialized bool `json:"initialized"`
}

// FileState is one written file: its project ("" for the Inbox) and the hash
// of the bytes written.
type FileState struct {
	Project string `json:"project"`
	Hash    string `json:"hash"`
}

// NewState makes the state of a new vault with a fresh device id.
func NewState(profile, server string) *State {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return &State{Version: StateVersion, Device: "vault:" + hex.EncodeToString(b), Profile: profile, Server: server,
		Store: Store{}, Files: map[string]FileState{}, Printed: map[string]string{}, Extra: map[string]string{}}
}

// StatePath is the state file of a vault folder.
func StatePath(dir string) string { return filepath.Join(dir, StateDir, stateFile) }

// ErrNotVault is returned for a folder without a vault state.
var ErrNotVault = errors.New("not a vault")

// LoadState reads a vault's state.
func LoadState(dir string) (*State, error) {
	raw, err := os.ReadFile(StatePath(dir))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotVault
	}
	if err != nil {
		return nil, err
	}
	var st State
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("the vault state %s is unreadable: %w", StatePath(dir), err)
	}
	if st.Store == nil {
		st.Store = Store{}
	}
	if st.Files == nil {
		st.Files = map[string]FileState{}
	}
	if st.Printed == nil {
		st.Printed = map[string]string{}
	}
	if st.Extra == nil {
		st.Extra = map[string]string{}
	}
	return &st, nil
}

// Save writes the state atomically with owner-only permissions.
func (st *State) Save(dir string) error {
	sd := filepath.Join(dir, StateDir)
	if err := os.MkdirAll(sd, 0o700); err != nil {
		return err
	}
	_ = os.Chmod(sd, 0o700)
	raw, err := json.Marshal(st)
	if err != nil {
		return err
	}
	tmp := StatePath(dir) + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, StatePath(dir))
}

// hashOf is the hash the state keeps for a file's bytes.
func hashOf(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
