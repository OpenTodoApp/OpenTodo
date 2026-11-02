package importer

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"
)

// Tududi has no export, but its whole state is one SQLite file
// (DB_FILE, by default db/production.sqlite3 in its data volume). tududi-db
// reads a copy of it (OpenSpec change migration-everywhere, design D2) the way
// things-db reads Things: a private temporary copy, read-only, with fixed
// queries over Tududi's own tables, deleted afterwards. Verified against the
// database of Tududi 1.14.0.

const tududiFormat = "tududi-db"

// tududiTested names the Tududi versions the mapping was verified against.
const tududiTested = "1.14"

// tududiTables are the tables the import reads; tududiOptional may be missing
// in older databases.
var (
	tududiTables   = []string{"users", "areas", "projects", "tasks", "tags", "tasks_tags", "notes"}
	tududiOptional = []string{"projects_tags", "inbox_items", "comments", "daily_plans", "daily_plan_items", "task_relations", "task_attachments"}
	// tududiColumns are the columns the mapping needs, per table.
	tududiColumns = map[string][]string{
		"users":      {"id", "timezone"},
		"areas":      {"id", "name", "user_id"},
		"projects":   {"id", "uid", "name", "description", "area_id", "user_id"},
		"tags":       {"id", "name"},
		"tasks_tags": {"task_id", "tag_id"},
		"notes":      {"title", "content", "project_id", "user_id"},
		"tasks": {"id", "uid", "name", "note", "status", "priority", "due_date", "due_has_time", "start_date", "project_id",
			"area_id", "parent_task_id", "user_id", "completed_at", "created_at", "updated_at",
			"recurrence_type", "recurrence_interval", "recurrence_end_date", "recurrence_weekday", "recurrence_month_day",
			"recurrence_week_of_month", "completion_based"},
	}
)

type tududiProfile struct{}

func (tududiProfile) Name() string { return tududiFormat }
func (tududiProfile) Description() string {
	return "Tududi: a copy of its SQLite database (production.sqlite3)"
}

// Detect looks for Tududi's table names in the schema text of a SQLite file
// (short names: a long CREATE statement may be split across pages); Read
// checks the tables and columns properly.
func (tududiProfile) Detect(data []byte) bool {
	return bytes.HasPrefix(data, sqliteMagic) && bytes.Contains(data, []byte("tasks_tags")) &&
		bytes.Contains(data, []byte("`areas`")) && bytes.Contains(data, []byte("recurrence_type")) &&
		!bytes.Contains(data, []byte("TMTask"))
}

func tududiUnsupported(why string) error {
	return fmt.Errorf("%w: %s; the import reads databases of Tududi %s", ErrUnsupportedFormat, why, tududiTested)
}

func (tududiProfile) Read(rd io.Reader, opts Options) (*Parsed, error) {
	data, err := io.ReadAll(rd)
	if err != nil {
		return nil, err
	}
	if !bytes.HasPrefix(data, sqliteMagic) {
		return nil, &FileError{"not a SQLite database; upload a copy of Tududi's production.sqlite3"}
	}
	db, err := openSQLiteCopy(data, nil, opts, "tududi")
	if err != nil {
		return nil, err
	}
	defer db.close()
	t := &tududiReader{db: db, opts: opts, loc: opts.Location(), out: &Parsed{}}
	if err := t.check(); err != nil {
		return nil, err
	}
	if err := t.read(); err != nil {
		var fe *FileError
		if errors.As(err, &fe) || errors.Is(err, ErrTooManyRows) {
			return nil, err
		}
		return nil, &FileError{fmt.Sprintf("cannot read the Tududi database: %v", err)}
	}
	return t.out, nil
}

type tududiReader struct {
	db   *sqliteCopy
	opts Options
	loc  *time.Location
	out  *Parsed
	have map[string]bool
	user int64
	line int
}

