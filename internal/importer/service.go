package importer

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/blobs"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Job statuses.
const (
	StatusRunning = "running"
	StatusDone    = "done"
	StatusFailed  = "failed"
	StatusUndone  = "undone"
)

// ErrNotFound is returned for a job that does not exist for this user.
var ErrNotFound = errors.New("import job not found")

// ConflictError is returned when the user already has an import (or undo) running.
type ConflictError struct{ JobID string }

func (e *ConflictError) Error() string {
	return fmt.Sprintf("import job %s is still running; wait for it to finish", e.JobID)
}

// Job is an import's status and summary.
type Job struct {
	ID      string     `json:"id"`
	Format  string     `json:"format"`
	Status  string     `json:"status"`
	Options Options    `json:"options"`
	Totals  Totals     `json:"totals"`
	Errors  []RowError `json:"errors"`
	// ViewHints come from the plan and are only present on the response to Start.
	ViewHints  []PlanViewHint `json:"viewHints,omitempty"`
	Message    string         `json:"message,omitempty"`
	CreatedAt  int64          `json:"createdAt"`
	FinishedAt *int64         `json:"finishedAt"`
	UndoneAt   *int64         `json:"undoneAt"`
}

type jobErrors struct {
	Message string     `json:"message,omitempty"`
	Rows    []RowError `json:"rows"`
}

// Service previews, runs and undoes imports for all users.
type Service struct {
	db    *sql.DB
	sync  *opsync.Service
	log   *slog.Logger
	now   func() time.Time
	newID func() string

	// blobs stores the files of own ZIP exports (attachments D12); nil without one.
	blobs *blobs.Store
	// fileRoom reports the per-file limit (0 = attachments off) and the room left
	// in the account's total (negative = no total) when files are imported.
	fileRoom func(ctx context.Context, uid string) (maxFile, room int64, err error)

	mu     sync.Mutex
	active map[string]string // user id → running job id (or "undo")
	// onSummary receives one Summary per finished job or undo (guarded by mu).
	onSummary func(context.Context, Summary)

	wg sync.WaitGroup
	// beforeBatch, when set by tests, runs before each batch of a job is written.
	beforeBatch func(jobID string)

	// maxBytes is the upload limit (it bounds unpacked archives) and tempDir the
	// directory an uploaded database is copied to (named-importers D2, D4).
	maxBytes int64
	tempDir  string
}

// SetLimits tells the Service the configured upload limit and a private
// directory for temporary copies (under the data directory); empty uses the
// system temporary directory.
func (s *Service) SetLimits(maxBytes int64, tempDir string) {
	s.maxBytes, s.tempDir = maxBytes, tempDir
}

// New returns a Service. Jobs left "running" by a previous process are marked
// failed: their persisted progress says how far they got, and undo removes it.
func New(db *sql.DB, syncSvc *opsync.Service, log *slog.Logger) *Service {
	if log == nil {
		log = slog.Default()
	}
	s := &Service{db: db, sync: syncSvc, log: log, now: time.Now, newID: ids.New, active: map[string]string{}}
	if err := s.failInterrupted(context.Background()); err != nil {
		log.Error("import: marking interrupted jobs failed", "err", err)
	}
	return s
}

// Wait blocks until every running job has finished (tests and shutdown).
func (s *Service) Wait() { s.wg.Wait() }

func (s *Service) failInterrupted(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, `SELECT id, errors_json FROM import_jobs WHERE status = ?`, StatusRunning)
	if err != nil {
		return err
	}
	type stale struct{ id, errs string }
	var list []stale
	for rows.Next() {
		var st stale
		if err := rows.Scan(&st.id, &st.errs); err != nil {
			rows.Close()
			return err
		}
		list = append(list, st)
	}
	rows.Close()
	for _, st := range list {
		var je jobErrors
		_ = json.Unmarshal([]byte(st.errs), &je)
		je.Message = "interrupted by a server restart; the counts show what was written, undo removes it"
		b, _ := json.Marshal(je)
		if _, err := s.db.ExecContext(ctx, `UPDATE import_jobs SET status = ?, errors_json = ?, finished_at = ? WHERE id = ?`,
			StatusFailed, string(b), s.now().UnixMilli(), st.id); err != nil {
			return err
		}
	}
	return nil
}

// opTS issues import op timestamps from the sync service's server clock, shared
// with REST and every other server writer, so no two server writes tie.
func (s *Service) opTS() int64 {
	return s.sync.ServerTSAt(s.now().UnixMilli())
}

