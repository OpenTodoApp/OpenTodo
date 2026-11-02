package rules

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The use-case suite of OpenSpec change routines-dynamic-data (design D12):
// every case of web/src/lib/rules/usecases.json runs through a real run
// against seeded data and must write exactly what it expects.

type ucTask struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Due         string   `json:"due"`
	CompletedOn string   `json:"completed_on"`
	Labels      []string `json:"labels"`
	Priority    int      `json:"priority"`
	ProjectID   string   `json:"project_id"`
	ParentID    string   `json:"parent_id"`
	Description string   `json:"description"`
	// ChangedOn writes the task on that day (its last change), before any newer write.
	ChangedOn string `json:"changed_on"`
	// Deleted puts the task in the Trash (routines-find-scope).
	Deleted bool `json:"deleted"`
}

type ucSeed struct {
	Tasks    []ucTask `json:"tasks"`
	Projects []struct {
		ID, Name, Description string
		// Archived and Deleted: an archived project, a project in the Trash (routines-find-scope).
		Archived, Deleted bool
	} `json:"projects"`
	Labels []struct{ ID, Name string }        `json:"labels"`
	Views  []struct{ ID, Name, Query string } `json:"views"`
	// Entries are the user's time entries (routines-ai-step: tracked time, timers).
	Entries []struct {
		ID      string `json:"id"`
		TaskID  string `json:"task_id"`
		Started string `json:"started"`
		Ended   string `json:"ended"`
	} `json:"entries"`
}

type ucExpect struct {
	Outcome  string                    `json:"outcome"`
	Comments map[string][]string       `json:"comments"`
	Changed  map[string]map[string]any `json:"changed"`
	Created  []map[string]any          `json:"created"`
	Appended map[string][]string       `json:"appended"`
	Notices  []string                  `json:"notices"`
	Webhooks []struct {
		Text  *string  `json:"text"`
		Tasks []string `json:"tasks"`
	} `json:"webhooks"`
	Emails []struct{ Subject, Text string } `json:"emails"`
	Focus  string                           `json:"focus"`
	Timer  string                           `json:"timer"`
	// CreatedCount checks only how many tasks were created (a template's tasks).
	CreatedCount int `json:"created_count"`
	// Compared when a case states them (routines-ai-step: every step kind).
	ChangedProjects map[string]map[string]any `json:"changed_projects"`
	CreatedProjects []string                  `json:"created_projects"`
	Sections        []string                  `json:"sections"`
	LabelsCreated   []string                  `json:"labels_created"`
	Favourites      *string                   `json:"favourites"`
}

type ucCase struct {
	ucSeed
	Row       int             `json:"row"`
	Editor    bool            `json:"editor"`
	Name      string          `json:"name"`
	Seed      string          `json:"seed"`
	Trigger   json.RawMessage `json:"trigger"`
	Condition json.RawMessage `json:"condition"`
	RunOn     string          `json:"run_on"`
	Steps     json.RawMessage `json:"steps"`
	Webhooks  []string        `json:"webhooks"`
	Email     bool            `json:"email"`
	// AI is the model's answers in call order; such a case runs with Apply
	// without asking on (routines-ai-step).
	AI     []AIAnswer `json:"ai"`
	Expect ucExpect   `json:"expect"`
}

// ucAI answers a case's AI steps in order.
type ucAI struct{ answers []AIAnswer }

func (a *ucAI) Complete(context.Context, string, AICall) (AIAnswer, error) {
	if len(a.answers) == 0 {
		return AIAnswer{Input: 100, Output: 20}, nil
	}
	ans := a.answers[0]
	a.answers = a.answers[1:]
	ans.Input, ans.Output = 100, 20
	return ans, nil
}

func (a *ucAI) Estimate(AICall) int64 { return 500 }

type ucFile struct {
	Seeds map[string]ucSeed `json:"seeds"`
	Cases []ucCase          `json:"cases"`
}

