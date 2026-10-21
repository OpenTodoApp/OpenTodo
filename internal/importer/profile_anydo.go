package importer

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// Any.do has no export of its own (OpenSpec change more-importers, D1): this
// profile reads the JSON of Any.do's account data request (Settings → Privacy →
// Request my data). Categories become projects (the default one goes to the
// target), tasks tasks, a task whose parentGlobalTaskId names another its subtask.
// The file is undocumented and may change; the profile fails soft.

const anydoFormat = "anydo-json"

type anydoProfile struct{}

func (anydoProfile) Name() string { return anydoFormat }
func (anydoProfile) Description() string {
	return "Any.do: the JSON of Any.do's data request"
}

func (anydoProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok || !isArray(top["categories"]) || !isArray(top["tasks"]) {
		return false
	}
	var tasks []map[string]json.RawMessage
	if json.Unmarshal(top["tasks"], &tasks) != nil || len(tasks) == 0 {
		return false
	}
	_, hasCategory := tasks[0]["categoryId"]
	_, hasStatus := tasks[0]["status"]
	return hasCategory && hasStatus
}

var anydoRepeat = map[string]string{
	"TASK_REPEAT_DAY": "every day", "TASK_REPEAT_WEEK": "every week",
	"TASK_REPEAT_MONTH": "every month", "TASK_REPEAT_YEAR": "every year",
}

// anydoInstant reads Unix milliseconds (a number or a numeric string).
func anydoInstant(o obj, keys ...string) (time.Time, bool) {
	s := o.str(keys...)
	if s == "" {
		return time.Time{}, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return time.Time{}, false
	}
	return time.UnixMilli(n), true
}

func (anydoProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	top := asObj(v)
	if top == nil {
		return nil, &FileError{"expected a JSON object"}
	}
	out := &Parsed{}
	loc := opts.Location()
	category := map[string]string{} // category id → project source id ("" = target)
	for i, c := range asList(top["categories"]) {
		o := asObj(c)
		if o == nil {
			continue
		}
		id, name := o.str("id", "globalCategoryId"), o.str("name")
		if o.boolean("isDefault") {
			category[id] = ""
			out.Notes = append(out.Notes, fmt.Sprintf("the list %q is your default list; its tasks go to the target project (the Inbox unless you choose one)", firstNonEmpty(name, "Personal")))
			continue
		}
		src := "anydo:category:" + firstNonEmpty(id, fmt.Sprintf("#%d", i+1))
		category[id] = src
		row := Row{Line: i + 1, Kind: KindProject, SourceID: src, Title: name}
		if name == "" {
			row.fail("list #%d has no name", i+1)
		}
		out.Rows = append(out.Rows, row)
	}
	deleted := 0
	for i, t := range asList(top["tasks"]) {
		o := asObj(t)
		row := Row{Line: i + 1, Kind: KindTask}
		if o == nil {
			row.fail("task #%d is not an object", i+1)
			out.Rows = append(out.Rows, row)
			continue
		}
		status := strings.ToUpper(o.str("status"))
		if status == "DELETED" {
			deleted++
			continue
		}
		row.SourceID = "anydo:" + firstNonEmpty(o.str("globalTaskId", "id"), fmt.Sprintf("line:%d", i+1))
		row.Origin = importedOrigin("anydo", row.SourceID)
		if src, ok := category[o.str("categoryId")]; ok {
			row.ProjectSourceID = src
		}
		row.Title = o.str("title")
		if row.Title == "" {
			row.fail("title is required")
		}
		row.Description = o.str("note")
		if p := o.str("parentGlobalTaskId"); p != "" {
			row.ParentSourceID = "anydo:" + p
		}
		switch strings.ToLower(o.str("priority")) {
		case "high":
			row.Priority = 1
		case "normal", "":
			row.Priority = 4
		default:
			row.warn("priority %q not recognised; imported as p4", o.str("priority"))
		}
		if status == "CHECKED" || status == "DONE" {
			row.Completed = true
			if at, ok := anydoInstant(o, "completionDate", "lastUpdateDate"); ok {
				row.CompletedAt = at.UnixMilli()
			}
		}
		if at, ok := anydoInstant(o, "dueDate"); ok {
			at = at.In(loc)
			row.Due = &Due{Date: at.Format("2006-01-02")}
			if at.Hour() != 0 || at.Minute() != 0 {
				row.Due.Time = at.Format("15:04")
			}
		} else if o.str("dueDate") != "" && o.str("dueDate") != "0" {
			row.warn("due date %q not understood; imported without a due date", o.str("dueDate"))
		}
		if m := o.str("repeatingMethod"); m != "" && m != "TASK_REPEAT_OFF" {
			if rule, ok := anydoRepeat[m]; ok {
				row.Recurrence = rule
			} else {
				row.warn("repeat %q not supported; imported without a rule", m)
			}
		}
		row.Labels = dedupeNames(o.names("tags", "labels"))
		if a := asObj(o["alert"]); a != nil {
			if at, ok := anydoInstant(a, "customTime", "date", "time"); ok {
				row.Reminders = append(row.Reminders, Reminder{Absolute: true, At: at.UnixMilli()})
			} else if !strings.EqualFold(a.str("type"), "NONE") && a.str("type") != "" {
				row.warn("reminder dropped (the alert has no time)")
			}
		}
		if at, ok := anydoInstant(o, "creationDate"); ok {
			row.CreatedAt = at.UnixMilli()
		}
		if o.present("sharedMembers", "members", "assignedTo") {
			row.warn("shared-list members dropped (an import cannot share a task)")
		}
		if o.present("attachments") {
			row.warn("attachments dropped (they are not in the file)")
		}
		if o.present("momentPlan", "moment") {
			row.warn("Any.do moment plan dropped (not supported)")
		}
		out.Rows = append(out.Rows, row)
		if len(out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	if deleted > 0 {
		out.Notes = append(out.Notes, fmt.Sprintf("%d deleted %s skipped", deleted, plural(deleted, "task", "tasks")))
	}
	return out, nil
}
