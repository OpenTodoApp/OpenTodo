package importer

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
)

// Google Tasks: the Tasks.json file of a Google Takeout export (OpenSpec change
// more-importers). Each list becomes a project ("My Tasks" goes to the target),
// an item whose parent names another item its subtask. Google stores due dates
// as midnight UTC with no time meaning, so the date part is used as written.

const googleTasksFormat = "google-tasks-json"

type googleTasksProfile struct{}

func (googleTasksProfile) Name() string { return googleTasksFormat }
func (googleTasksProfile) Description() string {
	return "Google Tasks: Tasks.json from a Google Takeout export"
}

func (googleTasksProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	var kind string
	if json.Unmarshal(top["kind"], &kind) == nil && kind == "tasks#taskLists" {
		return true
	}
	var items []struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal(top["items"], &items) != nil || len(items) == 0 {
		return false
	}
	return items[0].Kind == "tasks#taskList"
}

// googleDefaultList is the list Google creates for every account.
func googleDefaultList(o obj) bool {
	t := strings.ToLower(o.str("title"))
	return t == "my tasks" || o.str("id") == "@default"
}

func (googleTasksProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
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
	deleted := 0
	n := 0
	for li, l := range asList(top["items"]) {
		lo := asObj(l)
		if lo == nil {
			out.Rows = append(out.Rows, Row{Line: li + 1, Kind: KindProject, Err: fmt.Sprintf("list #%d is not an object", li+1)})
			continue
		}
		listName := lo.str("title")
		projSource := ""
		if googleDefaultList(lo) {
			out.Notes = append(out.Notes, fmt.Sprintf("the list %q is your default list; its tasks go to the target project (the Inbox unless you choose one)", firstNonEmpty(listName, "My Tasks")))
		} else {
			projSource = "google-tasks:list:" + firstNonEmpty(lo.str("id"), fmt.Sprintf("#%d", li+1))
			prow := Row{Line: li + 1, Kind: KindProject, SourceID: projSource, Title: listName}
			if listName == "" {
				prow.fail("list #%d has no title", li+1)
			}
			out.Rows = append(out.Rows, prow)
		}
		for ti, t := range asList(lo["items"]) {
			n++
			o := asObj(t)
			row := Row{Line: n, Kind: KindTask, ProjectSourceID: projSource}
			where := fmt.Sprintf("list %q, item %d", firstNonEmpty(listName, "untitled"), ti+1)
			if o == nil {
				row.fail("%s is not an object", where)
				out.Rows = append(out.Rows, row)
				continue
			}
			if o.boolean("deleted") {
				deleted++
				continue
			}
			row.SourceID = "google-tasks:" + firstNonEmpty(o.str("id"), fmt.Sprintf("line:%d", n))
			row.Origin = importedOrigin("google-tasks", row.SourceID)
			row.Title = o.str("title")
			if row.Title == "" {
				row.fail("title is required (%s)", where)
			}
			row.Description = o.str("notes")
			if p := o.str("parent"); p != "" {
				row.ParentSourceID = "google-tasks:" + p
			}
			if d := o.str("due"); d != "" {
				// Midnight UTC with no time meaning: the date part as written.
				if t, err := time.Parse(time.RFC3339Nano, d); err == nil {
					row.Due = &Due{Date: t.UTC().Format("2006-01-02")}
				} else if len(d) >= 10 && validDate(d[:10]) {
					row.Due = &Due{Date: d[:10]}
				} else {
					row.warn("due date %q not understood; imported without a due date", d)
				}
			}
			if strings.EqualFold(o.str("status"), "completed") {
				row.Completed = true
				if c := o.str("completed"); c != "" {
					if at, err := parseTimestamp(c, loc); err == nil {
						row.CompletedAt = at
					}
				}
			}
			for _, link := range asList(o["links"]) {
				lo := asObj(link)
				if lo != nil {
					row.addLink(lo.str("description", "type"), lo.str("link", "url"))
				}
			}
			out.Rows = append(out.Rows, row)
			if len(out.Rows) > MaxRows {
				return nil, ErrTooManyRows
			}
		}
	}
	if deleted > 0 {
		out.Notes = append(out.Notes, fmt.Sprintf("%d deleted %s skipped", deleted, plural(deleted, "item", "items")))
	}
	return out, nil
}

func validDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}
