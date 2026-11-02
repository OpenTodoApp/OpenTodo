package vault

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// StateDir is the vault's own folder inside the vault.
const StateDir = ".opentodo"

// stateFile is the vault's state inside StateDir.
const stateFile = "state.json"

// StateVersion is the state file format: 2 adds the linked TaskNotes folder
// (OpenSpec change vault-tasknotes). A version-1 file reads as "nothing linked".
const StateVersion = 2

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
	// TaskNotes is the linked TaskNotes folder, nil when none is linked.
	TaskNotes *TaskNotesState `json:"tasknotes,omitempty"`
	// Owner is the installation that syncs the folder and LeaseUntil (Unix
	// ms) the end of its lease, renewed by every sync (OpenSpec change
	// obsidian-vault-sync, design D4). Both are absent in a state written
	// before that change: the next installation to sync becomes the owner.
	Owner      *Owner `json:"owner,omitempty"`
	LeaseUntil int64  `json:"lease_until,omitempty"`
}

// Owner names the installation that syncs a vault folder: `ot` on a machine
// (kind cli) or the Obsidian plugin on a device (kind obsidian), a random id
// per installation and a label people recognise (a host name, "Obsidian on
// iPhone").
type Owner struct {
	Kind    string `json:"kind"`
	Install string `json:"install"`
	Label   string `json:"label"`
}

// Lease is how long a sync keeps the folder's lease (design D4); `ot vault
// watch` and the plugin renew it on every cycle.
const Lease = 5 * time.Minute

// OwnedError is a sync refused because another installation owns the folder
// (error code vault_owned). Nothing was read from the server or written.
type OwnedError struct {
	Owner      Owner
	LeaseUntil int64
	Now        time.Time
}

func (e *OwnedError) Error() string {
	label := e.Owner.Label
	if label == "" {
		label = "another device"
	}
	until := time.UnixMilli(e.LeaseUntil).In(e.Now.Location()).Format("2006-01-02 15:04")
	if e.Running() {
		return fmt.Sprintf("this folder is synced by %s, whose lease runs until %s", label, until)
	}
	return fmt.Sprintf("this folder is synced by %s, whose lease ended at %s (it may only be asleep)", label, until)
}

// Running reports whether the owner's lease has not ended yet.
func (e *OwnedError) Running() bool { return e.LeaseUntil > e.Now.UnixMilli() }

// newDevice makes the device id of a new or taken-over vault; tests pin it.
var newDevice = func() string { return "vault:" + ids.Hex(12) }

// CheckOwner reports an OwnedError when the state names an installation other
// than o (design D4). A state without an owner, or a nil o, is never refused.
func (st *State) CheckOwner(o *Owner, now time.Time) error {
	if o == nil || st.Owner == nil || st.Owner.Install == o.Install {
		return nil
	}
	return &OwnedError{Owner: *st.Owner, LeaseUntil: st.LeaseUntil, Now: now}
}

// takeOver makes the state a fresh vault device of the folder (design D5): a
// new device id, no cursor, no base and nothing recorded about the files, so
// the next sync compares every line with the server. A linked TaskNotes
// folder stays linked; its notes are read again.
func (st *State) takeOver() {
	st.Device = newDevice()
	st.Cursor, st.Generation, st.BackfillAck, st.Clock, st.Offset = 0, "", 0, 0, 0
	st.Shared = nil
	st.Store = Store{}
	st.Files = map[string]FileState{}
	st.Printed = map[string]string{}
	st.Extra = map[string]string{}
	st.Initialized = false
	st.Owner, st.LeaseUntil = nil, 0
	if st.TaskNotes != nil {
		st.TaskNotes.Hashes = map[string]string{}
	}
}

// TaskNotesState is a linked TaskNotes folder (design D1): where it is, which
// note holds which task, what was last written to each note, and the notes
// archived in TaskNotes, which sync in neither direction.
type TaskNotesState struct {
	// Folder is relative to the vault folder when below it, else absolute.
	Folder string `json:"folder"`
	// Notes maps a task id to its note, slash-separated and relative to Folder.
	Notes map[string]string `json:"notes"`
	// Hashes maps a note to the hash of the bytes last written or read.
	Hashes   map[string]string `json:"hashes"`
	Archived map[string]bool   `json:"archived,omitempty"`
}

// Dir is the linked folder as a path on this machine.
func (t *TaskNotesState) Dir(vaultDir string) string {
	if filepath.IsAbs(t.Folder) {
		return t.Folder
	}
	return filepath.Join(vaultDir, filepath.FromSlash(t.Folder))
}

// ErrNewerState is a state file written by a newer ot.
var ErrNewerState = errors.New("the vault state was written by a newer ot")

// FileState is one written file: its project ("" for the Inbox) and the hash
// of the bytes written.
type FileState struct {
	Project string `json:"project"`
	Hash    string `json:"hash"`
}

// NewState makes the state of a new vault with a fresh device id.
func NewState(profile, server string) *State {
	return &State{Version: StateVersion, Device: newDevice(), Profile: profile, Server: server,
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
	if st.Version > StateVersion {
		return nil, fmt.Errorf("%w (format %d; this ot reads up to %d): update ot on this machine", ErrNewerState, st.Version, StateVersion)
	}
	if tn := st.TaskNotes; tn != nil {
		if tn.Notes == nil {
			tn.Notes = map[string]string{}
		}
		if tn.Hashes == nil {
			tn.Hashes = map[string]string{}
		}
		if tn.Archived == nil {
			tn.Archived = map[string]bool{}
		}
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
	st.Version = StateVersion
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
