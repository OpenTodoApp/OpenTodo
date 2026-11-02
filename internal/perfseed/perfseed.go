// Package perfseed builds the deterministic 10,000-task account the
// performance budgets are measured on (OpenSpec change performance-10k,
// design D1). Every row is written through the op log (sync.ApplyStrict,
// device "perfseed"), so a device signing in receives the account by ordinary
// sync pulls. It is linked into cmd/perfseed only; a test keeps it out of the
// server binary.
//
// The same seed and the same Now give the same entity ids, field values and
// op ids. Account ids come from the auth service and are random, so the
// summary names them for the benchmarks.
package perfseed

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"sort"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Device is the device id of every op the fixture writes.
const Device = "perfseed"

// The fixture's composition (the proposal's list). Sizes are fixed so the
// budgets compare like with like; Scale multiplies the task-shaped counts for
// the reported-only 50,000-task run.
const (
	Projects      = 60
	SharedCount   = 3
	BigOpen       = 2000
	Sections      = 150
	Labels        = 40
	Tasks         = 10000
	OpenTasks     = 6000
	DoneTasks     = 3500
	TrashedTasks  = 500
	Subtasks      = 1500
	WithNotes     = 2000
	Dated         = 3000
	Recurring     = 400
	Reminders     = 600
	Comments      = 2000
	TimeEntries   = 1000
	Views         = 8
	SearchHits    = 37
	SearchTerm    = "zephyr"
	OwnerEmail    = "perf@example.com"
	MemberEmail   = "member@example.com"
	Password      = "perf-password-10k"
	Passphrase    = "perf passphrase 10k"
	DefaultSeed   = 10_000
	batchEntities = 250
	maxBatchOps   = 600 // under the server's 1,000 per batch, with room for the completed_by op ApplyStrict adds per completed task
)

// Options configure Run.
type Options struct {
	Seed uint64
	// Now anchors every date of the fixture (due dates around today, creation
	// and completion times before it). Zero is time.Now.
	Now time.Time
	// Encrypted turns on end-to-end encryption for the account: content fields
	// of its personal scope are sealed with a key derived from Passphrase.
	// Shared projects keep plaintext, as on a real encrypted account.
	Encrypted bool
	// Scale multiplies the task-shaped counts (tasks, subtasks, notes, dates,
	// comments, time entries); 0 or 1 is the 10,000-task account.
	Scale int
}

// Summary is what Run writes next to the data: the counts and the ids the
// benchmarks use.
type Summary struct {
	Seed        uint64 `json:"seed"`
	Today       string `json:"today"`
	Encrypted   bool   `json:"encrypted"`
	OwnerEmail  string `json:"ownerEmail"`
	MemberEmail string `json:"memberEmail"`
	Password    string `json:"password"`
	Passphrase  string `json:"passphrase,omitempty"`
	// Token is a full API token of the owner, for the server benchmarks.
	Token      string   `json:"token"`
	OwnerID    string   `json:"ownerId"`
	MemberID   string   `json:"memberId"`
	BigProject string   `json:"bigProject"`
	BigName    string   `json:"bigProjectName"`
	Shared     []string `json:"sharedProjects"`
	SearchTerm string   `json:"searchTerm"`
	SearchHits int      `json:"searchHits"`
	View       string   `json:"view"`
	ViewQuery  string   `json:"viewQuery"`
	SampleTask string   `json:"sampleTask"`
	// PlainTasks are open top-level tasks of the big project without a series
	// or subtasks: completing one is a single click.
	PlainTasks []string       `json:"plainTasks"`
	TodayTasks int            `json:"todayTasks"`
	Counts     map[string]int `json:"counts"`
	Ops        int            `json:"ops"`
}

// Run creates the account in dataDir, which must hold no account yet, and
// returns its summary.
func Run(ctx context.Context, dataDir string, o Options) (Summary, error) {
	db, err := store.Open(dataDir)
	if err != nil {
		return Summary{}, err
	}
	defer db.Close()
	return Seed(ctx, db, o)
}

// Seed is Run on an open, migrated database.
func Seed(ctx context.Context, db *sql.DB, o Options) (Summary, error) {
	if o.Seed == 0 {
		o.Seed = DefaultSeed
	}
	if o.Scale < 1 {
		o.Scale = 1
	}
	if o.Now.IsZero() {
		o.Now = time.Now()
	}
	a := auth.NewService(db, time.Hour, false)
	if n, err := a.UserCount(ctx); err != nil || n > 0 {
		return Summary{}, errors.Join(err, errors.New("perfseed: the data directory already has accounts"))
	}
	owner, err := a.Register(ctx, OwnerEmail, "Perf Owner", Password, "")
	if err != nil {
		return Summary{}, fmt.Errorf("owner: %w", err)
	}
	// The second member of the shared projects, invited as on a real server.
	_, secret, err := a.CreateInvitation(ctx, owner, MemberEmail, 0)
	if err != nil {
		return Summary{}, fmt.Errorf("invitation: %w", err)
	}
	member, err := a.Register(ctx, MemberEmail, "Perf Member", Password, secret)
	if err != nil {
		return Summary{}, fmt.Errorf("member: %w", err)
	}
	_, token, err := a.CreateTokenScoped(ctx, owner.ID, "perf benchmark", "full")
	if err != nil {
		return Summary{}, fmt.Errorf("token: %w", err)
	}
	svc := opsync.NewService(db)
	// A seeded history is not a person posting: no comment rate limit.
	svc.SetCommentRateLimit(0, 0)
	// A seeded generator on purpose: the same seed must build the same account.
	rng := rand.New(rand.NewPCG(o.Seed, o.Seed^0x9e3779b97f4a7c15)) // #nosec G404 -- test data from a fixed seed, never a secret
	g := &gen{ctx: ctx, sync: svc, rng: rng,
		o: o, owner: owner.ID, member: member.ID, counts: map[string]int{}}
	u := o.Now.UTC()
	g.today = time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
	// Op timestamps run up to an hour before now, one per batch.
	g.ts = o.Now.Add(-time.Hour).UnixMilli() - 1_000_000
	if o.Encrypted {
		if err := g.encryption(e2ee.NewStore(db)); err != nil {
			return Summary{}, err
		}
	}
	if err := g.run(); err != nil {
		return Summary{}, err
	}
	s := Summary{Seed: o.Seed, Today: g.today.Format("2006-01-02"), Encrypted: o.Encrypted, OwnerEmail: OwnerEmail, MemberEmail: MemberEmail,
		Password: Password, OwnerID: owner.ID, MemberID: member.ID, BigProject: g.big, BigName: g.bigName, Shared: g.shared,
		SearchTerm: SearchTerm, SearchHits: g.hits, View: g.view, ViewQuery: viewQuery, SampleTask: g.sample, PlainTasks: g.plain, TodayTasks: g.todayTasks,
		Counts: g.counts, Ops: g.ops, Token: token}
	if o.Encrypted {
		s.Passphrase = Passphrase
	}
	return s, nil
}

