package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/ruleval"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/timetrack"
)

// DevicePrefix marks the batches a rule writes: rule:<rule-id> (design D5).
const DevicePrefix = opsync.RuleDevicePrefix

// Device is the op device of one rule's batches.
func Device(ruleID string) string { return DevicePrefix + ruleID }

// RuleID returns the rule of a rule: device, "" for any other device.
func RuleID(device string) string {
	if id, ok := strings.CutPrefix(device, DevicePrefix); ok {
		return id
	}
	return ""
}

// ReminderOps recomputes the reminders that follow a task's due or deadline
// (the REST PATCH's rule, injected by internal/httpapi).
type ReminderOps func(ctx context.Context, uid, taskID string, patch map[string]json.RawMessage, ts int64, device string) ([]opsync.Op, error)

// Hook queues the `rule.fired` webhook delivery to the one webhook a rule names.
type Hook func(ctx context.Context, userID, webhookID string, fired Fired) error

// ErrWebhookMissing is the Hook's answer when the rule's webhook is gone.
var ErrWebhookMissing = errors.New("webhook missing")

// Fired describes one applied run for the `rule.fired` webhook.
type Fired struct {
	RuleID   string
	RuleName string // as stored (ciphertext for an encrypted account)
	TaskID   string
	Changes  map[string]opsync.FieldChange
	At       int64
}

// Engine runs a tenant's automation rules: the observer queues events, the
// worker runs them, the scheduler finds the time triggers (design D5).
type Engine struct {
	Store *Store
	Sync  *opsync.Service
	// Enabled is the owner switch (automations.enabled or OPENTODO_AUTOMATIONS).
	Enabled  func(ctx context.Context) bool
	Reminder ReminderOps
	Notify   notify.RuleSink
	Webhook  Hook
	Log      *slog.Logger

	db     *sql.DB
	keys   *e2ee.Store
	now    func() time.Time
	limits *limiter
	wake   chan struct{}

	mu    sync.Mutex
	kinds map[string]map[string]bool // user -> trigger kinds of their enabled rules
	// changed is set when a rule op is observed: a host ticks the next minute.
	changed bool
	work  sync.Mutex                 // one pass at a time (the worker and a test route never overlap)
}

// New builds an engine on the tenant database.
func New(db *sql.DB, syncSvc *opsync.Service, log *slog.Logger) *Engine {
	if log == nil {
		log = slog.Default()
	}
	return &Engine{Store: NewStore(db), Sync: syncSvc, Log: log, db: db, keys: e2ee.NewStore(db), now: time.Now,
		limits: newLimiter(), wake: make(chan struct{}, 1), kinds: map[string]map[string]bool{}}
}

// SetClock replaces the engine's clock (tests).
func (e *Engine) SetClock(now func() time.Time) { e.now = now; e.Store.SetClock(now) }

func (e *Engine) on(ctx context.Context) bool { return e.Enabled == nil || e.Enabled(ctx) }

// rule is one decoded rule row.
type rule struct {
	ID        string
	Name      string
	Enabled   bool
	Trigger   ruleval.Trigger
	Condition ruleval.Condition
	Actions   ruleval.Actions
}

func str(e opsync.Entity, f string) string {
	var s string
	_ = json.Unmarshal(e[f], &s)
	return s
}

func boolOf(e opsync.Entity, f string) bool { return string(e[f]) == "true" }

