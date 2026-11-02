package vault

// Shared sync vectors (OpenSpec change obsidian-vault-sync, design D2): every
// case below runs the engine against a scripted server and records, step by
// step, what went in (the files written or removed, the ops the server gained,
// the options) and what came out (the ops pushed, every file of the folder,
// the report and the state). The Obsidian plugin's TypeScript engine replays
// the same files (obsidian/src/vault/engine.test.ts) and must produce the same
// outputs. `go test ./internal/vault -run TestSyncVectors -update` rewrites
// testdata/sync/; without -update the committed files are checked.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

var updateVectors = flag.Bool("update", false, "rewrite testdata/sync")

// vxStep is one sync of a case, as the vector file holds it.
type vxStep struct {
	Name string `json:"name"`
	// Now is the time of the sync (Unix ms); the server answers with it.
	Now int64 `json:"now"`
	// Init runs the sync as `ot vault init` does, with a new state.
	Init bool `json:"init,omitempty"`
	// Files are written (a string) or removed (null) before the sync.
	Files map[string]*string `json:"files,omitempty"`
	// Server are ops the server's log gains before the sync.
	Server     []Op   `json:"server,omitempty"`
	Generation string `json:"generation,omitempty"`
	// Reset empties the server's log first: it was restored from a backup.
	Reset    bool   `json:"reset,omitempty"`
	ReadOnly bool   `json:"readOnly,omitempty"`
	DryRun   bool   `json:"dryRun,omitempty"`
	TakeOver bool   `json:"takeOver,omitempty"`
	Owner    *Owner `json:"owner,omitempty"`
	// Device is the device id a new or taken-over vault gets.
	Device string `json:"device,omitempty"`
	Want   vxWant `json:"want"`
}

type vxWant struct {
	// Error is "limit" or "owned" for a refused sync, with its message.
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
	Pushed  []Op   `json:"pushed"`
	// Files is every file of the folder outside .opentodo/ after the sync.
	Files  map[string]string `json:"files"`
	Report *Report           `json:"report,omitempty"`
	State  json.RawMessage   `json:"state,omitempty"`
}

type vxCase struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	// Loc is the time zone of the machine (an IANA name).
	Loc  string `json:"loc"`
	User string `json:"user"`
	// Encrypted runs with the test crypter of these vectors: a value seals as
	// enc:v1:<entity id>:<base64url of the plaintext> and opens only with its
	// own entity id (the real envelope is pinned by e2ee's own vectors).
	Encrypted bool     `json:"encrypted,omitempty"`
	Shared    []string `json:"shared,omitempty"`
	Steps     []vxStep `json:"steps"`
}

// vxServer is the scripted server: it serves its log from the cursor, appends
// what it receives and answers at the step's time.
type vxServer struct {
	log      []Op
	gen      string
	shared   []string
	now      int64
	received []Op
}

func (s *vxServer) Exchange(_ context.Context, req Request) (Reply, error) {
	s.received = append(s.received, req.Ops...)
	rep := Reply{Ops: []Op{}, ServerTime: s.now, Generation: s.gen, Cursor: int64(len(s.log))}
	if req.Cursor < int64(len(s.log)) {
		rep.Ops = append(rep.Ops, s.log[req.Cursor:]...)
	}
	for _, p := range s.shared {
		rep.Memberships = append(rep.Memberships, Membership{ProjectID: p})
	}
	s.log = append(s.log, req.Ops...)
	if len(req.Ops) > 0 {
		rep.Cursor = int64(len(s.log))
	}
	return rep, nil
}

// vxRec records one case while it runs.
type vxRec struct {
	t      *testing.T
	c      *vxCase
	dir    string
	srv    *vxServer
	now    int64
	ts     int64 // the clock of the next server op
	queued []Op
	last   map[string]string // the folder after the previous step
}

var vxStart = time.Date(2026, 11, 2, 9, 0, 0, 0, time.UTC).UnixMilli()

func newRec(t *testing.T, c *vxCase) *vxRec {
	return &vxRec{t: t, c: c, dir: t.TempDir(), srv: &vxServer{shared: c.Shared}, now: vxStart, ts: vxStart - 3600_000, last: map[string]string{}}
}

// put queues the ops of one entity, a field per op in name order, for the
// next step's server log; values are marshalled as Go does.
func (r *vxRec) put(entity, id string, fields map[string]any) {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	r.ts++
	for _, k := range keys {
		raw, err := json.Marshal(fields[k])
		if err != nil {
			r.t.Fatal(err)
		}
		r.queued = append(r.queued, Op{ID: fmt.Sprintf("app-%s-%s-%d", id, k, r.ts), Entity: entity, EntityID: id, Field: k, Value: raw, TS: r.ts, Device: "app"})
	}
}

func (r *vxRec) project(id, name string, extra map[string]any) {
	f := map[string]any{"name": name, "color": "#22c55e", "archived": false, "parent_id": nil, "position": 1000, "deleted_at": nil, "created_at": vxStart - 7200_000}
	for k, v := range extra {
		f[k] = v
	}
	r.put("project", id, f)
}

func (r *vxRec) task(id, title, project string, extra map[string]any) {
	f := map[string]any{"title": title, "project_id": nullable(project), "priority": 4, "position": 1000, "deleted_at": nil, "completed_at": nil, "labels": []string{}, "created_at": vxStart - 7200_000}
	for k, v := range extra {
		f[k] = v
	}
	r.put("task", id, f)
}

func (r *vxRec) path(p string) string { return filepath.Join(r.dir, filepath.FromSlash(p)) }

func (r *vxRec) read(p string) string {
	r.t.Helper()
	b, err := os.ReadFile(r.path(p))
	if err != nil {
		r.t.Fatal(err)
	}
	return string(b)
}