// gen is one fixture run.
type gen struct {
	ctx           context.Context
	sync          *opsync.Service
	rng           *rand.Rand
	o             Options
	owner, member string
	today         time.Time
	ts            int64
	key           []byte // the account key when encrypted
	counts        map[string]int
	ops           int
	opSeq         int
	pending       []opsync.Op
	pendingN      int
	pendingAs     string

	labels     []string
	projects   []string
	shared     []string
	isShared   map[string]bool
	sharedTask map[string]bool
	sections   map[string][]string // project -> sections
	big        string
	bigName    string
	view       string
	sample     string
	plain      []string
	hits       int
	todayTasks int
}

// id is the entity id of the n-th entity of a kind: name-based, so the same
// seed gives the same ids.
func (g *gen) id(kind string, n int) string {
	return ids.NameID("perfseed", fmt.Sprintf("%d/%s/%d", g.o.Seed, kind, n))
}

// put queues one entity's fields, as user; the queue is applied in batches of
// batchEntities entities per ApplyStrict call, the size of a large import page.
func (g *gen) put(user, entity, id string, fields map[string]any) error {
	if (g.pendingAs != user || len(g.pending)+len(fields) > maxBatchOps) && len(g.pending) > 0 {
		if err := g.flush(); err != nil {
			return err
		}
	}
	g.pendingAs = user
	g.ts++
	keys := make([]string, 0, len(fields))
	for f := range fields {
		keys = append(keys, f)
	}
	sort.Strings(keys)
	for _, f := range keys {
		v := fields[f]
		if s, ok := v.(string); ok && g.key != nil && e2ee.IsContentField(entity, f) && !g.inShared(entity, id, fields) {
			sealed, err := g.seal(entity, id, f, s)
			if err != nil {
				return err
			}
			v = sealed
		}
		raw, err := json.Marshal(v)
		if err != nil {
			return err
		}
		g.opSeq++
		g.pending = append(g.pending, opsync.Op{ID: g.id("op", g.opSeq), Entity: entity, EntityID: id, Field: f, Value: raw, TS: g.ts, Device: Device})
	}
	g.pendingN++
	g.counts[entity]++
	if g.pendingN >= batchEntities {
		return g.flush()
	}
	return nil
}

// inShared reports whether an entity being written lives in a shared project,
// whose content stays plaintext on an encrypted account.
func (g *gen) inShared(entity, id string, fields map[string]any) bool {
	switch entity {
	case "project":
		return g.isShared[id]
	case "task", "section":
		p, _ := fields["project_id"].(string)
		return g.isShared[p]
	case "comment", "reminder", "time_entry":
		t, _ := fields["task_id"].(string)
		return g.sharedTask[t]
	}
	return false
}

func (g *gen) flush() error {
	if len(g.pending) == 0 {
		return nil
	}
	if _, err := g.sync.ApplyStrict(g.ctx, g.pendingAs, g.pending); err != nil {
		return fmt.Errorf("perfseed: apply: %w", err)
	}
	g.ops += len(g.pending)
	g.pending, g.pendingN = nil, 0
	return nil
}

// pick returns n distinct indexes of [0, total), in the generator's order.
func (g *gen) pick(total, n int) []int {
	return g.rng.Perm(total)[:n]
}

func (g *gen) words(n int) string {
	b := make([]string, n)
	for i := range b {
		b[i] = vocabulary[g.rng.IntN(len(vocabulary))]
	}
	return strings.Join(b, " ")
}

// text is about n characters of prose, in sentences.
func (g *gen) text(n int) string {
	var b strings.Builder
	for b.Len() < n {
		s := g.words(5 + g.rng.IntN(8))
		b.WriteString(strings.ToUpper(s[:1]) + s[1:] + ". ")
	}
	return strings.TrimSpace(b.String())
}

func (g *gen) day(offset int) string { return g.today.AddDate(0, 0, offset).Format("2006-01-02") }

// ago is a Unix ms time d before the fixture's now.
func (g *gen) ago(d time.Duration) int64 { return g.o.Now.Add(-d).UnixMilli() }

var vocabulary = strings.Fields(`plan review draft call email order fix update check write send book pay renew clean
prepare share sort archive measure paint repair buy return schedule test ship deploy refactor document sketch
kitchen garden budget invoice report slides garage server backup laptop printer passport insurance dentist meeting
client project release roadmap ticket feature library migration window door shelf bike car tax receipt contract
quarterly weekly monthly urgent quick small large new old final first second next shared personal team family`)