// check refuses a database that is not Tududi's, or whose tables lack a
// column the mapping reads.
func (t *tududiReader) check() error {
	have, err := t.db.tables()
	if err != nil {
		return err
	}
	t.have = have
	for _, want := range tududiTables {
		if !have[want] {
			return tududiUnsupported(fmt.Sprintf("not a Tududi database (no %s table)", want))
		}
	}
	read := append([]string{}, tududiTables...)
	for _, o := range tududiOptional {
		if have[o] {
			read = append(read, o)
		}
	}
	if err := t.db.plainTables(read, "a Tududi database"); err != nil {
		return err
	}
	for _, table := range tududiTables {
		cols, err := t.db.columns(table)
		if err != nil {
			return err
		}
		for _, c := range tududiColumns[table] {
			if !cols[c] {
				return tududiUnsupported(fmt.Sprintf("the %s table has no %s column", table, c))
			}
		}
	}
	// One account per file: the first user (a single-user install has one).
	var users int
	if err := t.db.conn.QueryRowContext(t.db.ctx, "SELECT COUNT(*), COALESCE(MIN(id), 0) FROM users").Scan(&users, &t.user); err != nil {
		return &FileError{fmt.Sprintf("cannot read the database: %v", err)}
	}
	if users == 0 {
		return &FileError{"the Tududi database has no user"}
	}
	if users > 1 {
		t.out.Notes = append(t.out.Notes, fmt.Sprintf("the database has %d accounts; only the first account's data is imported", users))
	}
	var tz sql.NullString
	_ = t.db.conn.QueryRowContext(t.db.ctx, "SELECT timezone FROM users WHERE id = ?", t.user).Scan(&tz)
	if tz.Valid && tz.String != "" {
		if loc, err := time.LoadLocation(tz.String); err == nil && tz.String != "Local" {
			// Tududi stores a whole-day due date as the end of that day in the account's zone.
			t.loc = loc
		}
	}
	return nil
}

func (t *tududiReader) query(q string, args ...any) (*sql.Rows, error) {
	return t.db.conn.QueryContext(t.db.ctx, q, args...)
}

func (t *tududiReader) read() error {
	if err := t.areas(); err != nil {
		return err
	}
	if err := t.projects(); err != nil {
		return err
	}
	labels, err := t.taskTags()
	if err != nil {
		return err
	}
	comments, err := t.comments()
	if err != nil {
		return err
	}
	today, err := t.todayPlan()
	if err != nil {
		return err
	}
	if err := t.tasks(labels, comments, today); err != nil {
		return err
	}
	if err := t.inbox(); err != nil {
		return err
	}
	return t.counts()
}

func (t *tududiReader) areas() error {
	rows, err := t.query("SELECT id, COALESCE(name, ''), COALESCE(description, '') FROM areas WHERE user_id = ? ORDER BY id", t.user)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name, desc string
		if err := rows.Scan(&id, &name, &desc); err != nil {
			return err
		}
		t.line++
		row := Row{Line: t.line, Kind: KindProject, SourceID: fmt.Sprintf("tududi:area:%d", id), Title: strings.TrimSpace(name), Description: strings.TrimSpace(desc)}
		if row.Title == "" {
			row.fail("area name is required")
		}
		t.out.Rows = append(t.out.Rows, row)
	}
	return rows.Err()
}