// loadRules decodes a user's live rules; a rule this server cannot read (made
// by a newer version) is left out.
func (e *Engine) loadRules(ctx context.Context, uid string) ([]rule, error) {
	rows, err := e.Sync.List(ctx, uid, "rule", false)
	if err != nil {
		return nil, err
	}
	out := make([]rule, 0, len(rows))
	for _, row := range rows {
		r := rule{ID: str(row, "id"), Name: str(row, "name"), Enabled: boolOf(row, "enabled")}
		var perr error
		if r.Trigger, perr = ruleval.ParseTrigger(row["trigger"]); perr != nil {
			continue
		}
		if !isNull(row["condition"]) {
			if r.Condition, perr = ruleval.ParseCondition(row["condition"]); perr != nil {
				continue
			}
		}
		if r.Actions, perr = ruleval.ParseActions(row["actions"]); perr != nil {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// ruleKinds is the cached set of trigger kinds of a user's enabled rules.
func (e *Engine) ruleKinds(ctx context.Context, uid string) map[string]bool {
	e.mu.Lock()
	k, ok := e.kinds[uid]
	e.mu.Unlock()
	if ok {
		return k
	}
	k = map[string]bool{}
	list, err := e.loadRules(ctx, uid)
	if err != nil {
		e.Log.Error("rules: load rules", "err", err)
		return k
	}
	for _, r := range list {
		if r.Enabled {
			k[r.Trigger.Kind] = true
		}
	}
	e.mu.Lock()
	e.kinds[uid] = k
	e.mu.Unlock()
	return k
}

// forget drops a user's cached rule kinds (a rule op was observed).
func (e *Engine) forget(uid string) {
	e.mu.Lock()
	delete(e.kinds, uid)
	e.changed = true
	e.mu.Unlock()
}

// world is what evaluating and planning rules for one user reads.
type world struct {
	uid       string
	today     string
	weekStart time.Weekday
	offset    int
	dayStart  string
	tasks     map[string]opsync.Entity
	parent    map[string]string
	labels    map[string]bool
	sections  map[string]string
	shared    map[string]bool
	tracked   map[string]int
	encrypted bool
}

// load reads one user's rows, zone and preferences.
func (e *Engine) load(ctx context.Context, uid string) (*world, error) {
	w := &world{uid: uid, tasks: map[string]opsync.Entity{}, parent: map[string]string{}, labels: map[string]bool{}, sections: map[string]string{}}
	if found, err := settings.New(e.db).Get(ctx, "tz_offset:"+uid, &w.offset); err != nil || !found {
		w.offset = 0
	}
	if prefs, err := e.Sync.Get(ctx, uid, "user_prefs", "me"); err == nil && prefs != nil {
		w.dayStart = str(prefs, "day_start")
		switch str(prefs, "week_start") {
		case "sun":
			w.weekStart = time.Sunday
		case "sat":
			w.weekStart = time.Saturday
		default:
			w.weekStart = time.Monday
		}
	} else {
		w.weekStart = time.Monday
	}
	w.today = ruleval.LogicalDate(e.now().UnixMilli(), w.offset, w.dayStart)
	tasks, err := e.Sync.List(ctx, uid, "task", false)
	if err != nil {
		return nil, err
	}
	for _, t := range tasks {
		w.tasks[str(t, "id")] = t
	}
	projects, err := e.Sync.List(ctx, uid, "project", false)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		w.parent[str(p, "id")] = str(p, "parent_id")
	}
	labels, err := e.Sync.List(ctx, uid, "label", false)
	if err != nil {
		return nil, err
	}
	for _, l := range labels {
		w.labels[str(l, "id")] = true
	}
	sections, err := e.Sync.List(ctx, uid, "section", false)
	if err != nil {
		return nil, err
	}
	for _, s := range sections {
		w.sections[str(s, "id")] = str(s, "project_id")
	}
	shared, err := e.Sync.SharedProjects(ctx, uid)
	if err != nil {
		return nil, err
	}
	w.shared = map[string]bool{}
	for id := range shared {
		w.shared[id] = true
	}
	w.encrypted, _ = e.keys.Enabled(ctx, uid)
	return w, nil
}

// trackedMinutes loads the time entries once, when a condition reads them.
func (e *Engine) trackedMinutes(ctx context.Context, w *world) map[string]int {
	if w.tracked != nil {
		return w.tracked
	}
	w.tracked = map[string]int{}
	rows, err := e.Sync.List(ctx, w.uid, "time_entry", false)
	if err != nil {
		return w.tracked
	}
	entries := make([]timetrack.Entry, 0, len(rows))
	for _, r := range rows {
		entries = append(entries, timetrack.FromRow(r))
	}
	w.tracked = timetrack.TotalsByTask(entries, e.now().UnixMilli())
	return w.tracked
}

func (w *world) open(id string) bool {
	t, ok := w.tasks[id]
	return ok && isNull(t["completed_at"]) && isNull(t["deleted_at"])
}

// matchTask reads a task row for the matcher.
func (w *world) matchTask(t opsync.Entity) ruleval.Task {
	mt := ruleval.Task{ID: str(t, "id"), ProjectID: str(t, "project_id"), SectionID: str(t, "section_id"), Labels: listOf(t["labels"]),
		Deadline: str(t, "deadline"), Start: str(t, "start"), Evening: boolOf(t, "evening"), BlockedBy: listOf(t["blocked_by"]),
		AssigneeID: str(t, "assignee_id"), OriginKind: ruleval.OriginKindOf(t["origin"]), Habit: boolOf(t, "habit")}
	_ = json.Unmarshal(t["priority"], &mt.Priority)
	if d := dueOf(t["due"]); d != nil {
		mt.DueDate = d.Date
		if d.TZ != nil && d.Time != nil {
			mt.DueDate = zonedDate(d, w.offset)
		}
	}
	var est int
	if json.Unmarshal(t["estimate_minutes"], &est) == nil && !isNull(t["estimate_minutes"]) {
		mt.Estimate = &est
	}
	return mt
}

// zonedDate is a zoned due's date in the user's offset.
func zonedDate(d *dueValue, offset int) string {
	loc, err := time.LoadLocation(*d.TZ)
	if err != nil {
		return d.Date
	}
	at, err := time.ParseInLocation("2006-01-02 15:04", d.Date+" "+*d.Time, loc)
	if err != nil {
		return d.Date
	}
	return at.In(time.FixedZone("", offset*60)).Format("2006-01-02")
}

// matches evaluates a rule's condition on a task.
func (e *Engine) matches(ctx context.Context, w *world, r *rule, t opsync.Entity) bool {
	c := ruleval.Context{UserID: w.uid, Today: w.today, Parent: w.parent, Open: w.open,
		Tracked: func(id string) int { return e.trackedMinutes(ctx, w)[id] }}
	return ruleval.Matches(&r.Condition, w.matchTask(t), c)
}

func (w *world) planContext(nowMs int64) PlanContext {
	return PlanContext{Today: w.today, NowMs: nowMs, UserID: w.uid, WeekStart: w.weekStart,
		LabelLive:      func(id string) bool { return w.labels[id] },
		SectionProject: func(id string) string { return w.sections[id] },
		ProjectShared:  func(id string) bool { return w.shared[id] },
		ProjectLive:    func(id string) bool { _, ok := w.parent[id]; return ok },
	}
}

// ErrNotFound is DryRun's answer for a rule or task the user cannot see.
var ErrNotFound = errors.New("not found")

// DryRun is what a rule would do to one task now (POST /api/v1/rules/{id}/test).
type DryRun struct {
	Matches bool                       `json:"matches"`
	Changes map[string]json.RawMessage `json:"changes"`
	Skipped []string                   `json:"skipped"`
}

// Test evaluates a rule's condition and plans its actions on one task, writing
// nothing.
func (e *Engine) Test(ctx context.Context, uid, ruleID, taskID string) (DryRun, error) {
	list, err := e.loadRules(ctx, uid)
	if err != nil {
		return DryRun{}, err
	}
	var r *rule
	for i := range list {
		if list[i].ID == ruleID {
			r = &list[i]
		}
	}
	if r == nil {
		return DryRun{}, ErrNotFound
	}
	w, err := e.load(ctx, uid)
	if err != nil {
		return DryRun{}, err
	}
	t, ok := w.tasks[taskID]
	if !ok {
		return DryRun{}, ErrNotFound
	}
	out := DryRun{Changes: map[string]json.RawMessage{}, Skipped: []string{}}
	if !e.matches(ctx, w, r, t) {
		return out, nil
	}
	out.Matches = true
	p := Plan(r.Actions, t, w.planContext(e.now().UnixMilli()))
	out.Changes = p.Patch
	if p.Skipped != nil {
		out.Skipped = p.Skipped
	}
	return out, nil
}
