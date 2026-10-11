package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/recurrence"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/zoned"
)

// Row outcomes in a preview or job.
const (
	OutcomeCreate = "create"
	OutcomeUpdate = "update"
	OutcomeSkip   = "skip"
	OutcomeError  = "error"
)

// Skip reasons.
const (
	ReasonAlreadyImported   = "already_imported"
	ReasonPossibleDuplicate = "possible_duplicate"
	ReasonExists            = "exists"
	ReasonUnchanged         = "unchanged"
	ReasonDeleted           = "deleted"
	// ReasonNoProject: a section listed by the file whose project is the Inbox
	// (sections always belong to a project).
	ReasonNoProject = "no_project"
)

// State is the part of the user's current data the planner needs.
type State struct {
	Projects, Labels, Tasks []opsync.Entity // including tombstoned ones
	// Sections, Reminders and Views (including tombstoned ones) let own-export
	// rows detect existing ids and foreign rows reuse sections by name.
	Sections, Reminders, Views []opsync.Entity
	// UserID is the importing account (own-export assignees are kept only for it).
	UserID string
	// Remembered maps source ids recorded by earlier, not undone imports of the
	// same profile to the entity ids they created.
	Remembered map[string]string
}

// RowResult is the per-row outcome shown in a preview.
type RowResult struct {
	Row      int      `json:"row,omitempty"`
	SourceID string   `json:"sourceId,omitempty"`
	Kind     string   `json:"kind"`
	Title    string   `json:"title"`
	Project  string   `json:"project,omitempty"`
	Outcome  string   `json:"outcome"`
	Reason   string   `json:"reason,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// RowError is a row that could not be imported.
type RowError struct {
	Row      int    `json:"row,omitempty"`
	SourceID string `json:"sourceId,omitempty"`
	Reason   string `json:"reason"`
}

func (e RowError) String() string {
	where := "row " + fmt.Sprint(e.Row)
	if e.Row == 0 {
		where = "source id " + e.SourceID
	}
	return where + ": " + e.Reason
}

// Totals counts outcomes; Entities, Written and Ops report commit progress.
type Totals struct {
	Rows               int `json:"rows"`
	Create             int `json:"create"`
	Update             int `json:"update"`
	Skip               int `json:"skip"`
	Error              int `json:"error"`
	PossibleDuplicates int `json:"possibleDuplicates"`
	Warnings           int `json:"warnings"`
	NewProjects        int `json:"newProjects"`
	NewLabels          int `json:"newLabels"`
	// NewSections, Recurring (created or updated tasks with a rule) and
	// Reminders (created live reminders) are additive (import-completeness).
	NewSections int `json:"newSections"`
	Recurring   int `json:"recurring"`
	Reminders   int `json:"reminders"`
	Entities    int `json:"entities"`
	Written     int `json:"written"`
	Ops         int `json:"ops"`
	// Refused counts ops the sync engine refused for authorization reasons (for
	// example a shared project whose role changed during the import); additive.
	Refused int `json:"refused,omitempty"`
}

// Columns lists the recognised and ignored CSV columns.
type Columns struct {
	Recognised []string `json:"recognised"`
	Ignored    []string `json:"ignored"`
}

// Plan is a dry run: what each row would do and the entity changes to write.
type Plan struct {
	Format    string      `json:"format"`
	Version   int         `json:"version,omitempty"`
	Columns   *Columns    `json:"columns,omitempty"`
	Options   Options     `json:"options"`
	Totals    Totals      `json:"totals"`
	Rows      []RowResult `json:"rows"`
	Truncated bool        `json:"truncated"`
	// Notes are file-level remarks, such as records that are not imported.
	Notes []string `json:"notes"`

	changes []change
	errors  []RowError
}

// Errors returns every row error, in file order.
func (p *Plan) Errors() []RowError { return p.errors }

type field struct {
	name  string
	value json.RawMessage
}

// change is one entity's set of field writes.
type change struct {
	entity   string
	id       string
	fields   []field
	created  bool
	sourceID string
}

// value returns the value written to field name, or nil.
func (c change) value(name string) json.RawMessage {
	for _, f := range c.fields {
		if f.name == name {
			return f.value
		}
	}
	return nil
}

var palette = []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"}

func raw(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

func str(e opsync.Entity, f string) string {
	var s string
	if v, ok := e[f]; ok {
		_ = json.Unmarshal(v, &s)
	}
	return s
}

func isNull(v json.RawMessage) bool { return len(v) == 0 || string(v) == "null" }

// validateFields runs the op schema check on every field so a row that the op log
// would refuse is reported as a row error instead of failing a whole batch.
func validateFields(entity, id string, fields []field) error {
	for _, f := range fields {
		op := opsync.Op{ID: "validate", Entity: entity, EntityID: id, Field: f.name, Value: f.value, TS: 1, Device: Device}
		if err := opsync.Validate(op); err != nil {
			return fmt.Errorf("%s", strings.TrimPrefix(err.Error(), opsync.ErrInvalidOp.Error()+": "))
		}
	}
	return nil
}

type planner struct {
	opts    Options
	st      *State
	now     int64
	newID   func() string
	byKind  map[string]map[string]opsync.Entity
	results []RowResult

	projectByName map[string]string // lower name → existing, non-deleted project id
	labelByName   map[string]string
	fingerprints  map[string]string // open task fingerprint → task id

	implicitProj map[string]*implicit
	implicitByID map[string]*implicit
	implicitLbl  map[string]*implicit
	labelOrder   []*implicit
	projOrder    []*implicit
	position     int64

	sectionByKey map[string]string    // project id NUL lower name → existing live section id
	implicitSec  map[string]*implicit // sections to create, by the same key
	secOrder     []*implicit
}

type implicit struct {
	id, name string
	used     bool
	// project and sourceID are set for sections.
	project, sourceID string
}

func sectionKey(projectID, name string) string {
	return projectID + "\x00" + strings.ToLower(strings.TrimSpace(name))
}

// BuildPlan resolves rows against the current state. It never writes anything.
func BuildPlan(parsed *Parsed, opts Options, st *State, now time.Time, newID func() string) *Plan {
	pl := &planner{opts: opts, st: st, now: now.UnixMilli(), newID: newID, position: now.UnixMilli(),
		byKind: map[string]map[string]opsync.Entity{KindProject: {}, KindLabel: {}, KindTask: {},
			KindSection: {}, KindReminder: {}, KindView: {}},
		projectByName: map[string]string{}, labelByName: map[string]string{}, fingerprints: map[string]string{},
		implicitProj: map[string]*implicit{}, implicitByID: map[string]*implicit{}, implicitLbl: map[string]*implicit{},
		sectionByKey: map[string]string{}, implicitSec: map[string]*implicit{}}
	if st.Remembered == nil {
		st.Remembered = map[string]string{}
	}
	for kind, list := range map[string][]opsync.Entity{KindProject: st.Projects, KindLabel: st.Labels, KindTask: st.Tasks,
		KindSection: st.Sections, KindReminder: st.Reminders, KindView: st.Views} {
		for _, e := range list {
			id := str(e, "id")
			pl.byKind[kind][id] = e
		}
	}
	for _, e := range st.Projects {
		if n := strings.ToLower(strings.TrimSpace(str(e, "name"))); n != "" && !e.Deleted() {
			if _, ok := pl.projectByName[n]; !ok {
				pl.projectByName[n] = str(e, "id")
			}
		}
	}
	for _, e := range st.Sections {
		if n := strings.TrimSpace(str(e, "name")); n != "" && !e.Deleted() {
			if _, ok := pl.sectionByKey[sectionKey(str(e, "project_id"), n)]; !ok {
				pl.sectionByKey[sectionKey(str(e, "project_id"), n)] = str(e, "id")
			}
		}
	}
	for _, e := range st.Labels {
		if n := strings.ToLower(strings.TrimSpace(str(e, "name"))); n != "" && !e.Deleted() {
			if _, ok := pl.labelByName[n]; !ok {
				pl.labelByName[n] = str(e, "id")
			}
		}
	}
	for _, e := range st.Tasks {
		if e.Deleted() || !isNull(e["completed_at"]) {
			continue
		}
		var due struct {
			Date string `json:"date"`
		}
		if v := e["due"]; !isNull(v) {
			_ = json.Unmarshal(v, &due)
		}
		key := fingerprint(str(e, "title"), str(e, "project_id"), due.Date)
		if _, ok := pl.fingerprints[key]; !ok {
			pl.fingerprints[key] = str(e, "id")
		}
	}

	p := &Plan{Format: parsed.Format, Version: parsed.Version, Options: opts, Notes: nonNil(parsed.Notes)}
	if parsed.Format == "csv" {
		p.Columns = &Columns{Recognised: nonNil(parsed.Recognised), Ignored: nonNil(parsed.Ignored)}
	}
	pl.results = make([]RowResult, len(parsed.Rows))
	for i, r := range parsed.Rows {
		pl.results[i] = RowResult{Row: r.Line, SourceID: r.SourceID, Kind: r.Kind, Title: r.Title, Warnings: r.Warnings}
	}
	if parsed.Format == "opentodo" {
		p.changes = pl.planOwn(parsed.Rows)
	} else {
		p.changes = pl.planForeign(parsed.Rows)
	}
	for i := range pl.results {
		r := &pl.results[i]
		p.Totals.Rows++
		switch r.Outcome {
		case OutcomeCreate:
			p.Totals.Create++
		case OutcomeUpdate:
			p.Totals.Update++
		case OutcomeSkip:
			p.Totals.Skip++
		case OutcomeError:
			p.Totals.Error++
			p.errors = append(p.errors, RowError{Row: r.Row, SourceID: r.SourceID, Reason: r.Reason})
		}
		if r.Reason == ReasonPossibleDuplicate || hasPrefix(r.Warnings, "possible duplicate") {
			p.Totals.PossibleDuplicates++
		}
		if len(r.Warnings) > 0 {
			p.Totals.Warnings++
		}
	}
	for _, c := range p.changes {
		if c.created && c.entity == KindProject {
			p.Totals.NewProjects++
		}
		if c.created && c.entity == KindLabel {
			p.Totals.NewLabels++
		}
		live := isNull(c.value("deleted_at"))
		switch {
		case c.created && c.entity == KindSection && live:
			p.Totals.NewSections++
		case c.entity == KindTask && live && !isNull(c.value("recurrence")):
			p.Totals.Recurring++
		case c.created && c.entity == KindReminder && live:
			p.Totals.Reminders++
		}
	}
	p.Totals.Entities = len(p.changes)
	p.Rows, p.Truncated = previewRows(pl.results)
	return p
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func hasPrefix(list []string, prefix string) bool {
	for _, s := range list {
		if strings.HasPrefix(s, prefix) {
			return true
		}
	}
	return false
}

func fingerprint(title, projectID, dueDate string) string {
	return strings.ToLower(strings.TrimSpace(title)) + "\x00" + projectID + "\x00" + dueDate
}

// previewRows keeps the response bounded: rows that need attention (errors,
// skips, updates, warnings) come first, then creates, in file order.
func previewRows(all []RowResult) ([]RowResult, bool) {
	if len(all) <= MaxPreviewRows {
		return all, false
	}
	keep := make([]bool, len(all))
	n := 0
	for pass := 0; pass < 2 && n < MaxPreviewRows; pass++ {
		for i, r := range all {
			if n >= MaxPreviewRows {
				break
			}
			attention := r.Outcome != OutcomeCreate || len(r.Warnings) > 0
			if !keep[i] && (pass == 1 || attention) {
				keep[i] = true
				n++
			}
		}
	}
	out := make([]RowResult, 0, n)
	for i, r := range all {
		if keep[i] {
			out = append(out, r)
		}
	}
	return out, true
}

// ---- own export ------------------------------------------------------------------

func (pl *planner) planOwn(rows []Row) []change {
	var out []change
	fileTasks := map[string]bool{}
	for _, row := range rows {
		if row.Kind == KindTask && row.SourceID != "" {
			fileTasks[row.SourceID] = true
		}
	}
	for i, row := range rows {
		res := &pl.results[i]
		if row.Err != "" {
			res.Outcome, res.Reason = OutcomeError, row.Err
			continue
		}
		schema := opsync.Schema[row.Kind]
		names := make([]string, 0, len(row.Entity))
		for k := range row.Entity {
			names = append(names, k)
		}
		sort.Strings(names)
		var fields []field
		for _, k := range names {
			if k == "id" {
				continue
			}
			if row.Kind == KindProject && (k == "role" || k == "owner_id") {
				continue // read-only sharing annotations of the export, not data
			}
			if _, ok := schema[k]; !ok {
				res.Warnings = append(res.Warnings, fmt.Sprintf("unknown field %q dropped", k))
				continue
			}
			fields = append(fields, field{k, row.Entity[k]})
		}
		switch row.Kind {
		case KindTask:
			fields = pl.ownTask(fields, res)
		case KindReminder:
			var task string
			_ = json.Unmarshal(row.Entity["task_id"], &task)
			if task != "" && !fileTasks[task] && pl.byKind[KindTask][task] == nil {
				res.Outcome, res.Reason = OutcomeError, fmt.Sprintf("task %s is neither in the file nor in your account", task)
				continue
			}
			fields = pl.ownReminder(fields, res)
		}
		if err := validateFields(row.Kind, row.SourceID, fields); err != nil {
			res.Outcome, res.Reason = OutcomeError, err.Error()
			continue
		}
		existing := pl.byKind[row.Kind][row.SourceID]
		switch {
		case existing == nil:
			res.Outcome = OutcomeCreate
			out = append(out, change{entity: row.Kind, id: row.SourceID, fields: fields, created: true, sourceID: row.SourceID})
		case existing.Deleted():
			// Never resurrect: a tombstone wins over anything an import carries.
			res.Outcome, res.Reason = OutcomeSkip, ReasonDeleted
		case pl.opts.Existing != "overwrite":
			res.Outcome, res.Reason = OutcomeSkip, ReasonExists
		default:
			var diff []field
			for _, f := range fields {
				if !jsonEqual(existing[f.name], f.value) {
					diff = append(diff, f)
				}
			}
			if len(diff) == 0 {
				res.Outcome, res.Reason = OutcomeSkip, ReasonUnchanged
				continue
			}
			res.Outcome = OutcomeUpdate
			out = append(out, change{entity: row.Kind, id: row.SourceID, fields: diff, sourceID: row.SourceID})
		}
	}
	return out
}

// ownTask stores the rule in canonical form and keeps an assignee only when it
// is the importing account (anyone else is not a member here, design D2).
func (pl *planner) ownTask(fields []field, res *RowResult) []field {
	out := fields[:0]
	for _, f := range fields {
		switch f.name {
		case "recurrence":
			var rule string
			if json.Unmarshal(f.value, &rule) == nil && rule != "" {
				if c, err := recurrence.Canonicalize(rule); err == nil {
					f.value = raw(c)
				}
			}
		case "assignee_id":
			var who string
			if json.Unmarshal(f.value, &who) == nil && who != "" && who != pl.st.UserID {
				res.Warnings = append(res.Warnings, "assignee dropped (only your own account can be assigned by an import)")
				continue
			}
		}
		out = append(out, f)
	}
	return out
}

// ownReminder keeps delivery and dismissal state; a live reminder whose firing
// time has passed without a delivery or dismissal for that firing is imported
// dismissed, so the server does not push a burst of stale notifications.
func (pl *planner) ownReminder(fields []field, res *RowResult) []field {
	num := func(name string) float64 {
		var n float64
		for _, f := range fields {
			if f.name == name {
				_ = json.Unmarshal(f.value, &n)
			}
		}
		return n
	}
	fire := num("fire_at")
	if num("deleted_at") != 0 || fire <= 0 || fire >= float64(pl.now) || num("delivered_at") >= fire || num("dismissed_at") >= fire {
		return fields
	}
	res.Warnings = append(res.Warnings, warnPastReminder)
	return setField(fields, "dismissed_at", raw(pl.now))
}

const warnPastReminder = "reminder time already passed; imported as dismissed"

func setField(fields []field, name string, v json.RawMessage) []field {
	for i := range fields {
		if fields[i].name == name {
			fields[i].value = v
			return fields
		}
	}
	return append(fields, field{name, v})
}

func jsonEqual(a, b json.RawMessage) bool {
	if len(a) == 0 {
		return isNull(b) && len(b) == 0
	}
	if bytes.Equal(a, b) {
		return true
	}
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	return reflect.DeepEqual(x, y)
}

// ---- foreign formats -------------------------------------------------------------

type taskPlan struct {
	state     int // 0 new, 1 resolving, 2 done
	entityID  string
	projectID string
}

type projPlan struct {
	id      string
	name    string
	created bool
	row     int
}

func (pl *planner) planForeign(rows []Row) []change {
	// Projects named by rows of kind project.
	projBySource := map[string]*projPlan{}
	projByFileName := map[string]*projPlan{}
	var projChanges []*change
	projChangeByID := map[string]*change{}
	for i, row := range rows {
		if row.Kind != KindProject {
			continue
		}
		res := &pl.results[i]
		if row.Err != "" {
			res.Outcome, res.Reason = OutcomeError, row.Err
			continue
		}
		name := strings.TrimSpace(row.Title)
		pp := &projPlan{name: name, row: i}
		if id, ok := pl.st.Remembered[row.SourceID]; ok && pl.alive(KindProject, id) {
			pp.id = id
			res.Outcome, res.Reason = OutcomeSkip, ReasonAlreadyImported
		} else if id, ok := pl.projectByName[strings.ToLower(name)]; ok {
			pp.id = id
			res.Outcome, res.Reason = OutcomeSkip, ReasonExists
		} else {
			pp.id, pp.created = pl.newID(), true
			fields := []field{
				{"name", raw(name)},
				{"color", raw(palette[len(projChanges)%len(palette)])},
				{"position", raw(pl.nextPosition())},
				{"archived", raw(false)},
				{"created_at", raw(pl.now)},
			}
			if err := validateFields(KindProject, pp.id, fields); err != nil {
				res.Outcome, res.Reason = OutcomeError, err.Error()
				continue
			}
			res.Outcome = OutcomeCreate
			c := &change{entity: KindProject, id: pp.id, fields: fields, created: true, sourceID: row.SourceID}
			projChanges = append(projChanges, c)
			projChangeByID[pp.id] = c
		}
		if row.SourceID != "" {
			projBySource[row.SourceID] = pp
		}
		if _, ok := projByFileName[strings.ToLower(name)]; !ok {
			projByFileName[strings.ToLower(name)] = pp
		}
	}
	// Parents of created projects, resolved after all rows are known.
	parentOf := map[string]string{}
	for i, row := range rows {
		if row.Kind != KindProject || row.ParentSourceID == "" || pl.results[i].Outcome != OutcomeCreate {
			continue
		}
		pp := projBySource[row.SourceID]
		if pp == nil {
			continue
		}
		parent := ""
		if pr, ok := projBySource[row.ParentSourceID]; ok {
			parent = pr.id
		} else if id, ok := pl.st.Remembered[row.ParentSourceID]; ok && pl.alive(KindProject, id) {
			parent = id
		}
		if parent == "" || parent == pp.id {
			pl.results[i].Warnings = append(pl.results[i].Warnings, "parent project not found; imported as a top-level project")
			continue
		}
		parentOf[pp.id] = parent
	}
	for id, parent := range parentOf {
		// Break cycles formed inside the file: walk up and drop the link that closes one.
		seen := map[string]bool{id: true}
		cycle := false
		for cur := parent; cur != ""; cur = parentOf[cur] {
			if seen[cur] {
				cycle = true
				break
			}
			seen[cur] = true
		}
		if cycle {
			delete(parentOf, id)
			continue
		}
	}
	for id, parent := range parentOf {
		projChangeByID[id].fields = append(projChangeByID[id].fields, field{"parent_id", raw(parent)})
	}

	// Sections listed by the file (json-items with sections: section).
	for i, row := range rows {
		if row.Kind != KindSection {
			continue
		}
		res := &pl.results[i]
		if row.Err != "" {
			res.Outcome, res.Reason = OutcomeError, row.Err
			continue
		}
		projectID, projectName, _ := pl.resolveProject(row, projBySource, projByFileName, res)
		res.Project = projectName
		if projectID == "" {
			res.Outcome, res.Reason = OutcomeSkip, ReasonNoProject
			continue
		}
		key := sectionKey(projectID, row.Title)
		if id, ok := pl.st.Remembered[row.SourceID]; ok && pl.alive(KindSection, id) {
			res.Outcome, res.Reason = OutcomeSkip, ReasonAlreadyImported
			if _, ok := pl.sectionByKey[key]; !ok {
				pl.sectionByKey[key] = id
			}
			continue
		}
		if _, ok := pl.sectionByKey[key]; ok {
			res.Outcome, res.Reason = OutcomeSkip, ReasonExists
			continue
		}
		if _, ok := pl.implicitSec[key]; ok {
			res.Outcome, res.Reason = OutcomeSkip, ReasonExists
			continue
		}
		if err := validateFields(KindSection, "validate", []field{{"name", raw(strings.TrimSpace(row.Title))}}); err != nil {
			res.Outcome, res.Reason = OutcomeError, err.Error()
			continue
		}
		pl.sectionID(projectID, row.Title, row.SourceID)
		pl.markProjectUsed(projectID)
		res.Outcome = OutcomeCreate
	}

	// Tasks.
	taskIdx := map[string]int{}
	for i, row := range rows {
		if row.Kind == KindTask && row.SourceID != "" {
			if _, dup := taskIdx[row.SourceID]; !dup {
				taskIdx[row.SourceID] = i
			}
		}
	}
	plans := make([]taskPlan, len(rows))
	taskChanges := make([]*change, len(rows))
	reminderChanges := make([][]change, len(rows))
	var resolve func(i int)
	resolve = func(i int) {
		tp := &plans[i]
		if tp.state != 0 {
			return
		}
		tp.state = 1
		defer func() { tp.state = 2 }()
		row := rows[i]
		res := &pl.results[i]
		if row.Err != "" {
			res.Outcome, res.Reason = OutcomeError, row.Err
			return
		}
		projectID, projectName, explicit := pl.resolveProject(row, projBySource, projByFileName, res)
		parentID := ""
		if row.ParentSourceID != "" {
			parentProject := ""
			if j, ok := taskIdx[row.ParentSourceID]; ok && j != i {
				if plans[j].state == 1 {
					res.Warnings = append(res.Warnings, "parent forms a cycle; imported as a top-level task")
				} else {
					resolve(j)
					if plans[j].entityID != "" {
						parentID, parentProject = plans[j].entityID, plans[j].projectID
					} else {
						res.Warnings = append(res.Warnings, fmt.Sprintf("parent row %d could not be imported; imported as a top-level task", rows[j].Line))
					}
				}
			} else if id, ok := pl.st.Remembered[row.ParentSourceID]; ok && pl.alive(KindTask, id) {
				parentID, parentProject = id, str(pl.byKind[KindTask][id], "project_id")
			} else {
				res.Warnings = append(res.Warnings, fmt.Sprintf("parent %q not found; imported as a top-level task", displaySource(row.ParentSourceID)))
			}
			if parentID != "" && parentProject != projectID {
				if explicit {
					res.Warnings = append(res.Warnings, "moved to its parent's project")
				}
				projectID, projectName = parentProject, ""
			}
		}
		res.Project = projectName
		if res.Project == "" && projectID != "" {
			res.Project = pl.projectLabel(projectID)
		}
		tp.projectID = projectID
		if id, ok := pl.st.Remembered[row.SourceID]; ok && pl.alive(KindTask, id) {
			res.Outcome, res.Reason = OutcomeSkip, ReasonAlreadyImported
			tp.entityID, tp.projectID = id, str(pl.byKind[KindTask][id], "project_id")
			return
		}
		dueDate := ""
		if row.Due != nil {
			dueDate = row.Due.Date
		}
		if dup, ok := pl.fingerprints[fingerprint(row.Title, projectID, dueDate)]; ok {
			if pl.opts.Duplicates != "import" {
				res.Outcome, res.Reason = OutcomeSkip, ReasonPossibleDuplicate
				tp.entityID = dup
				return
			}
			res.Warnings = append(res.Warnings, "possible duplicate of an existing task")
		}
		labelNames := append([]string{}, row.Labels...)
		sectionName := ""
		if row.SectionName != "" {
			switch {
			case pl.opts.Sections == "label":
				labelNames = append(labelNames, row.SectionName)
			case pl.opts.Sections == "section" && projectID == "":
				labelNames = append(labelNames, row.SectionName)
				res.Warnings = append(res.Warnings, "the Inbox has no sections; section imported as a label")
			case pl.opts.Sections == "section":
				sectionName = row.SectionName
			}
		}
		labelNames = dedupeNames(labelNames)
		due := row.Due
		if row.Recurrence != "" && due == nil {
			// Like the app: a rule on a task without a due date gives it the
			// rule's first date from today (docs/recurrence.md).
			if r, err := recurrence.Parse(row.Recurrence); err == nil {
				if first, err := r.First(time.UnixMilli(pl.now).In(pl.opts.Location()).Format("2006-01-02")); err == nil {
					due = &Due{Date: first}
				}
			}
		}
		id := pl.newID()
		priority := row.Priority
		if priority == 0 {
			priority = 4
		}
		fields := []field{
			{"title", raw(row.Title)},
			{"description", raw(row.Description)},
			{"priority", raw(priority)},
			{"position", raw(pl.nextPosition())},
		}
		created := row.CreatedAt
		if created <= 0 {
			created = pl.now
		}
		fields = append(fields, field{"created_at", raw(created)})
		if projectID != "" {
			fields = append(fields, field{"project_id", raw(projectID)})
		}
		if parentID != "" {
			fields = append(fields, field{"parent_id", raw(parentID)})
		}
		if due != nil {
			fields = append(fields, field{"due", raw(due)})
		}
		if row.Recurrence != "" {
			fields = append(fields, field{"recurrence", raw(row.Recurrence)})
		}
		if row.Completed {
			at := row.CompletedAt
			if at <= 0 {
				at = pl.now
			}
			fields = append(fields, field{"completed_at", raw(at)})
		}
		// Label ids are only known once implicit labels are allotted; validate names
		// as a list first so a bad row does not create labels.
		if err := validateFields(KindTask, id, append(fields, field{"labels", raw(nonNil(labelNames))})); err != nil {
			res.Outcome, res.Reason = OutcomeError, err.Error()
			return
		}
		labelIDs := make([]string, 0, len(labelNames))
		for _, n := range labelNames {
			labelIDs = append(labelIDs, pl.labelID(n))
		}
		fields = append(fields, field{"labels", raw(labelIDs)})
		if sectionName != "" {
			fields = append(fields, field{"section_id", raw(pl.sectionID(projectID, sectionName, ""))})
		}
		if projectID != "" {
			pl.markProjectUsed(projectID)
		}
		res.Outcome = OutcomeCreate
		tp.entityID = id
		taskChanges[i] = &change{entity: KindTask, id: id, fields: fields, created: true, sourceID: row.SourceID}
		reminderChanges[i] = pl.reminders(id, due, row.Reminders, res)
	}
	for i, row := range rows {
		if row.Kind == KindTask {
			resolve(i)
		} else if row.Kind != KindProject && row.Kind != KindSection {
			pl.results[i].Outcome, pl.results[i].Reason = OutcomeError, "unsupported row kind"
		}
	}

	var out []change
	for _, l := range pl.labelOrder {
		if !l.used {
			continue
		}
		out = append(out, change{entity: KindLabel, id: l.id, created: true, fields: []field{
			{"name", raw(l.name)},
			{"color", raw(palette[len(out)%len(palette)])},
			{"position", raw(pl.nextPosition())},
			{"created_at", raw(pl.now)},
		}})
	}
	for _, c := range projChanges {
		out = append(out, *c)
	}
	for _, ip := range pl.projOrder {
		if !ip.used {
			continue
		}
		out = append(out, change{entity: KindProject, id: ip.id, created: true, fields: []field{
			{"name", raw(ip.name)},
			{"color", raw(palette[(len(projChanges)+len(out))%len(palette)])},
			{"position", raw(pl.nextPosition())},
			{"archived", raw(false)},
			{"created_at", raw(pl.now)},
		}})
	}
	for _, sec := range pl.secOrder {
		if !sec.used {
			continue
		}
		out = append(out, change{entity: KindSection, id: sec.id, created: true, sourceID: sec.sourceID, fields: []field{
			{"name", raw(sec.name)},
			{"project_id", raw(sec.project)},
			{"position", raw(pl.nextPosition())},
			{"created_at", raw(pl.now)},
		}})
	}
	for _, c := range taskChanges {
		if c != nil {
			out = append(out, *c)
		}
	}
	for _, list := range reminderChanges {
		out = append(out, list...)
	}
	return out
}

// sectionID returns the id of the live section named name in the project,
// allotting a new one (created once) when there is none.
func (pl *planner) sectionID(projectID, name, sourceID string) string {
	key := sectionKey(projectID, name)
	if id, ok := pl.sectionByKey[key]; ok {
		return id
	}
	sec, ok := pl.implicitSec[key]
	if !ok {
		sec = &implicit{id: pl.newID(), name: strings.TrimSpace(name), project: projectID, sourceID: sourceID}
		pl.implicitSec[key] = sec
		pl.secOrder = append(pl.secOrder, sec)
	}
	sec.used = true
	return sec.id
}

// dueInstant is the instant a floating due denotes in the chosen time zone,
// 09:00 for a date-only due (as REST due changes resolve relative reminders).
func (pl *planner) dueInstant(d *Due) (int64, bool) {
	clock := d.Time
	if clock == "" {
		clock = "09:00"
	}
	t, err := zoned.Instant(d.Date, clock, pl.opts.Location())
	if err != nil {
		return 0, false
	}
	return t.UnixMilli(), true
}

// reminders builds the reminder entities of a created task (design D4).
func (pl *planner) reminders(taskID string, due *Due, list []Reminder, res *RowResult) []change {
	var out []change
	for _, r := range list {
		id := pl.newID()
		var fire int64
		fields := []field{{"task_id", raw(taskID)}}
		if r.Absolute {
			fire = r.At
			fields = append(fields, field{"kind", raw("absolute")}, field{"offset_minutes", json.RawMessage("null")})
		} else {
			fields = append(fields, field{"kind", raw("relative")}, field{"offset_minutes", raw(r.Offset)})
			if due != nil {
				if at, ok := pl.dueInstant(due); ok {
					fire = at + int64(r.Offset)*60_000
				}
			} else {
				res.Warnings = append(res.Warnings, "relative reminder on a task without a due date will not fire")
			}
		}
		if fire > 0 {
			fields = append(fields, field{"fire_at", raw(fire)})
		} else {
			fields = append(fields, field{"fire_at", json.RawMessage("null")})
		}
		fields = append(fields, field{"created_at", raw(pl.now)}, field{"delivered_at", json.RawMessage("null")})
		if fire > 0 && fire < pl.now {
			fields = append(fields, field{"dismissed_at", raw(pl.now)})
			res.Warnings = append(res.Warnings, warnPastReminder)
		} else {
			fields = append(fields, field{"dismissed_at", json.RawMessage("null")})
		}
		if err := validateFields(KindReminder, id, fields); err != nil {
			res.Warnings = append(res.Warnings, "reminder dropped: "+err.Error())
			continue
		}
		out = append(out, change{entity: KindReminder, id: id, fields: fields, created: true})
	}
	return out
}

func displaySource(s string) string {
	for _, p := range []string{"id:", "task:", "item:"} {
		s = strings.TrimPrefix(s, p)
	}
	return s
}

func (pl *planner) nextPosition() int64 {
	pl.position++
	return pl.position
}

func (pl *planner) alive(kind, id string) bool {
	e := pl.byKind[kind][id]
	return e != nil && !e.Deleted()
}

// resolveProject returns the project id ("" for the Inbox), a display name, and
// whether the row named a project itself.
func (pl *planner) resolveProject(row Row, bySource, byFileName map[string]*projPlan, res *RowResult) (string, string, bool) {
	if row.ProjectSourceID != "" {
		if pp, ok := bySource[row.ProjectSourceID]; ok {
			return pp.id, pp.name, true
		}
		if id, ok := pl.st.Remembered[row.ProjectSourceID]; ok && pl.alive(KindProject, id) {
			return id, str(pl.byKind[KindProject][id], "name"), true
		}
		if row.ProjectName == "" {
			res.Warnings = append(res.Warnings, "project not found; imported into the target project")
		}
	}
	if name := strings.TrimSpace(row.ProjectName); name != "" {
		key := strings.ToLower(name)
		if id, ok := pl.projectByName[key]; ok {
			return id, str(pl.byKind[KindProject][id], "name"), true
		}
		if pp, ok := byFileName[key]; ok {
			return pp.id, pp.name, true
		}
		ip, ok := pl.implicitProj[key]
		if !ok {
			ip = &implicit{id: pl.newID(), name: name}
			pl.implicitProj[key] = ip
			pl.implicitByID[ip.id] = ip
			pl.projOrder = append(pl.projOrder, ip)
		}
		return ip.id, ip.name, true
	}
	if pl.opts.TargetProject != "" {
		return pl.opts.TargetProject, str(pl.byKind[KindProject][pl.opts.TargetProject], "name"), false
	}
	return "", "", false
}

func (pl *planner) projectLabel(id string) string {
	if e := pl.byKind[KindProject][id]; e != nil {
		return str(e, "name")
	}
	if ip, ok := pl.implicitByID[id]; ok {
		return ip.name
	}
	return ""
}

func (pl *planner) markProjectUsed(id string) {
	if ip, ok := pl.implicitByID[id]; ok {
		ip.used = true
	}
}

func (pl *planner) labelID(name string) string {
	key := strings.ToLower(name)
	if id, ok := pl.labelByName[key]; ok {
		return id
	}
	l, ok := pl.implicitLbl[key]
	if !ok {
		l = &implicit{id: pl.newID(), name: name}
		pl.implicitLbl[key] = l
		pl.labelOrder = append(pl.labelOrder, l)
	}
	l.used = true
	return l.id
}