func (r *vxRec) write(p, text string) {
	r.t.Helper()
	if err := os.MkdirAll(filepath.Dir(r.path(p)), 0o755); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(r.path(p), []byte(text), 0o644); err != nil {
		r.t.Fatal(err)
	}
}

func (r *vxRec) replace(p, old, new string) {
	r.t.Helper()
	text := r.read(p)
	if !strings.Contains(text, old) {
		r.t.Fatalf("%s: %s does not hold %q:\n%s", r.c.Name, p, old, text)
	}
	r.write(p, strings.Replace(text, old, new, 1))
}

func (r *vxRec) remove(p string) {
	r.t.Helper()
	if err := os.Remove(r.path(p)); err != nil {
		r.t.Fatal(err)
	}
}

// snapshot is every file of the folder outside .opentodo/.
func (r *vxRec) snapshot() map[string]string {
	out := map[string]string{}
	_ = filepath.WalkDir(r.dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(r.dir, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if rel == StateDir {
				return filepath.SkipDir
			}
			return nil
		}
		b, _ := os.ReadFile(p)
		out[rel] = string(b)
		return nil
	})
	return out
}

// vxOpts are the options of one step.
type vxOpts struct {
	name                   string
	init, readOnly, dryRun bool
	takeOver               bool
	owner                  *Owner
	device, generation     string
	reset                  bool
	advance                time.Duration
}

// sync runs one step and records it.
func (r *vxRec) sync(o vxOpts) *vxStep {
	r.t.Helper()
	if o.advance == 0 {
		o.advance = time.Minute
	}
	r.now += o.advance.Milliseconds()
	step := vxStep{Name: o.name, Now: r.now, Init: o.init, Server: r.queued, Generation: o.generation, Reset: o.reset, ReadOnly: o.readOnly, DryRun: o.dryRun, TakeOver: o.takeOver, Owner: o.owner, Device: o.device}
	// Server ops queued after this step are stamped after its sync's ops.
	defer func() { r.ts = r.now + 10_000 }()
	cur := r.snapshot()
	for p, text := range cur {
		if prev, ok := r.last[p]; !ok || prev != text {
			if step.Files == nil {
				step.Files = map[string]*string{}
			}
			t := text
			step.Files[p] = &t
		}
	}
	for p := range r.last {
		if _, ok := cur[p]; !ok {
			if step.Files == nil {
				step.Files = map[string]*string{}
			}
			step.Files[p] = nil
		}
	}
	if o.reset {
		r.srv.log = nil
	}
	r.srv.log = append(r.srv.log, r.queued...)
	r.queued = nil
	if o.generation != "" {
		r.srv.gen = o.generation
	}
	r.srv.now = r.now
	r.srv.received = nil
	if o.device != "" {
		prev := newDevice
		newDevice = func() string { return o.device }
		defer func() { newDevice = prev }()
	}
	loc, err := time.LoadLocation(r.c.Loc)
	if err != nil {
		r.t.Fatal(err)
	}
	opts := Options{Dir: r.dir, Transport: r.srv, UserID: r.c.User, Loc: loc, ReadOnly: o.readOnly, DryRun: o.dryRun, TakeOver: o.takeOver, Owner: o.owner,
		Now: func() time.Time { return time.UnixMilli(r.now) }}
	if r.c.Encrypted {
		opts.Crypter = fakeCrypter{}
	}
	if o.init {
		opts.State = NewState("default", "https://todo.example.com")
	}
	rep, err := Sync(context.Background(), opts)
	var le *LimitError
	var oe *OwnedError
	switch {
	case err == nil:
		step.Want.Report = rep
	case errors.As(err, &le):
		step.Want.Error, step.Want.Message = "limit", le.Msg
	case errors.As(err, &oe):
		step.Want.Error, step.Want.Message = "owned", oe.Error()
	default:
		r.t.Fatalf("%s/%s: %v", r.c.Name, o.name, err)
	}
	step.Want.Pushed = append([]Op{}, r.srv.received...)
	step.Want.Files = r.snapshot()
	if b, err := os.ReadFile(StatePath(r.dir)); err == nil {
		step.Want.State = b
	}
	r.last = step.Want.Files
	r.c.Steps = append(r.c.Steps, step)
	return &r.c.Steps[len(r.c.Steps)-1]
}

// vxPhone is the owner a phone's plugin writes.
var vxPhone = &Owner{Kind: "obsidian", Install: "phone-install", Label: "Obsidian on iPhone"}
var vxLaptop = &Owner{Kind: "cli", Install: "laptop-install", Label: "laptop"}

func TestSyncVectors(t *testing.T) {
	for _, def := range vxCases {
		c := &vxCase{Name: def.name, Description: def.desc, Loc: "UTC", User: "user-1"}
		if def.setup != nil {
			def.setup(c)
		}
		r := newRec(t, c)
		def.run(r)
		raw, err := json.MarshalIndent(c, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		raw = append(raw, '\n')
		p := filepath.Join("testdata", "sync", c.Name+".json")
		if *updateVectors {
			if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(p, raw, 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		want, err := os.ReadFile(p)
		if err != nil || !bytes.Equal(want, raw) {
			t.Errorf("%s differs from the engine (run go test ./internal/vault -run TestSyncVectors -update, then the plugin's engine tests)", p)
		}
	}
	if *updateVectors {
		return
	}
	// No stale case files.
	entries, _ := os.ReadDir(filepath.Join("testdata", "sync"))
	names := map[string]bool{}
	for _, d := range vxCases {
		names[d.name+".json"] = true
	}
	for _, e := range entries {
		if !names[e.Name()] {
			t.Errorf("testdata/sync/%s has no case", e.Name())
		}
	}
	if len(entries) < 20 {
		t.Errorf("only %d vector files", len(entries))
	}
}
