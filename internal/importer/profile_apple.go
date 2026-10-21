package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// Apple Reminders has no export of its own (OpenSpec change more-importers, D1):
// this profile reads the JSON array the switch guide's Shortcut writes, one object
// per reminder with its list, dates, priority, flag, tags, URL and subtasks. Each
// list becomes a project ("Reminders" goes to the target).

const appleRemindersFormat = "apple-reminders-json"

type appleRemindersProfile struct{}

func (appleRemindersProfile) Name() string { return appleRemindersFormat }
func (appleRemindersProfile) Description() string {
	return "Apple Reminders: the JSON the switch guide's Shortcut writes"
}

// Detect accepts a non-empty array whose every element has identifier and isCompleted.
func (appleRemindersProfile) Detect(data []byte) bool {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || data[0] != '[' {
		return false
	}
	var list []map[string]json.RawMessage
	if json.Unmarshal(data, &list) != nil || len(list) == 0 {
		return false
	}
	for _, o := range list {
		if _, ok := o["identifier"]; !ok {
			return false
		}
		if _, ok := o["isCompleted"]; !ok {
			return false
		}
	}
	return true
}

// applePriority maps Apple's 0 (none), 1–4 (high), 5 (medium), 6–9 (low).
func applePriority(s string) (int, bool) {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	switch {
	case s == "":
		return 0, true
	case err != nil:
		return 0, false
	case n == 0:
		return 4, true
	case n >= 1 && n <= 4:
		return 1, true
	case n == 5:
		return 2, true
	case n >= 6 && n <= 9:
		return 3, true
	}
	return 0, false
}

func (appleRemindersProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	v, err := decodeJSON(r)
	if err != nil {
		return nil, err
	}
	items, ok := v.([]any)
	if !ok {
		return nil, &FileError{"expected a JSON array of reminders"}
	}
	out := &Parsed{}
	loc := opts.Location()
	projects := map[string]string{} // list name → project source id ("" = target)
	n := 0
	notedDefault := false
	project := func(list string) string {
		if src, ok := projects[list]; ok {
			return src
		}
		src := ""
		if list == "" || strings.EqualFold(list, "Reminders") {
			if !notedDefault {
				out.Notes = append(out.Notes, fmt.Sprintf("the list %q is your default list; its reminders go to the target project (the Inbox unless you choose one)", firstNonEmpty(list, "Reminders")))
				notedDefault = true
			}
		} else {
			src = "apple-reminders:list:" + strings.ToLower(list)
			out.Rows = append(out.Rows, Row{Line: n, Kind: KindProject, SourceID: src, Title: list})
		}
		projects[list] = src
		return src
	}
	var walk func(list []any, parent, parentList string)
	walk = func(list []any, parent, parentList string) {
		for _, e := range list {
			n++
			o := asObj(e)
			row := Row{Line: n, Kind: KindTask}
			if o == nil {
				row.fail("reminder #%d is not an object", n)
				out.Rows = append(out.Rows, row)
				continue
			}
			listName := firstNonEmpty(o.str("list"), parentList)
			row.ProjectSourceID = project(listName)
			for _, k := range []string{"identifier", "isCompleted"} {
				if _, ok := o[k]; !ok {
					row.fail("missing %q (the Shortcut writes it for every reminder)", k)
				}
			}
			row.SourceID = "apple-reminders:" + firstNonEmpty(o.str("identifier"), fmt.Sprintf("line:%d", n))
			row.Origin = importedOrigin("apple-reminders", row.SourceID)
			row.Title = o.str("title")
			if row.Title == "" {
				row.fail("title is required")
			}
			row.Description = o.str("notes")
			if parent != "" {
				row.ParentSourceID = parent
			} else if p := o.str("parent"); p != "" {
				row.ParentSourceID = "apple-reminders:" + p
			}
			if p, ok := applePriority(o.str("priority")); ok {
				row.Priority = p
			} else {
				row.warn("priority %q not recognised; imported as p4", o.str("priority"))
			}
			labels := o.names("tags")
			if o.boolean("flagged") {
				labels = append(labels, "flagged")
			}
			row.Labels = dedupeNames(labels)
			if u := o.str("url"); u != "" {
				row.addLink("", u)
			}
			if d := o.str("dueDate"); d != "" {
				if due, err := parseDue(d, loc); err == nil {
					row.Due = due
				} else if t, err := time.Parse("2006-01-02T15:04:05.000Z07:00", d); err == nil {
					t = t.In(loc)
					row.Due = &Due{Date: t.Format("2006-01-02"), Time: t.Format("15:04")}
				} else {
					row.warn("due date %q not understood; imported without a due date", d)
				}
			}
			if o.boolean("isCompleted") {
				row.Completed = true
				if at, err := parseTimestamp(o.str("completionDate"), loc); err == nil {
					row.CompletedAt = at
				}
			}
			if at, err := parseTimestamp(o.str("creationDate"), loc); err == nil {
				row.CreatedAt = at
			}
			out.Rows = append(out.Rows, row)
			walk(asList(o["subtasks"]), row.SourceID, listName)
		}
	}
	walk(items, "", "")
	if len(out.Rows) > MaxRows {
		return nil, ErrTooManyRows
	}
	return out, nil
}