func (s *Service) acquire(uid, jobID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if running, ok := s.active[uid]; ok {
		return &ConflictError{JobID: running}
	}
	s.active[uid] = jobID
	return nil
}

func (s *Service) release(uid string) {
	s.mu.Lock()
	delete(s.active, uid)
	s.mu.Unlock()
}

// prepare validates options and builds the plan for a file.
func (s *Service) prepare(ctx context.Context, uid string, data []byte, opts Options) (*Plan, error) {
	if err := opts.Normalize(); err != nil {
		return nil, err
	}
	if opts.TargetProject != "" {
		p, err := s.sync.Get(ctx, uid, "project", opts.TargetProject)
		if err != nil {
			return nil, err
		}
		if p == nil || p.Deleted() {
			return nil, &OptionError{"targetProject: no such project in your account"}
		}
		shared, err := s.sync.SharedProjects(ctx, uid)
		if err != nil {
			return nil, err
		}
		if a, ok := shared[opts.TargetProject]; ok && !opsync.CanWrite(a.Role, KindTask, "title") {
			return nil, &OptionError{"targetProject: your role on this shared project does not allow adding tasks"}
		}
	}
	opts.maxBytes, opts.tempDir, opts.exportedAt = s.maxBytes, s.tempDir, s.now()
	if err := s.db.QueryRowContext(ctx, "SELECT email FROM users WHERE id = ?", uid).Scan(&opts.importerEmail); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	parsed, err := Parse(data, opts)
	if err != nil {
		return nil, err
	}
	st, err := s.loadState(ctx, uid, parsed.Format)
	if err != nil {
		return nil, err
	}
	return BuildPlan(parsed, opts, st, s.now(), s.newID), nil
}

func (s *Service) loadState(ctx context.Context, uid, profile string) (*State, error) {
	st := &State{Remembered: map[string]string{}, UserID: uid}
	for kind, dst := range map[string]*[]opsync.Entity{KindProject: &st.Projects, KindLabel: &st.Labels, KindTask: &st.Tasks,
		KindSection: &st.Sections, KindReminder: &st.Reminders, KindView: &st.Views, KindUserPrefs: &st.UserPrefs, KindAttachment: &st.Attachments, KindTimeEntry: &st.TimeEntries, KindPlace: &st.Places, KindField: &st.Fields, KindReview: &st.Review, KindProjectPrefs: &st.ProjectPrefs} {
		list, err := s.sync.List(ctx, uid, kind, true)
		if err != nil {
			return nil, err
		}
		*dst = list
	}
	rows, err := s.db.QueryContext(ctx, `SELECT i.source_id, i.entity_id FROM import_items i JOIN import_jobs j ON j.id = i.job_id
		WHERE j.user_id = ? AND j.profile = ? AND j.undone_at IS NULL AND i.source_id != '' AND i.action = 'created'`, uid, profile)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var src, id string
		if err := rows.Scan(&src, &id); err != nil {
			return nil, err
		}
		st.Remembered[src] = id
	}
	return st, rows.Err()
}

// Preview is the dry run: nothing is written.
func (s *Service) Preview(ctx context.Context, uid string, data []byte, opts Options) (*Plan, error) {
	return s.prepare(ctx, uid, data, opts)
}

// Start validates and plans the import, records the job and writes it in the
// background. It returns the job as created (status running).
func (s *Service) Start(ctx context.Context, uid string, data []byte, opts Options) (*Job, error) {
	jobID := s.newID()
	if err := s.acquire(uid, jobID); err != nil {
		return nil, err
	}
	plan, err := s.prepare(ctx, uid, data, opts)
	if err != nil {
		s.release(uid)
		return nil, err
	}
	job := &Job{ID: jobID, Format: plan.Format, Status: StatusRunning, Options: plan.Options, Totals: plan.Totals,
		Errors: capErrors(plan.errors), ViewHints: plan.ViewHints, CreatedAt: s.now().UnixMilli()}
	if err := s.insertJob(ctx, uid, job); err != nil {
		s.release(uid)
		return nil, err
	}
	// The caller gets a snapshot: the running job mutates its own copy.
	snapshot := *job
	s.wg.Add(1)
	go s.run(uid, job, plan)
	return &snapshot, nil
}

func capErrors(errs []RowError) []RowError {
	if errs == nil {
		return []RowError{}
	}
	if len(errs) > MaxStoredErrors {
		return errs[:MaxStoredErrors]
	}
	return errs
}

