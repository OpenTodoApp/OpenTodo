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

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/timetrack"
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
	// Tools plans routine steps through the agent tool registry; Env reports
	// step availability; Routine delivers Notify me steps (routines-engine).
	Tools   Tools
	Env     EnvFunc
	Routine notify.RoutineSink
	// Query evaluates a filter query for a Find tasks step (internal/filter);
	// QuickAdd reads a line with quick-add syntax for Create tasks.
	Query    QueryFunc
	QuickAdd QuickAddFunc
	// RoutineHook queues a Send a webhook step's delivery; Mail sends Email me.
	RoutineHook RoutineHook
	Mail        RoutineMailer
	// AI runs Ask AI and Summarise steps through the assistant
	// (routines-ai-step D1); nil means no AI step can run.
	AI AI
	// Devices runs an encrypted account's content and AI routines on its
	// devices (routines-ai-step D7); nil keeps them skipped.
	Devices Devices

	db     *sql.DB
	keys   *e2ee.Store
	now    func() time.Time
	limits *limiter
	wake   func()

	mu    sync.Mutex
	kinds map[string]map[string]bool // user -> trigger kinds of their enabled rules
	// changed is set when a rule op is observed: a host ticks the next minute.
	changed bool
	work    sync.Mutex // one pass at a time (the worker and a test route never overlap)
}

// New builds an engine on the tenant database.
func New(db *sql.DB, syncSvc *opsync.Service, log *slog.Logger) *Engine {
	if log == nil {
		log = slog.Default()
	}
	return &Engine{Store: NewStore(db), Sync: syncSvc, Log: log, db: db, keys: e2ee.NewStore(db), now: time.Now,
		limits: newLimiter(), kinds: map[string]map[string]bool{}}
}

// SetWake installs what queueing an event calls: the tenant's jobs signal
// (internal/jobs), so the "rules" job runs at once. Call it before use.
func (e *Engine) SetWake(fn func()) { e.wake = fn }

// SetClock replaces the engine's clock (tests).
func (e *Engine) SetClock(now func() time.Time) { e.now = now; e.Store.SetClock(now) }

func (e *Engine) on(ctx context.Context) bool { return e.Enabled == nil || e.Enabled(ctx) }

// QueryFunc compiles a filter query against the run's rows into a matcher.
type QueryFunc func(ctx context.Context, uid, query string, tasks map[string]opsync.Entity) (func(opsync.Entity) bool, error)

// QuickAddFunc reads a line with quick-add syntax into a create_tasks item
// (its title, due, priority, labels by name, project by name).
type QuickAddFunc func(ctx context.Context, w *world, line string, item map[string]any)

// rule is one decoded rule row: a legacy rule has Actions, a routine Steps.
type rule struct {
	ID           string
	Name         string
	Enabled      bool
	Trigger      ruleval.Trigger
	Condition    ruleval.Condition
	HasCondition bool
	Actions      ruleval.Actions
	Steps        []ruleval.Step
	// AIApply is rule.ai_apply ("auto" asks for Apply without asking) and
	// AIBudget the daily token budget as read (routines-ai-step D4, D11).
	AIApply  string
	AIBudget int64
	// ProjectID is rule.project_id; Shared marks a routine of a shared
	// project, which runs as its run-as person inside the project
	// (routines-shared D3, D4).
	ProjectID string
	Shared    bool
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
		if r, ok := readRule(row); ok {
			out = append(out, r)
		}
	}
	// A shared routine runs for its run-as person only (routines-shared D4).
	return e.forUser(ctx, uid, out)
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
	changed   map[string]string
	encrypted bool
	// projectRows and labelNames serve routine steps (routines-engine).
	projectRows map[string]opsync.Entity
	labelNames  map[string]bool
	// labelName and sectionName name ids for an AI step's material (routines-ai-step).
	labelName   map[string]string
	sectionName map[string]string
	// project is set on a shared routine's world: only that project's
	// tasks and sections (routines-shared D3).
	project string
}

// load reads one user's rows, zone and preferences.
func (e *Engine) load(ctx context.Context, uid string) (*world, error) {
	w := &world{uid: uid, tasks: map[string]opsync.Entity{}, parent: map[string]string{}, labels: map[string]bool{}, sections: map[string]string{},
		projectRows: map[string]opsync.Entity{}, labelNames: map[string]bool{}, labelName: map[string]string{}, sectionName: map[string]string{}}
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
		w.projectRows[str(p, "id")] = p
	}
	labels, err := e.Sync.List(ctx, uid, "label", false)
	if err != nil {
		return nil, err
	}
	for _, l := range labels {
		w.labels[str(l, "id")] = true
		w.labelNames[strings.ToLower(strings.TrimSpace(str(l, "name")))] = true
		w.labelName[str(l, "id")] = str(l, "name")
	}
	sections, err := e.Sync.List(ctx, uid, "section", false)
	if err != nil {
		return nil, err
	}
	for _, s := range sections {
		w.sections[str(s, "id")] = str(s, "project_id")
		if opsync.IsNull(s["deleted_at"]) {
			w.sectionName[str(s, "id")] = str(s, "name")
		}
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

// changedDates is each task's logical date of its newest field change, read
// once per world, for the condition `unchanged` (routines-dynamic-data D5).
func (e *Engine) changedDates(ctx context.Context, w *world) map[string]string {
	if w.changed != nil {
		return w.changed
	}
	w.changed = map[string]string{}
	last, err := e.Sync.LastChanged(ctx, w.uid, "task")
	if err != nil {
		return w.changed
	}
	for id, ms := range last {
		w.changed[id] = ruleval.LogicalDate(ms, w.offset, w.dayStart)
	}
	return w.changed
}

func (w *world) open(id string) bool {
	t, ok := w.tasks[id]
	return ok && opsync.IsNull(t["completed_at"]) && opsync.IsNull(t["deleted_at"])
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
	if json.Unmarshal(t["estimate_minutes"], &est) == nil && !opsync.IsNull(t["estimate_minutes"]) {
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
		Tracked: func(id string) int { return e.trackedMinutes(ctx, w)[id] }, Changed: func(id string) string { return e.changedDates(ctx, w)[id] }}
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