// projects reads the projects with their notes appended to the description,
// and their status: a done or cancelled project arrives archived.
func (t *tududiReader) projects() error {
	notes := map[int64][]string{}
	loose := 0
	rows, err := t.query("SELECT COALESCE(project_id, 0), COALESCE(title, ''), COALESCE(content, '') FROM notes WHERE user_id = ? ORDER BY id", t.user)
	if err != nil {
		return err
	}
	for rows.Next() {
		var pid int64
		var title, content string
		if err := rows.Scan(&pid, &title, &content); err != nil {
			rows.Close()
			return err
		}
		if pid == 0 {
			loose++
			continue
		}
		text := strings.TrimSpace(content)
		if title = strings.TrimSpace(title); title != "" {
			text = "## " + title + "\n\n" + text
		}
		notes[pid] = append(notes[pid], strings.TrimSpace(text))
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if loose > 0 {
		t.out.Notes = append(t.out.Notes, fmt.Sprintf("%d %s; copy %s into a project's notes or a note of your own", loose,
			plural(loose, "note without a project is not imported", "notes without a project are not imported"), plural(loose, "it", "them")))
	}
	cols, err := t.db.columns("projects")
	if err != nil {
		return err
	}
	status := "''"
	switch {
	case cols["status"]:
		status = "COALESCE(status, '')"
	case cols["state"]:
		status = "COALESCE(state, '')"
	}
	tagged, err := t.projectTags()
	if err != nil {
		return err
	}
	rows, err = t.query("SELECT id, COALESCE(name, ''), COALESCE(description, ''), COALESCE(area_id, 0), "+status+" FROM projects WHERE user_id = ? ORDER BY id", t.user)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, area int64
		var name, desc, st string
		if err := rows.Scan(&id, &name, &desc, &area, &st); err != nil {
			return err
		}
		t.line++
		row := Row{Line: t.line, Kind: KindProject, SourceID: fmt.Sprintf("tududi:project:%d", id), Title: strings.TrimSpace(name)}
		parts := []string{}
		if d := strings.TrimSpace(desc); d != "" {
			parts = append(parts, d)
		}
		row.Description = strings.Join(append(parts, notes[id]...), "\n\n")
		if area > 0 {
			row.ParentSourceID = fmt.Sprintf("tududi:area:%d", area)
		}
		switch st {
		case "done", "completed", "cancelled":
			row.Archived = true
			row.warn("%s project imported as an archived project", st)
		}
		if tagged[id] {
			row.warn("project tags dropped (projects have no labels; the tasks keep theirs)")
		}
		if row.Title == "" {
			row.fail("project name is required")
		}
		t.out.Rows = append(t.out.Rows, row)
	}
	return rows.Err()
}