func (s *Service) insertJob(ctx context.Context, uid string, j *Job) error {
	opts, _ := json.Marshal(j.Options)
	totals, _ := json.Marshal(j.Totals)
	errs, _ := json.Marshal(jobErrors{Message: j.Message, Rows: j.Errors})
	_, err := s.db.ExecContext(ctx, `INSERT INTO import_jobs(id,user_id,profile,status,options_json,totals_json,errors_json,created_at)
		VALUES(?,?,?,?,?,?,?,?)`, j.ID, uid, j.Format, j.Status, string(opts), string(totals), string(errs), j.CreatedAt)
	return err
}

func (s *Service) finish(ctx context.Context, j *Job, status, message string) {
	j.Status, j.Message = status, message
	now := s.now().UnixMilli()
	j.FinishedAt = &now
	totals, _ := json.Marshal(j.Totals)
	errs, _ := json.Marshal(jobErrors{Message: message, Rows: j.Errors})
	if _, err := s.db.ExecContext(ctx, `UPDATE import_jobs SET status = ?, totals_json = ?, errors_json = ?, finished_at = ? WHERE id = ?`,
		status, string(totals), string(errs), now, j.ID); err != nil {
		s.log.Error("import: saving job result", "job", j.ID, "err", err)
	}
}

// run writes the plan through the op log in batches of at most
// sync.MaxOpsPerRequest ops. An entity's fields always travel in one batch, so a
// failure never leaves half an entity behind.
func (s *Service) run(uid string, job *Job, plan *Plan) {
	defer s.wg.Done()
	defer s.release(uid)
	ctx := context.Background()
	tl := newTally()
	// One summary per job, whatever its outcome (harden-server-edges).
	defer func() {
		s.emit(ctx, Summary{UserID: uid, JobID: job.ID, Event: EventCompleted, Format: job.Format, Status: job.Status,
			Message: job.Message, Totals: job.Totals, Counts: tl.counts, ProjectIDs: tl.projectIDs()})
	}()
	if plan.Options.Errors == "abort" && len(plan.errors) > 0 {
		s.finish(ctx, job, StatusFailed, "aborted before writing anything: "+plan.errors[0].String())
		return
	}
	var batch []change
	size := 0
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if s.beforeBatch != nil {
			s.beforeBatch(job.ID)
		}
		if err := s.writeBatch(ctx, uid, job, batch, tl); err != nil {
			return err
		}
		batch, size = batch[:0], 0
		return nil
	}
	for _, c := range plan.changes {
		if size+len(c.fields) > opsync.MaxOpsPerRequest {
			if err := flush(); err != nil {
				s.log.Error("import: batch failed", "job", job.ID, "err", err)
				s.finish(ctx, job, StatusFailed, "writing failed after "+fmt.Sprint(job.Totals.Written)+" items: "+err.Error())
				return
			}
		}
		batch = append(batch, c)
		size += len(c.fields)
	}
	if err := flush(); err != nil {
		s.log.Error("import: batch failed", "job", job.ID, "err", err)
		s.finish(ctx, job, StatusFailed, "writing failed after "+fmt.Sprint(job.Totals.Written)+" items: "+err.Error())
		return
	}
	s.finish(ctx, job, StatusDone, "")
}

// SetBlobs lets own ZIP exports import their attachment files, within the
// limits room reports (the same per-file limit and total as uploads).
func (s *Service) SetBlobs(b *blobs.Store, room func(ctx context.Context, uid string) (maxFile, left int64, err error)) {
	s.blobs, s.fileRoom = b, room
}

