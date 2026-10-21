package vault

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Limits of a vault (design D12), checked before any write or push.
const (
	MaxFileBytes = 1 << 20
	MaxFileLines = 5000
	MaxTasks     = 20000
	MaxNoteBytes = 64 << 10
)

// LimitError is a sync stopped by a limit; nothing was written or pushed.
type LimitError struct{ Msg string }

func (e *LimitError) Error() string { return e.Msg }

// Options configure one sync.
type Options struct {
	Dir       string
	Transport Transport
	// Crypter opens and seals content values; nil for an account without
	// end-to-end encryption.
	Crypter Crypter
	// UserID is the account's user, written as completed_by.
	UserID string
	Now    func() time.Time
	Loc    *time.Location
	// ReadOnly pulls and writes files but pushes nothing; files changed on
	// disk stay pending.
	ReadOnly bool
	// DryRun plans the ops and the files and changes nothing.
	DryRun bool
	// State is used instead of the folder's state file (ot vault init).
	State *State
}

// Event is one line of the sync's output.
type Event struct {
	Kind string `json:"kind"`
	File string `json:"file,omitempty"`
	Task string `json:"task,omitempty"`
	Text string `json:"text"`
}

// Report is what a sync did (spec "Vault commands, output and scope").
type Report struct {
	Written   int      `json:"written"`
	Created   int      `json:"created"`
	Updated   int      `json:"updated"`
	Trashed   int      `json:"trashed"`
	Conflicts int      `json:"conflicts"`
	Warnings  []string `json:"warnings"`
	Cursor    int64    `json:"cursor"`
	Events    []Event  `json:"events"`
	// Projects and Tasks count what the vault holds after the sync.
	Projects int `json:"projects"`
	Tasks    int `json:"tasks"`
	// Planned lists the ops a dry run would push; Files the files it would write.
	Planned []Op     `json:"planned,omitempty"`
	Files   []string `json:"files,omitempty"`
}

func (r *Report) event(kind, file, task, format string, args ...any) {
	r.Events = append(r.Events, Event{Kind: kind, File: file, Task: task, Text: fmt.Sprintf(format, args...)})
}

func (r *Report) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

// engine is one run of a sync.
type engine struct {
	o    Options
	st   *State
	t    Transport
	clk  clock
	rep  *Report
	base Store // the last-synced account
	app  Store // base plus what was pulled, then plus the vault's own ops
	// startCursor is the cursor the run began with; ids of new entities are
	// derived from it so a retried run makes the same ids.
	startCursor int64
	reseed      []Op
	refused     map[string]bool  // op id → refused by the server
	stamped     map[string]int64 // op id → timestamp after a clock_skew retry

	disk    map[string][]byte // every vault file on disk by slash path
	changed map[string]bool   // files whose hash differs from the last write
	parsed  map[string]*Doc   // changed files, parsed
	fileOf  map[string]string // parsed path → project id ("" Inbox)
	skip    map[string]bool   // parsed paths whose project is gone: not merged
	bodies  map[string]map[string]map[string]any
	order   []string // entity:id in the order bodies were first touched
	fresh   map[string]bool
	conf    map[string][]string // conflict file → lines to append
	ops     []Op
}

// Sync runs one sync of the vault in o.Dir.
func Sync(ctx context.Context, o Options) (*Report, error) {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Loc == nil {
		o.Loc = time.Local
	}
	st := o.State
	if st == nil {
		var err error
		if st, err = LoadState(o.Dir); err != nil {
			return nil, err
		}
	}
	e := &engine{o: o, st: st, t: o.Transport, rep: &Report{Warnings: []string{}, Events: []Event{}},
		base: st.Store, app: st.Store.Clone(), startCursor: st.Cursor,
		refused: map[string]bool{}, stamped: map[string]int64{}, conf: map[string][]string{},
		bodies: map[string]map[string]map[string]any{}, fresh: map[string]bool{}}
	e.clk = clock{st: st, now: o.Now}
	if err := e.scan(); err != nil {
		return nil, err
	}
	if err := e.pull(ctx); err != nil {
		return nil, err
	}
	if !o.ReadOnly {
		if err := e.merge(); err != nil {
			return nil, err
		}
	}
	e.ops = append(e.reseed, e.build()...)
	// Optimistic: the vault's ops applied locally to check the task limit.
	trial := e.app.Clone()
	for _, op := range e.ops {
		trial.Apply(op)
	}
	if n := countTasks(trial, st); n > MaxTasks {
		return nil, &LimitError{Msg: fmt.Sprintf("the vault would hold %d tasks; the limit is %d", n, MaxTasks)}
	}
	if o.DryRun {
		e.rep.Planned = e.ops
		e.app = trial
		e.plan(true)
		e.rep.Cursor = e.startCursor
		return e.rep, nil
	}
	if !o.ReadOnly && len(e.ops) > 0 {
		if err := e.push(ctx, e.ops); err != nil {
			return nil, err
		}
	}
	for _, op := range e.ops {
		if e.refused[op.ID] {
			continue
		}
		if ts, ok := e.stamped[op.ID]; ok {
			op.TS = ts
		}
		e.app.Apply(op)
	}
	if err := e.plan(false); err != nil {
		return nil, err
	}
	e.saveBase()
	st.Initialized = true
	if err := st.Save(o.Dir); err != nil {
		return nil, err
	}
	e.rep.Cursor = st.Cursor
	return e.rep, nil
}