func loadUseCases(t *testing.T) ucFile {
	t.Helper()
	raw, err := os.ReadFile("../../web/src/lib/rules/usecases.json")
	if err != nil {
		t.Fatal(err)
	}
	var f ucFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

// ucState is what a case compares: the task fields a routine writes.
func ucTaskState(e opsync.Entity) map[string]any {
	due := ""
	if d := dueOf(e["due"]); d != nil {
		due = d.Date
	}
	var labels []string
	_ = json.Unmarshal(e["labels"], &labels)
	slices.Sort(labels)
	var prio float64
	_ = json.Unmarshal(e["priority"], &prio)
	return map[string]any{"title": strOf(e["title"]), "due": due, "priority": prio, "labels": strings.Join(labels, ","), "project_id": strOf(e["project_id"]),
		"parent_id": strOf(e["parent_id"]), "description": strOf(e["description"]),
		"completed": !opsync.IsNull(e["completed_at"]), "deleted": !opsync.IsNull(e["deleted_at"])}
}

func appendedOf(e opsync.Entity) []string {
	var out []string
	for f, v := range e {
		if _, ok := opsync.AppendID(f); ok {
			if s := strOf(v); s != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	}
	slices.Sort(out)
	return out
}

func TestUseCases(t *testing.T) {
	f := loadUseCases(t)
	if len(f.Cases) < 25 {
		t.Fatalf("only %d use cases", len(f.Cases))
	}
	for _, c := range f.Cases {
		t.Run(fmt.Sprintf("%02d %s", c.Row, c.Name), func(t *testing.T) { runUseCase(t, f, c) })
	}
}

func runUseCase(t *testing.T, f ucFile, c ucCase) {
	h, sink, env := routineHarness(t)
	env.Webhooks, env.EmailConfigured, env.EmailVerified = c.Webhooks, c.Email, c.Email
	var deliveries []delivery
	h.e.RoutineHook = func(_ context.Context, _, _ string, d RoutineDelivery) error {
		ids := slices.Clone(d.TaskIDs)
		slices.Sort(ids)
		deliveries = append(deliveries, delivery{d.Text, ids})
		return nil
	}
	mailer := &fakeMailer{}
	h.e.Mail = mailer
	seed := c.ucSeed
	if c.Seed != "" {
		s := f.Seeds[c.Seed]
		seed.Tasks = append(slices.Clone(s.Tasks), seed.Tasks...)
	}
	before := seedUseCase(t, h, seed)
	cond := ""
	if len(c.Condition) > 0 {
		cond = string(c.Condition)
	}
	h.routine("alice", "uc", c.Name, string(c.Trigger), cond, string(c.Steps))
	if len(c.AI) > 0 {
		env.AI, env.AIConsent = true, true
		h.e.AI = &ucAI{answers: slices.Clone(c.AI)}
		h.write("alice", "laptop", "rule", "uc", map[string]any{"ai_apply": "auto"})
	}
	res := h.runNow("alice", "uc", c.RunOn, false)
	want := c.Expect.Outcome
	if want == "" {
		want = OutcomeApplied
	}
	if res.Run.Outcome != want {
		t.Fatalf("outcome %s, want %s: %v", res.Run.Outcome, want, statuses(res))
	}
	checkUseCase(t, h, c, seed, before, res, sink, deliveries, mailer)
	checkUseCaseProjects(t, h, c, seed)
}

// checkUseCaseProjects compares the projects, sections, labels and favourites
// a run wrote, for the keys a case states.
func checkUseCaseProjects(t *testing.T, h *harness, c ucCase, seed ucSeed) {
	t.Helper()
	e := c.Expect
	projects, err := h.sync.List(h.ctx, "alice", "project", false)
	if err != nil {
		t.Fatal(err)
	}
	seeded := map[string]bool{}
	for _, p := range seed.Projects {
		seeded[p.ID] = true
	}
	names := map[string]string{}
	changed := map[string]map[string]any{}
	created := []string{}
	for _, p := range projects {
		id := strOf(p["id"])
		names[id] = strOf(p["name"])
		if !seeded[id] {
			created = append(created, strOf(p["name"]))
			continue
		}
		for _, sp := range seed.Projects {
			if sp.ID != id {
				continue
			}
			if strOf(p["name"]) != sp.Name {
				ensure(changed, id)["name"] = strOf(p["name"])
			}
			if a := boolOf(p, "archived"); a != sp.Archived {
				ensure(changed, id)["archived"] = a
			}
		}
	}
	slices.Sort(created)
	if e.ChangedProjects != nil && !reflect.DeepEqual(changed, e.ChangedProjects) {
		t.Errorf("changed projects %v, want %v", changed, e.ChangedProjects)
	}
	if e.CreatedProjects != nil && !slices.Equal(created, e.CreatedProjects) {
		t.Errorf("created projects %v, want %v", created, e.CreatedProjects)
	}
	if e.Sections != nil {
		rows, err := h.sync.List(h.ctx, "alice", "section", false)
		if err != nil {
			t.Fatal(err)
		}
		got := []string{}
		for _, r := range rows {
			got = append(got, names[strOf(r["project_id"])]+"/"+strOf(r["name"]))
		}
		slices.Sort(got)
		if !slices.Equal(got, e.Sections) {
			t.Errorf("sections %v, want %v", got, e.Sections)
		}
	}
	if e.LabelsCreated != nil {
		rows, err := h.sync.List(h.ctx, "alice", "label", false)
		if err != nil {
			t.Fatal(err)
		}
		got := []string{}
		for _, r := range rows {
			if !slices.ContainsFunc(seed.Labels, func(l struct{ ID, Name string }) bool { return l.ID == strOf(r["id"]) }) {
				got = append(got, strOf(r["name"]))
			}
		}
		slices.Sort(got)
		if !slices.Equal(got, e.LabelsCreated) {
			t.Errorf("labels created %v, want %v", got, e.LabelsCreated)
		}
	}
	if e.Favourites != nil {
		prefs, _ := h.sync.Get(h.ctx, "alice", "user_prefs", "me")
		if got := strOf(prefs["favourites"]); got != *e.Favourites {
			t.Errorf("favourites %q, want %q", got, *e.Favourites)
		}
	}
}

func ensure(m map[string]map[string]any, id string) map[string]any {
	if m[id] == nil {
		m[id] = map[string]any{}
	}
	return m[id]
}

type delivery struct {
	Text  *string
	Tasks []string
}

// seedUseCase writes a case's labels, projects, views and tasks and returns
// each task's state before the run.
func seedUseCase(t *testing.T, h *harness, seed ucSeed) map[string]map[string]any {
	t.Helper()
	for _, l := range seed.Labels {
		h.write("alice", "laptop", "label", l.ID, map[string]any{"name": l.Name, "created_at": 1, "deleted_at": nil})
	}
	for _, p := range seed.Projects {
		h.project("alice", p.ID, p.Name, p.Description)
		if p.Archived {
			h.write("alice", "laptop", "project", p.ID, map[string]any{"archived": true})
		}
		if p.Deleted {
			h.write("alice", "laptop", "project", p.ID, map[string]any{"deleted_at": 5})
		}
	}
	for _, v := range seed.Views {
		h.write("alice", "laptop", "view", v.ID, map[string]any{"name": v.Name, "query": v.Query, "created_at": 1, "deleted_at": nil})
	}
	before := map[string]map[string]any{}
	for i, x := range seed.Tasks {
		fields := map[string]any{"position": i + 1, "description": x.Description, "project_id": nil, "parent_id": nil}
		if x.Title != "" {
			fields["title"] = x.Title
		}
		if x.Due != "" {
			fields["due"] = map[string]string{"date": x.Due}
		}
		if x.CompletedOn != "" {
			day, err := time.Parse("2006-01-02", x.CompletedOn)
			if err != nil {
				t.Fatal(err)
			}
			fields["completed_at"] = day.Add(10 * time.Hour).UnixMilli()
		}
		if x.Labels != nil {
			fields["labels"] = x.Labels
		}
		if x.Priority != 0 {
			fields["priority"] = x.Priority
		}
		if x.ProjectID != "" {
			fields["project_id"] = x.ProjectID
		}
		if x.ParentID != "" {
			fields["parent_id"] = x.ParentID
		}
		if x.Deleted {
			fields["deleted_at"] = 5
		}
		now := h.clock
		if x.ChangedOn != "" {
			day, err := time.Parse("2006-01-02", x.ChangedOn)
			if err != nil {
				t.Fatal(err)
			}
			h.clock = day.Add(10 * time.Hour)
		}
		h.task("alice", x.ID, fields)
		h.clock = now
		before[x.ID] = ucTaskState(h.get("alice", x.ID))
	}
	// Time entries after their tasks (an entry lives in its task's scope).
	for _, x := range seed.Entries {
		start, err := time.Parse(time.RFC3339, x.Started)
		if err != nil {
			t.Fatal(err)
		}
		var end any
		if x.Ended != "" {
			e, err := time.Parse(time.RFC3339, x.Ended)
			if err != nil {
				t.Fatal(err)
			}
			end = e.UnixMilli()
		}
		h.write("alice", "laptop", "time_entry", x.ID, map[string]any{"task_id": x.TaskID, "user_id": "alice", "started_at": start.UnixMilli(), "ended_at": end,
			"device_id": "laptop", "created_at": 1, "deleted_at": nil})
	}
	return before
}

// checkUseCase compares everything the run wrote with the case's expectation.
func checkUseCase(t *testing.T, h *harness, c ucCase, seed ucSeed, before map[string]map[string]any, res Result, sink *noticeSink, deliveries []delivery, mailer *fakeMailer) {
	t.Helper()
	// Existing tasks: exactly the expected fields changed.
	changed := map[string]map[string]any{}
	rows, err := h.sync.List(h.ctx, "alice", "task", true)
	if err != nil {
		t.Fatal(err)
	}
	var created []map[string]any
	comments := map[string][]string{}
	appended := map[string][]string{}
	for _, r := range rows {
		id := strOf(r["id"])
		now := ucTaskState(r)
		if old, ok := before[id]; ok {
			for k, v := range now {
				if !reflect.DeepEqual(old[k], v) {
					if changed[id] == nil {
						changed[id] = map[string]any{}
					}
					changed[id][k] = v
				}
			}
		} else {
			x := map[string]any{"title": now["title"]}
			for _, k := range []string{"project_id", "parent_id", "due"} {
				if now[k] != "" {
					x[k] = now[k]
				}
			}
			created = append(created, x)
		}
		cs, err := h.sync.TaskComments(h.ctx, "alice", id)
		if err != nil {
			t.Fatal(err)
		}
		for _, cm := range cs {
			comments[id] = append(comments[id], strOf(cm["body"]))
		}
		if a := appendedOf(r); len(a) > 0 {
			appended[id] = a
		}
	}
	for _, p := range seed.Projects {
		row, err := h.sync.Get(h.ctx, "alice", "project", p.ID)
		if err != nil || row == nil {
			t.Fatalf("project %s: %v", p.ID, err)
		}
		if a := appendedOf(row); len(a) > 0 {
			appended[p.ID] = a
		} else if d := strOf(row["description"]); d != p.Description {
			appended[p.ID] = []string{strings.TrimSpace(strings.TrimPrefix(d, p.Description))}
		}
	}
	slices.SortFunc(created, func(a, b map[string]any) int { return strings.Compare(fmt.Sprint(a["title"]), fmt.Sprint(b["title"])) })
	wantChanged := map[string]map[string]any{}
	for id, m := range c.Expect.Changed {
		wantChanged[id] = map[string]any{}
		for k, v := range m {
			if n, ok := v.(float64); ok {
				wantChanged[id][k] = n
			} else {
				wantChanged[id][k] = v
			}
		}
	}
	check := func(what string, got, want any) {
		t.Helper()
		gv, wv := reflect.ValueOf(got), reflect.ValueOf(want)
		if (gv.Kind() == reflect.Map || gv.Kind() == reflect.Slice) && gv.Len() == 0 && (!wv.IsValid() || wv.Len() == 0) {
			return
		}
		if !reflect.DeepEqual(got, want) {
			gj, _ := json.Marshal(got)
			wj, _ := json.Marshal(want)
			t.Errorf("%s:\n got %s\nwant %s\nsteps %v", what, gj, wj, statuses(res))
		}
	}
	check("changed tasks", changed, wantChanged)
	if c.Expect.CreatedCount > 0 {
		if len(created) != c.Expect.CreatedCount {
			t.Errorf("created %d tasks, want %d", len(created), c.Expect.CreatedCount)
		}
	} else {
		check("created tasks", created, c.Expect.Created)
	}
	check("comments", comments, c.Expect.Comments)
	check("appended notes", appended, c.Expect.Appended)
	var notices []string
	for _, n := range sink.notices {
		notices = append(notices, n.Text)
	}
	check("notices", notices, c.Expect.Notices)
	var wantHooks []delivery
	for _, w := range c.Expect.Webhooks {
		wantHooks = append(wantHooks, delivery{w.Text, w.Tasks})
	}
	check("webhooks", deliveries, wantHooks)
	var mails, wantMails []string
	for _, m := range mailer.sent {
		mails = append(mails, m.Subject+"|"+m.Text)
	}
	for _, m := range c.Expect.Emails {
		wantMails = append(wantMails, m.Subject+"|"+m.Text)
	}
	check("emails", mails, wantMails)
	if c.Expect.Focus != "" {
		review, _ := h.sync.Get(h.ctx, "alice", "review", "me")
		if review == nil || strOf(review["focus"]) != c.Expect.Focus {
			t.Errorf("focus %v, want %s", review["focus"], c.Expect.Focus)
		}
	}
	entries, err := h.sync.List(h.ctx, "alice", "time_entry", false)
	if err != nil {
		t.Fatal(err)
	}
	running := ""
	for _, e := range entries {
		if opsync.IsNull(e["ended_at"]) {
			running = strOf(e["task_id"])
		}
	}
	if running != c.Expect.Timer {
		t.Errorf("running timer %q, want %q", running, c.Expect.Timer)
	}
}