// storeFiles writes the files of the batch's attachment rows before their ops;
// a row whose file cannot be stored is kept out of the batch and listed among the
// job's errors with the reason.
func (s *Service) storeFiles(ctx context.Context, uid string, job *Job, batch []change) ([]change, []string, error) {
	var stored []string
	out := batch[:0]
	maxFile, room, checked := int64(0), int64(-1), false
	refuse := func(c change, reason string) {
		job.Errors = append(job.Errors, RowError{SourceID: c.sourceID, Reason: reason})
		job.Totals.Refused++
	}
	for _, c := range batch {
		if c.entity != KindAttachment || c.file == nil {
			out = append(out, c)
			continue
		}
		if s.blobs == nil {
			refuse(c, "attachment file not imported: this server has no file store")
			continue
		}
		if !checked && s.fileRoom != nil {
			var err error
			if maxFile, room, err = s.fileRoom(ctx, uid); err != nil {
				return nil, nil, err
			}
			checked = true
		}
		var size int64
		var digest string
		_ = json.Unmarshal(c.value("size"), &size)
		_ = json.Unmarshal(c.value("sha256"), &digest)
		switch {
		case checked && maxFile == 0:
			refuse(c, "attachment file not imported: attachments are turned off on this server")
			continue
		case checked && size > maxFile:
			refuse(c, fmt.Sprintf("attachment file not imported: larger than the %d MB limit", maxFile>>20))
			continue
		case checked && room >= 0 && size > room:
			refuse(c, "attachment file not imported: it would go over your attachments total")
			continue
		}
		err := s.blobs.Write(c.id, bytes.NewReader(c.file), blobs.Spec{Size: size, SHA256: digest})
		if err != nil && !errors.Is(err, blobs.ErrExists) {
			s.log.Warn("import: attachment file", "id", c.id, "err", err)
			refuse(c, "attachment file not imported: "+err.Error())
			continue
		}
		if room >= 0 {
			room -= size
		}
		stored = append(stored, c.id)
		out = append(out, c)
	}
	return out, stored, nil
}

func (s *Service) writeBatch(ctx context.Context, uid string, job *Job, batch []change, tl *tally) error {
	batch, stored, err := s.storeFiles(ctx, uid, job, batch)
	if err != nil {
		return err
	}
	ts := s.opTS()
	var ops []opsync.Op
	for _, c := range batch {
		for _, f := range c.fields {
			ops = append(ops, opsync.Op{ID: s.newID(), Entity: c.entity, EntityID: c.id, Field: f.name, Value: f.value, TS: ts, Device: Device})
		}
	}
	res, err := s.sync.Apply(ctx, uid, ops)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, c := range batch {
		action := "updated"
		if c.created {
			action = "created"
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO import_items(job_id,source_id,entity,entity_id,action) VALUES(?,?,?,?,?)`,
			job.ID, c.sourceID, c.entity, c.id, action); err != nil {
			return err
		}
	}
	for _, c := range batch {
		tl.add(c)
	}
	job.Totals.Written += len(batch)
	job.Totals.Ops += res.Applied
	job.Totals.Refused += len(res.Rejected)
	totals, _ := json.Marshal(job.Totals)
	if _, err := tx.ExecContext(ctx, `UPDATE import_jobs SET totals_json = ? WHERE id = ?`, string(totals), job.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if res.Applied > 0 {
		// Device "import" belongs to no browser, so every connected device of
		// everyone who can see the data is woken.
		s.sync.NotifyApplied(res, Device)
	}
	// Files are stored: the server says so (uploaded_at is written by device server only).
	if len(stored) > 0 {
		var up []opsync.Op
		now, _ := json.Marshal(s.now().UnixMilli())
		for _, id := range stored {
			up = append(up, opsync.Op{ID: s.newID(), Entity: KindAttachment, EntityID: id, Field: "uploaded_at", Value: now, TS: s.opTS(), Device: opsync.ServerDevice})
		}
		if res, err := s.sync.Apply(ctx, uid, up); err == nil && res.Applied > 0 {
			s.sync.NotifyApplied(res, opsync.ServerDevice)
		}
	}
	return nil
}

// Jobs lists the user's most recent jobs, newest first.
func (s *Service) Jobs(ctx context.Context, uid string) ([]Job, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,profile,status,options_json,totals_json,errors_json,created_at,finished_at,undone_at
		FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		// The list stays light; the full error list is on the job itself.
		if len(j.Errors) > 20 {
			j.Errors = j.Errors[:20]
		}
		out = append(out, *j)
	}
	return out, rows.Err()
}

// Job returns one of the user's jobs or ErrNotFound.
func (s *Service) Job(ctx context.Context, uid, id string) (*Job, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,profile,status,options_json,totals_json,errors_json,created_at,finished_at,undone_at
		FROM import_jobs WHERE user_id = ? AND id = ?`, uid, id)
	j, err := scanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return j, err
}

type scanner interface{ Scan(...any) error }

func scanJob(sc scanner) (*Job, error) {
	var j Job
	var opts, totals, errs string
	var finished, undone sql.NullInt64
	if err := sc.Scan(&j.ID, &j.Format, &j.Status, &opts, &totals, &errs, &j.CreatedAt, &finished, &undone); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(opts), &j.Options)
	_ = json.Unmarshal([]byte(totals), &j.Totals)
	var je jobErrors
	_ = json.Unmarshal([]byte(errs), &je)
	j.Errors, j.Message = capErrors(je.Rows), je.Message
	if finished.Valid {
		j.FinishedAt = &finished.Int64
	}
	if undone.Valid {
		j.UndoneAt = &undone.Int64
	}
	return &j, nil
}

