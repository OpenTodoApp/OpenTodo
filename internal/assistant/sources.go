package assistant

import "encoding/json"

// MaxSourceIDs is how many ids a source keeps (assistant-tool-sources D1).
const MaxSourceIDs = 50

// Source is what a read tool returned, as ids only (assistant-tool-sources D1):
// the chat shows it as one line, so rows the model invents cannot pass as data.
type Source struct {
	Of    string   `json:"of"`
	IDs   []string `json:"ids"`
	Total int      `json:"total"`
}

type sourceRow struct {
	ID string `json:"id"`
}

// SourceOf reads the source of a successful read tool's result, the JSON the
// model receives. Other tools, and results it cannot read, have none.
func SourceOf(tool, result string) (Source, bool) {
	var r struct {
		Tasks    []sourceRow `json:"tasks"`
		Task     *sourceRow  `json:"task"`
		Overdue  []sourceRow `json:"overdue"`
		DueToday []sourceRow `json:"due_today"`
		Projects []sourceRow `json:"projects"`
	}
	if json.Unmarshal([]byte(result), &r) != nil {
		return Source{}, false
	}
	var rows []sourceRow
	of := "tasks"
	switch tool {
	case "list_tasks", "search_tasks":
		rows = r.Tasks
	case "get_task":
		if r.Task == nil {
			return Source{}, false
		}
		rows = []sourceRow{*r.Task}
	case "today_summary":
		rows = append(append(rows, r.Overdue...), r.DueToday...)
	case "list_projects":
		of, rows = "projects", r.Projects
	default:
		return Source{}, false
	}
	ids := []string{}
	seen := map[string]bool{}
	for _, row := range rows {
		if !idPattern.MatchString(row.ID) || seen[row.ID] {
			continue
		}
		seen[row.ID] = true
		ids = append(ids, row.ID)
	}
	s := Source{Of: of, Total: len(ids), IDs: ids}
	if len(ids) > MaxSourceIDs {
		s.IDs = ids[:MaxSourceIDs]
	}
	return s, true
}

// source streams what a successful read returned; a failed call or another tool streams nothing.
func (ev Events) source(tool, result string, isErr bool) {
	if ev.Source == nil || isErr {
		return
	}
	if s, ok := SourceOf(tool, result); ok {
		ev.Source(s)
	}
}