// projectTags reports which projects carry tags.
func (t *tududiReader) projectTags() (map[int64]bool, error) {
	out := map[int64]bool{}
	if !t.have["projects_tags"] {
		return out, nil
	}
	rows, err := t.query("SELECT DISTINCT project_id FROM projects_tags")
	if err != nil {
		return out, nil // an unknown layout: the warning is a convenience
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// taskTags returns each task's tag names; Tududi's system tags are kept only
// when a task carries them.
func (t *tududiReader) taskTags() (map[int64][]string, error) {
	rows, err := t.query(`SELECT tt.task_id, COALESCE(g.name, '') FROM tasks_tags tt JOIN tags g ON g.id = tt.tag_id ORDER BY tt.task_id, g.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]string{}
	for rows.Next() {
		var task int64
		var name string
		if err := rows.Scan(&task, &name); err != nil {
			return nil, err
		}
		if name = strings.TrimSpace(name); name != "" {
			out[task] = append(out[task], name)
		}
	}
	return out, rows.Err()
}

// comments returns each task's comments, oldest first.
func (t *tududiReader) comments() (map[int64][]string, error) {
	out := map[int64][]string{}
	if !t.have["comments"] {
		return out, nil
	}
	cols, err := t.db.columns("comments")
	if err != nil || !cols["task_id"] || !cols["body"] || !cols["created_at"] {
		return out, err
	}
	live := ""
	if cols["deleted_at"] {
		live = " WHERE deleted_at IS NULL"
	}
	rows, err := t.query("SELECT task_id, COALESCE(body, ''), COALESCE(created_at, '') FROM comments" + live + " ORDER BY created_at, id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var task int64
		var body, at string
		if err := rows.Scan(&task, &body, &at); err != nil {
			return nil, err
		}
		if body = strings.TrimSpace(body); body == "" {
			continue
		}
		if ms, ok := tududiInstant(at); ok {
			body = "Comment, " + time.UnixMilli(ms).In(t.loc).Format("2006-01-02 15:04") + ":\n" + body
		}
		out[task] = append(out[task], body)
	}
	return out, rows.Err()
}

// todayPlan is the set of tasks on the account's latest Today plan.
func (t *tududiReader) todayPlan() (map[int64]bool, error) {
	out := map[int64]bool{}
	if !t.have["daily_plans"] || !t.have["daily_plan_items"] {
		return out, nil
	}
	rows, err := t.query(`SELECT i.task_id FROM daily_plan_items i JOIN daily_plans p ON p.id = i.daily_plan_id
		WHERE p.user_id = ? AND p.plan_date = (SELECT MAX(plan_date) FROM daily_plans WHERE user_id = ?)`, t.user, t.user)
	if err != nil {
		// A schema this reader does not know: the Today list is a convenience.
		return out, nil
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

type tududiTask struct {
	id, project, area, parent                           sql.NullInt64
	uid, name, note, dueRaw, startRaw, doneRaw, created string
	updated, recType, recEnd                            string
	status                                              int64
	priority, dueHasTime, interval, weekday, monthDay   sql.NullInt64
	weekOfMonth, completionBased, estimate              sql.NullInt64
	weekdays, reminder                                  sql.NullString
}

func (t *tududiReader) tasks(labels, comments map[int64][]string, today map[int64]bool) error {
	cols, err := t.db.columns("tasks")
	if err != nil {
		return err
	}
	opt := func(name, fallback string) string {
		if cols[name] {
			return name
		}
		return fallback
	}
	example := ""
	if cols["example_of"] {
		example = " AND example_of IS NULL"
	}
	q := `SELECT id, COALESCE(uid, ''), COALESCE(name, ''), COALESCE(note, ''), status, priority, COALESCE(due_date, ''), due_has_time,
		COALESCE(start_date, ''), project_id, area_id, parent_task_id, COALESCE(completed_at, ''), COALESCE(created_at, ''), COALESCE(updated_at, ''),
		COALESCE(recurrence_type, 'none'), recurrence_interval, COALESCE(recurrence_end_date, ''), recurrence_weekday, ` +
		opt("recurrence_weekdays", "NULL") + `, recurrence_month_day, recurrence_week_of_month, completion_based, ` +
		opt("estimated_minutes", "NULL") + `, ` + opt("reminder_at", "NULL") + `
		FROM tasks WHERE user_id = ?` + example + ` ORDER BY COALESCE(parent_task_id, 0), "order", id`
	if !cols["order"] {
		q = strings.Replace(q, `, "order", id`, ", id", 1)
	}
	rows, err := t.query(q, t.user)
	if err != nil {
		return err
	}
	defer rows.Close()
	var list []tududiTask
	for rows.Next() {
		var k tududiTask
		if err := rows.Scan(&k.id, &k.uid, &k.name, &k.note, &k.status, &k.priority, &k.dueRaw, &k.dueHasTime, &k.startRaw,
			&k.project, &k.area, &k.parent, &k.doneRaw, &k.created, &k.updated, &k.recType, &k.interval, &k.recEnd,
			&k.weekday, &k.weekdays, &k.monthDay, &k.weekOfMonth, &k.completionBased, &k.estimate, &k.reminder); err != nil {
			return err
		}
		list = append(list, k)
		if len(list) > MaxRows {
			return ErrTooManyRows
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	byID := map[int64]string{}
	for _, k := range list {
		byID[k.id.Int64] = k.uid
	}
	for _, k := range list {
		t.line++
		t.out.Rows = append(t.out.Rows, t.task(k, byID, labels[k.id.Int64], comments[k.id.Int64], today[k.id.Int64]))
	}
	return nil
}

// tududiSource is the source id of a task: its uid, or its row id in a
// database without uids.
func tududiSource(uid string, id int64) string {
	if uid != "" {
		return "tududi:" + uid
	}
	return fmt.Sprintf("tududi:%d", id)
}

func (t *tududiReader) task(k tududiTask, byID map[int64]string, labels, comments []string, today bool) Row {
	row := Row{Line: t.line, Kind: KindTask, SourceID: tududiSource(k.uid, k.id.Int64), Title: strings.TrimSpace(k.name)}
	row.Origin = importedOrigin("tududi", row.SourceID)
	if row.Title == "" {
		row.fail("title is required")
	}
	row.Description = strings.Join(append(nonEmpty(strings.TrimSpace(k.note)), comments...), "\n\n---\n\n")
	switch {
	case k.project.Valid && k.project.Int64 > 0:
		row.ProjectSourceID = fmt.Sprintf("tududi:project:%d", k.project.Int64)
	case k.area.Valid && k.area.Int64 > 0:
		row.ProjectSourceID = fmt.Sprintf("tududi:area:%d", k.area.Int64)
	}
	if k.parent.Valid && k.parent.Int64 > 0 {
		row.ParentSourceID = tududiSource(byID[k.parent.Int64], k.parent.Int64)
	}
	if k.priority.Valid {
		row.Priority = map[int64]int{2: 1, 1: 2, 0: 3}[k.priority.Int64]
	}
	for _, l := range labels {
		switch l {
		case "someday":
			row.Start = "someday"
		case "today":
			today = true
		default:
			row.Labels = append(row.Labels, l)
		}
	}
	if ms, ok := tududiInstant(k.dueRaw); ok {
		d := time.UnixMilli(ms).In(t.loc)
		row.Due = &Due{Date: d.Format("2006-01-02")}
		if k.dueHasTime.Int64 == 1 {
			row.Due.Time = d.Format("15:04")
		}
	}
	if ms, ok := tududiInstant(k.startRaw); ok {
		row.Start = time.UnixMilli(ms).In(t.loc).Format("2006-01-02")
	}
	if k.estimate.Valid && k.estimate.Int64 > 0 {
		row.EstimateMinutes = int(k.estimate.Int64)
	}
	if ms, ok := tududiInstant(k.reminder.String); ok && k.reminder.Valid {
		row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: ms})
	}
	switch k.status {
	case 2, 3, 5: // done, archived, cancelled
		row.Completed = true
		at, ok := tududiInstant(k.doneRaw)
		if !ok {
			at, _ = tududiInstant(k.updated)
		}
		row.CompletedAt = at
		if k.status == 5 {
			row.warn("cancelled in Tududi; imported as completed")
		}
	}
	if today && !row.Completed && row.Due == nil {
		row.Due = &Due{Date: t.opts.exportedAt.In(t.opts.Location()).Format("2006-01-02")}
		row.warn("on Tududi's Today list; imported due on the import date")
	}
	if ms, ok := tududiInstant(k.created); ok {
		row.CreatedAt = ms
	}
	t.recurrence(&row, k)
	return row
}

func nonEmpty(s string) []string {
	if s == "" {
		return nil
	}
	return []string{s}
}

// tududiInstant reads Sequelize's 'YYYY-MM-DD HH:MM:SS.SSS +00:00'.
func tududiInstant(s string) (int64, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	for _, layout := range []string{"2006-01-02 15:04:05.999 -07:00", "2006-01-02 15:04:05 -07:00", time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02"} {
		if tm, err := time.Parse(layout, s); err == nil {
			return tm.UnixMilli(), true
		}
	}
	return 0, false
}

var tududiWeekdays = []string{"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}

// recurrence maps Tududi's recurrence columns onto the rule grammar; what the
// grammar cannot say is dropped with a warning.
func (t *tududiReader) recurrence(row *Row, k tududiTask) {
	n := k.interval.Int64
	if n < 1 {
		n = 1
	}
	every := func(unit string) string {
		if n == 1 {
			return "every " + unit
		}
		return fmt.Sprintf("every %d %ss", n, unit)
	}
	after := k.completionBased.Int64 == 1
	text := ""
	switch k.recType {
	case "", "none":
		return
	case "daily":
		text = every("day")
	case "weekly":
		days := t.weekdays(k)
		switch {
		case len(days) > 0 && n == 1 && !after:
			text = "every " + strings.Join(days, ", ")
		case len(days) > 0:
			text = every("week")
			row.warn("repeat on %s every %d weeks imported as %q", strings.Join(days, ", "), n, text)
		default:
			text = every("week")
		}
	case "monthly":
		switch {
		case k.monthDay.Valid && k.monthDay.Int64 >= 1 && k.monthDay.Int64 <= 31 && n == 1 && !after:
			text = fmt.Sprintf("every %d%s", k.monthDay.Int64, ordinal(int(k.monthDay.Int64)))
		case k.monthDay.Valid && k.monthDay.Int64 < 0 && n == 1 && !after:
			text = "every last day"
		default:
			text = every("month")
		}
	case "monthly_weekday":
		w := k.weekday.Int64
		if n != 1 || after || !k.weekday.Valid || w < 0 || w > 6 {
			text = every("month")
			row.warn("repeat on a weekday of the month imported as %q", text)
			break
		}
		nth := map[int64]string{1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}[k.weekOfMonth.Int64]
		if nth == "" {
			nth = "last"
		}
		text = "every " + nth + " " + tududiWeekdays[w]
	case "monthly_last_day":
		if n != 1 || after {
			text = every("month")
			row.warn("repeat on the last day of the month imported as %q", text)
			break
		}
		text = "every last day"
	case "yearly":
		text = every("year")
	default:
		row.warn("repeat %q not supported; imported without it", k.recType)
		return
	}
	if after && (strings.HasPrefix(text, "every day") || strings.HasSuffix(text, "days") || strings.HasPrefix(text, "every week") ||
		strings.HasSuffix(text, "weeks") || strings.HasPrefix(text, "every month") || strings.HasSuffix(text, "months") || strings.Contains(text, "year")) {
		text += " after completion"
	}
	if ms, ok := tududiInstant(k.recEnd); ok {
		text += " until " + time.UnixMilli(ms).UTC().Format("2006-01-02")
	}
	due := ""
	if row.Due != nil {
		due = row.Due.Date
	}
	rule, err := parseRecurrence(text, due)
	if err != nil || rule == "" {
		row.warn("repeat rule %q not supported; imported without it", text)
		return
	}
	row.Recurrence = rule
}

// weekdays reads recurrence_weekdays (a JSON array, 0 = Sunday) or the older
// single recurrence_weekday.
func (t *tududiReader) weekdays(k tududiTask) []string {
	var nums []int
	if k.weekdays.Valid && strings.TrimSpace(k.weekdays.String) != "" {
		_ = json.Unmarshal([]byte(k.weekdays.String), &nums)
	}
	if len(nums) == 0 && k.weekday.Valid {
		nums = []int{int(k.weekday.Int64)}
	}
	sort.Ints(nums)
	var out []string
	for _, d := range nums {
		if d >= 0 && d <= 6 {
			out = append(out, tududiWeekdays[d])
		}
	}
	return dedupeNames(out)
}

// inbox reads Tududi's capture inbox: each item not yet processed becomes a
// task without a project.
func (t *tududiReader) inbox() error {
	if !t.have["inbox_items"] {
		return nil
	}
	cols, err := t.db.columns("inbox_items")
	if err != nil || !cols["uid"] || !cols["content"] || !cols["user_id"] {
		return err
	}
	title, status := "''", "'added'"
	if cols["title"] {
		title = "COALESCE(title, '')"
	}
	if cols["status"] {
		status = "COALESCE(status, 'added')"
	}
	rows, err := t.query("SELECT uid, "+title+", COALESCE(content, ''), "+status+" FROM inbox_items WHERE user_id = ? ORDER BY id", t.user)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var uid, ttl, content, st string
		if err := rows.Scan(&uid, &ttl, &content, &st); err != nil {
			return err
		}
		if st != "added" {
			continue // already processed into a task or note
		}
		t.line++
		row := Row{Line: t.line, Kind: KindTask, SourceID: "tududi:inbox:" + uid}
		row.Origin = importedOrigin("tududi", row.SourceID)
		row.Title = strings.TrimSpace(ttl)
		content = strings.TrimSpace(content)
		if row.Title == "" {
			row.Title, content = firstLine(content)
		}
		if content != row.Title {
			row.Description = content
		}
		if row.Title == "" {
			row.fail("inbox item is empty")
		}
		t.out.Rows = append(t.out.Rows, row)
	}
	return rows.Err()
}

func firstLine(s string) (string, string) {
	head, rest, _ := strings.Cut(s, "\n")
	return strings.TrimSpace(head), strings.TrimSpace(rest)
}

// counts names what the database holds and the import leaves out.
func (t *tududiReader) counts() error {
	for _, c := range []struct{ table, what string }{
		{"task_relations", "task relations are not imported"},
		{"task_attachments", "attachments are not imported (their files are not in the database)"},
	} {
		if !t.have[c.table] {
			continue
		}
		var n int
		if err := t.db.conn.QueryRowContext(t.db.ctx, "SELECT COUNT(*) FROM "+c.table).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			t.out.Notes = append(t.out.Notes, fmt.Sprintf("%d %s", n, c.what))
		}
	}
	return nil
}