// Undo tombstones every entity the job created (projects, tasks, labels,
// sections, reminders, views), through the op log, and marks the job undone.
// Entities the job only updated are left alone. Like deleting in the app, open
// tasks the user later added to an undone project move to the Inbox, leave an
// undone section, and ids of undone labels are removed from the user's other
// tasks. Undo is idempotent.
func (s *Service) Undo(ctx context.Context, uid, id string) (*Job, error) {
	job, err := s.Job(ctx, uid, id)
	if err != nil {
		return nil, err
	}
	if job.UndoneAt != nil {
		return job, nil
	}
	if err := s.acquire(uid, id); err != nil {
		return nil, err
	}
	defer s.release(uid)
	rows, err := s.db.QueryContext(ctx, `SELECT entity, entity_id FROM import_items WHERE job_id = ? AND action = 'created'`, id)
	if err != nil {
		return nil, err
	}
	undoKinds := []string{KindAttachment, KindTimeEntry, KindReminder, KindTask, KindField, KindSection, KindProject, KindLabel, KindView, KindPlace}
	created := map[string]map[string]bool{}
	for _, k := range undoKinds {
		created[k] = map[string]bool{}
	}
	for rows.Next() {
		var entity, eid string
		if err := rows.Scan(&entity, &eid); err != nil {
			rows.Close()
			return nil, err
		}
		if created[entity] != nil {
			created[entity][eid] = true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	now := s.now().UnixMilli()
	type write struct {
		entity, id, field string
		value             json.RawMessage
	}
	var writes []write
	tl := newTally()
	for _, kind := range undoKinds {
		list, err := s.sync.List(ctx, uid, kind, false)
		if err != nil {
			return nil, err
		}
		for _, e := range list {
			eid := str(e, "id")
			if created[kind][eid] {
				writes = append(writes, write{kind, eid, "deleted_at", raw(now)})
				tl.count(kind, "deleted")
				switch kind {
				case KindProject:
					tl.project(eid)
				case KindTask:
					tl.project(str(e, "project_id"))
				}
				continue
			}
			if kind != KindTask {
				continue
			}
			if pid := str(e, "project_id"); pid != "" && created[KindProject][pid] && isNull(e["completed_at"]) {
				writes = append(writes, write{kind, eid, "project_id", json.RawMessage("null")})
			}
			if sid := str(e, "section_id"); sid != "" && created[KindSection][sid] && isNull(e["completed_at"]) {
				writes = append(writes, write{kind, eid, "section_id", json.RawMessage("null")})
			}
			var labels []string
			_ = json.Unmarshal(e["labels"], &labels)
			kept := slices.DeleteFunc(slices.Clone(labels), func(l string) bool { return created[KindLabel][l] })
			if len(kept) != len(labels) {
				writes = append(writes, write{kind, eid, "labels", raw(nonNil(kept))})
			}
		}
	}
	for start := 0; start < len(writes); start += opsync.MaxOpsPerRequest {
		end := min(start+opsync.MaxOpsPerRequest, len(writes))
		ts := s.opTS()
		ops := make([]opsync.Op, 0, end-start)
		for _, w := range writes[start:end] {
			ops = append(ops, opsync.Op{ID: s.newID(), Entity: w.entity, EntityID: w.id, Field: w.field, Value: w.value, TS: ts, Device: Device})
		}
		res, err := s.sync.Apply(ctx, uid, ops)
		if err != nil {
			return nil, err
		}
		if res.Applied > 0 {
			s.sync.NotifyApplied(res, Device)
		}
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE import_jobs SET status = ?, undone_at = ? WHERE id = ? AND user_id = ?`, StatusUndone, now, id, uid); err != nil {
		return nil, err
	}
	done, err := s.Job(ctx, uid, id)
	if err != nil {
		return nil, err
	}
	s.emit(ctx, Summary{UserID: uid, JobID: id, Event: EventUndone, Format: done.Format, Status: done.Status,
		Totals: done.Totals, Counts: tl.counts, ProjectIDs: tl.projectIDs()})
	return done, nil
}