// countTasks counts the tasks the vault prints: open tasks of live projects
// and the Inbox, and completed ones that keep their line.
func countTasks(s Store, st *State) int {
	v := newView(s, nil, time.UTC, nil)
	n := 0
	for _, id := range s.IDs("task") {
		r := s.Get("task", id)
		if !r.Live() {
			continue
		}
		if p := r.Str("project_id"); p != "" && !v.projectLive(p) {
			continue
		}
		if r.Set("completed_at") && st.Printed[id] == "" {
			continue
		}
		n++
	}
	return n
}

// vaultFile reports a path the vault reads: a `.md` file outside hidden
// folders that is not a conflict file.
func vaultFile(rel string) bool {
	if !strings.HasSuffix(rel, ".md") || strings.HasSuffix(rel, ".conflict.md") {
		return false
	}
	for _, part := range strings.Split(rel, "/") {
		if strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

// scanFiles reads every vault file of dir.
func scanFiles(dir string) (map[string][]byte, error) {
	out := map[string][]byte{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if rel != "." && strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() || !vaultFile(rel) {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		out[rel] = b
		return nil
	})
	return out, err
}

// scan reads the folder, finds the files changed since the last write and
// checks the file limits.
func (e *engine) scan() error {
	disk, err := scanFiles(e.o.Dir)
	if err != nil {
		return err
	}
	e.disk = disk
	e.changed = map[string]bool{}
	paths := make([]string, 0, len(disk))
	for p := range disk {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, p := range paths {
		b := disk[p]
		if fs, ok := e.st.Files[p]; ok && fs.Hash == hashOf(b) {
			continue
		}
		if len(b) > MaxFileBytes {
			return &LimitError{Msg: fmt.Sprintf("%s is larger than 1 MB, the limit for a vault file", p)}
		}
		lines := 0
		for _, l := range strings.Split(string(b), "\n") {
			if _, _, _, ok := isTaskLine(l); ok {
				lines++
			}
		}
		if lines > MaxFileLines {
			return &LimitError{Msg: fmt.Sprintf("%s holds %d task lines; the limit for a vault file is %d", p, lines, MaxFileLines)}
		}
		e.changed[p] = true
	}
	return nil
}

// saveBase makes the app the new base, except for what a read-only run left
// pending: the rows of tasks and projects in files not merged keep their old
// base so the next run still sees the file's edits.
func (e *engine) saveBase() {
	next := e.app.Clone()
	if e.o.ReadOnly {
		pendingFile := map[string]bool{}
		for p := range e.changed {
			pendingFile[p] = true
		}
		keep := func(entity, id string) {
			if row, ok := e.base[entity][id]; ok {
				if next[entity] == nil {
					next[entity] = map[string]Row{}
				}
				next[entity][id] = row
			}
		}
		for id, p := range e.st.Printed {
			if pendingFile[p] {
				keep("task", id)
			}
		}
		for p := range e.changed {
			if fs, ok := e.st.Files[p]; ok && fs.Project != "" {
				keep("project", fs.Project)
			}
		}
	}
	e.st.Store = next
}

// Status is what `ot vault status` shows without the server.
type Status struct {
	Device    string   `json:"device"`
	Profile   string   `json:"profile"`
	Server    string   `json:"server"`
	Cursor    int64    `json:"cursor"`
	Changed   []string `json:"changed"`
	Missing   []string `json:"missing"`
	Conflicts []string `json:"conflicts"`
}

// ReadStatus lists the files changed since the last sync and the conflict
// files, reading only the folder.
func ReadStatus(dir string) (*Status, error) {
	st, err := LoadState(dir)
	if err != nil {
		return nil, err
	}
	disk, err := scanFiles(dir)
	if err != nil {
		return nil, err
	}
	out := &Status{Device: st.Device, Profile: st.Profile, Server: st.Server, Cursor: st.Cursor, Changed: []string{}, Missing: []string{}, Conflicts: []string{}}
	for p, b := range disk {
		if fs, ok := st.Files[p]; !ok || fs.Hash != hashOf(b) {
			out.Changed = append(out.Changed, p)
		}
	}
	for p := range st.Files {
		if _, ok := disk[p]; !ok {
			out.Missing = append(out.Missing, p)
		}
	}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && p != dir && strings.HasPrefix(d.Name(), ".") {
			return filepath.SkipDir
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".conflict.md") {
			rel, _ := filepath.Rel(dir, p)
			out.Conflicts = append(out.Conflicts, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(out.Changed)
	sort.Strings(out.Missing)
	sort.Strings(out.Conflicts)
	return out, nil
}

// ErrAlreadyVault and ErrHasNotes are init refusals (exit 2).
var (
	ErrAlreadyVault = errors.New("already a vault")
	ErrHasNotes     = errors.New("holds Markdown files")
)

// CheckInit reports whether dir may become a vault: not already one, and
// without `.md` files unless adopt is set.
func CheckInit(dir string, adopt bool) error {
	if _, err := os.Stat(filepath.Join(dir, StateDir)); err == nil {
		return ErrAlreadyVault
	}
	if adopt {
		return nil
	}
	disk, err := scanFiles(dir)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if len(disk) > 0 {
		return ErrHasNotes
	}
	return nil
}

// stem is a file's name without `.md`.
func stem(p string) string { return strings.TrimSuffix(path.Base(p), ".md") }
