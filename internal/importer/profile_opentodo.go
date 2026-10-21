package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// opentodoProfile reads the app's own export (`GET /api/v1/export`). Records are
// carried verbatim, ids and tombstones included, so the round trip is exact.
type opentodoProfile struct{}

func (opentodoProfile) Name() string { return "opentodo" }
func (opentodoProfile) Description() string {
	return "OpenTodo JSON export (exact round trip: ids, labels, sub-projects, sections, subtasks, recurrence, reminders, views, tombstones)"
}

func (opentodoProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	var format string
	return json.Unmarshal(top["format"], &format) == nil && format == "opentodo-export"
}

func (opentodoProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	var doc struct {
		Format   string                       `json:"format"`
		Version  int                          `json:"version"`
		Labels   []map[string]json.RawMessage `json:"labels"`
		Projects []map[string]json.RawMessage `json:"projects"`
		Tasks    []map[string]json.RawMessage `json:"tasks"`
		Sections []map[string]json.RawMessage `json:"sections"`
		// Fields are custom field definitions (custom-fields); a task's values
		// are its `fields` object, unfolded into `fields.<id>` keys below.
		Fields    []map[string]json.RawMessage `json:"fields"`
		Reminders []map[string]json.RawMessage `json:"reminders"`
		Views     []map[string]json.RawMessage `json:"views"`
		Comments  []json.RawMessage            `json:"comments"`
		// Attachments are file and link metadata (OpenSpec attachments, design D12).
		Attachments []map[string]json.RawMessage `json:"attachments"`
		// TimeEntries are the entries the exporting account could read
		// (time-tracking D11), its own and other members' on shared tasks.
		TimeEntries []map[string]json.RawMessage `json:"time_entries"`
		// Places are the exporting account's saved places (task-locations D1);
		// tasks link to them by id in location.place_id.
		Places []map[string]json.RawMessage `json:"places"`
		// UserID is the exporting account.
		UserID string `json:"userId"`
		// UserPrefs is the exporting account's date and time preferences row
		// (date-time-preferences D1); it is restored like any other record.
		UserPrefs []map[string]json.RawMessage `json:"user_prefs"`
		// Review is when the exporting account last finished a weekly review
		// (stats-and-review D4).
		Review []map[string]json.RawMessage `json:"review"`
		// ProjectPrefs are the exporting account's personal per-project rows
		// (activity-feed D1, open-loops-method D4), keyed by project id.
		ProjectPrefs []map[string]json.RawMessage `json:"project_prefs"`
		// Template marks a template file (project-templates D1); import is unchanged.
		Template *TemplateInfo `json:"template"`
	}
	if err := json.NewDecoder(r).Decode(&doc); err != nil {
		return nil, &FileError{fmt.Sprintf("not a readable OpenTodo export: %v", err)}
	}
	if doc.Format != "opentodo-export" {
		return nil, &FileError{`not an OpenTodo export: "format" must be "opentodo-export"`}
	}
	if doc.Version < 1 {
		return nil, &FileError{fmt.Sprintf("unsupported export version %d", doc.Version)}
	}
	out := &Parsed{Version: doc.Version, Template: doc.Template}
	if doc.Template != nil {
		out.Notes = append(out.Notes, "This file is a template. Importing it creates it once, with its own ids and dates; to start a fresh copy with dates moved to a start day, use From a template in the sidebar.")
	}
	taskTitles := map[string]string{}
	for _, e := range doc.Tasks {
		unfoldFieldValues(e)
		var id, title string
		_ = json.Unmarshal(e["id"], &id)
		_ = json.Unmarshal(e["title"], &title)
		taskTitles[id] = title
	}
	add := func(kind, titleField string, list []map[string]json.RawMessage) {
		for i, e := range list {
			row := Row{Line: i + 1, Kind: kind, Entity: e}
			var id string
			if err := json.Unmarshal(e["id"], &id); err != nil || id == "" {
				row.fail("%s #%d has no id", kind, i+1)
			}
			row.SourceID = id
			_ = json.Unmarshal(e[titleField], &row.Title)
			if kind == KindReminder {
				var task string
				_ = json.Unmarshal(e["task_id"], &task)
				row.Title = "Reminder: " + taskTitles[task]
			}
			if kind == KindUserPrefs {
				row.Title = "Preferences"
			}
			if kind == KindReview {
				row.Title = "Last weekly review"
			}
			if kind == KindTimeEntry {
				var task string
				_ = json.Unmarshal(e["task_id"], &task)
				row.Title = "Time entry: " + taskTitles[task]
			}
			if kind == KindProjectPrefs {
				row.Title = "Project preferences"
			}
			out.Rows = append(out.Rows, row)
		}
	}
	// Dependency order so the preview reads top-down; the op log does not care.
	add(KindLabel, "name", doc.Labels)
	add(KindPlace, "name", doc.Places)
	add(KindProject, "name", doc.Projects)
	add(KindSection, "name", doc.Sections)
	add(KindField, "name", doc.Fields)
	add(KindTask, "title", doc.Tasks)
	add(KindReminder, "", doc.Reminders)
	add(KindView, "name", doc.Views)
	add(KindUserPrefs, "", doc.UserPrefs)
	add(KindReview, "", doc.Review)
	add(KindProjectPrefs, "", doc.ProjectPrefs)
	add(KindAttachment, "name", doc.Attachments)
	add(KindTimeEntry, "", doc.TimeEntries)
	out.ExportedBy = doc.UserID
	if files := countFileAttachments(doc.Attachments); files > 0 && opts.ownFiles == nil {
		out.Notes = append(out.Notes, fmt.Sprintf("%d file %s not imported: the files are in the ZIP export (Settings → Data → Export with files)", files, plural(files, "attachment is", "attachments are")))
	}
	out.Files = opts.ownFiles // Comments cannot be imported faithfully (design D3 of import-completeness):
	// author_id must be the submitting account and creation is rate limited.
	if n := len(doc.Comments); n > 0 {
		out.Notes = append(out.Notes, fmt.Sprintf("%d %s not imported: a comment keeps its author, and the authors in this file are accounts of the exporting instance", n, plural(n, "comment is", "comments are")))
	}
	return out, nil
}

// unfoldFieldValues turns an exported task's `fields` object back into one
// `fields.<id>` key per value, the op field names (custom-fields D3). A value
// whose id is not a valid op field name is left in the object and reported as
// an unknown field by the planner.
func unfoldFieldValues(task map[string]json.RawMessage) {
	raw, ok := task["fields"]
	if !ok {
		return
	}
	var values map[string]json.RawMessage
	if json.Unmarshal(raw, &values) != nil {
		return
	}
	left := map[string]json.RawMessage{}
	for id, v := range values {
		if _, valid := opsync.FieldValueID(opsync.FieldValuePrefix + id); valid {
			task[opsync.FieldValuePrefix+id] = v
		} else {
			left[id] = v
		}
	}
	delete(task, "fields")
	if len(left) > 0 {
		task["fields"], _ = json.Marshal(left)
	}
}

// topLevel decodes a JSON object's keys without decoding the values deeply.
func topLevel(data []byte) (map[string]json.RawMessage, bool) {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || data[0] != '{' {
		return nil, false
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return nil, false
	}
	return top, true
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// countFileAttachments counts the live attachments that are files (not links).
func countFileAttachments(list []map[string]json.RawMessage) int {
	n := 0
	for _, a := range list {
		if isNull(a["url"]) && isNull(a["deleted_at"]) {
			n++
		}
	}
	return n
}
