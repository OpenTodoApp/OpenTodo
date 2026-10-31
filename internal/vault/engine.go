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
	// Owner is the installation running the sync (design D4): a folder another
	// installation owns is refused with an OwnedError before any request, and
	// a successful sync makes Owner the owner with a fresh lease. nil skips the
	// check (tests of the engine alone).
	Owner *Owner
	// TakeOver makes a folder another installation owns this one's: a new
	// device id and a first sync that keeps the server's values (design D5).
	TakeOver bool
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
	tn      *notesState // the linked TaskNotes folder, nil when none
	// retouch are projects whose file is printed again whatever changed.
	retouch map[string]bool
	// takeOver is a first sync after taking the folder over: a line that
	// differs from the server goes to the conflict file (design D5).
	takeOver bool
	// pending are files iCloud has not downloaded yet: only a `.<name>.icloud`
	// placeholder is on disk. They are neither read nor written.
	pending map[string]bool
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
	takeOver := false
	if err := st.CheckOwner(o.Owner, o.Now().In(o.Loc)); err != nil {
		if !o.TakeOver {
			return nil, err
		}
		st.takeOver()
		takeOver = true
	}
	e := &engine{o: o, st: st, takeOver: takeOver, t: o.Transport, rep: &Report{Warnings: []string{}, Events: []Event{}},
		base: st.Store, app: st.Store.Clone(), startCursor: st.Cursor,
		refused: map[string]bool{}, stamped: map[string]int64{}, conf: map[string][]string{},
		bodies: map[string]map[string]map[string]any{}, fresh: map[string]bool{}, retouch: map[string]bool{}}
	e.clk = clock{st: st, now: o.Now}
	if err := e.loadNotes(); err != nil {
		return nil, err
	}
	if err := e.scan(); err != nil {
		return nil, err
	}
	if err := e.scanNotes(); err != nil {
		return nil, err
	}
	if err := e.pull(ctx); err != nil {
		return nil, err
	}
	e.matchNotes()
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
		if err := e.planNotes(true); err != nil {
			return nil, err
		}
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
	if err := e.planNotes(false); err != nil {
		return nil, err
	}
	if err := e.plan(false); err != nil {
		return nil, err
	}
	e.saveBase()
	st.Initialized = true
	if o.Owner != nil {
		owner := *o.Owner
		st.Owner, st.LeaseUntil = &owner, o.Now().Add(Lease).UnixMilli()
	}
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

// scanFiles reads every vault file of dir. fence is the slash path of a
// linked TaskNotes folder below dir, never read as project files ("" none).
func scanFiles(dir, fence string) (map[string][]byte, error) {
	out := map[string][]byte{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if rel != "." && (strings.HasPrefix(d.Name(), ".") || fence != "" && rel == fence) {
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
	fence := ""
	if e.tn != nil {
		fence = e.tn.fence
	}
	disk, err := scanFiles(e.o.Dir, fence)
	if err != nil {
		return err
	}
	e.disk = disk
	e.pending = map[string]bool{}
	for _, p := range sortedKeys(e.st.Files) {
		if _, ok := disk[p]; ok {
			continue
		}
		if _, err := os.Stat(filepath.Join(e.o.Dir, filepath.FromSlash(icloudPlaceholder(p)))); err == nil {
			e.pending[p] = true
			e.rep.event("skipped", p, "", "skipped %s: it is not downloaded to this device yet", p)
		}
	}
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
	// Files not downloaded yet keep their base too: once they arrive, their
	// edits merge against what they were printed from.
	pendingFile := map[string]bool{}
	for p := range e.pending {
		pendingFile[p] = true
	}
	if e.o.ReadOnly {
		for p := range e.changed {
			pendingFile[p] = true
		}
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
	for p := range pendingFile {
		if fs, ok := e.st.Files[p]; ok && fs.Project != "" {
			keep("project", fs.Project)
		}
	}
	if e.o.ReadOnly && e.tn != nil {
		for p := range e.tn.changed {
			if id := e.tn.taskOf[p]; id != "" {
				keep("task", id)
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
	var tnDir, fence string
	if st.TaskNotes != nil {
		tnDir = st.TaskNotes.Dir(dir)
		vabs, _ := filepath.Abs(dir)
		nabs, _ := filepath.Abs(tnDir)
		if rel, err := filepath.Rel(vabs, nabs); err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
			fence = filepath.ToSlash(rel)
		}
	}
	disk, err := scanFiles(dir, fence)
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
	if st.TaskNotes != nil {
		notesStatus(dir, tnDir, fence, st.TaskNotes, out)
	}
	sort.Strings(out.Changed)
	sort.Strings(out.Missing)
	sort.Strings(out.Conflicts)
	return out, nil
}

// notesStatus adds the task notes changed or missing since the last sync,
// named as the sync names them.
func notesStatus(dir, tnDir, fence string, tn *TaskNotesState, out *Status) {
	name := func(p string) string {
		if fence != "" {
			return fence + "/" + p
		}
		return filepath.ToSlash(filepath.Join(tnDir, filepath.FromSlash(p)))
	}
	set, _, err := LoadTNSettings(tnDir)
	if err != nil {
		set = DefaultTNSettings()
	}
	tracked := map[string]bool{}
	for _, p := range tn.Notes {
		tracked[p] = true
	}
	onDisk := map[string]bool{}
	vabs, _ := filepath.Abs(dir)
	root, _ := filepath.Abs(tnDir)
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != root && (strings.HasPrefix(d.Name(), ".") || p == vabs) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".md") || strings.HasSuffix(d.Name(), ".conflict.md") {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		onDisk[rel] = true
		if tn.Hashes[rel] == hashOf(b) {
			return nil
		}
		if tracked[rel] || set.isTaskNote(ParseFront(string(b))) {
			out.Changed = append(out.Changed, name(rel))
		}
		return nil
	})
	for p := range tracked {
		if !onDisk[p] {
			out.Missing = append(out.Missing, name(p))
		}
	}
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
	disk, err := scanFiles(dir, "")
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if len(disk) > 0 {
		return ErrHasNotes
	}
	return nil
}

// icloudPlaceholder is the file iCloud Drive leaves in place of a file it has
// not downloaded yet: `.<name>.icloud` beside it (design, Risks).
func icloudPlaceholder(p string) string {
	return path.Join(path.Dir(p), "."+path.Base(p)+".icloud")
}

// stem is a file's name without `.md`.
func stem(p string) string { return strings.TrimSuffix(path.Base(p), ".md") }
