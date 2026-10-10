package importer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// opentodoProfile reads the app's own export (`GET /api/v1/export`). Records are
// carried verbatim, ids and tombstones included, so the round trip is exact.
type opentodoProfile struct{}

func (opentodoProfile) Name() string { return "opentodo" }
func (opentodoProfile) Description() string {
	return "OpenTodo JSON export (exact round trip: ids, labels, sub-projects, subtasks, tombstones)"
}

func (opentodoProfile) Detect(data []byte) bool {
	top, ok := topLevel(data)
	if !ok {
		return false
	}
	var format string
	return json.Unmarshal(top["format"], &format) == nil && format == "opentodo-export"
}

func (opentodoProfile) Read(r io.Reader, _ Options) (*Parsed, error) {
	var doc struct {
		Format   string                       `json:"format"`
		Version  int                          `json:"version"`
		Labels   []map[string]json.RawMessage `json:"labels"`
		Projects []map[string]json.RawMessage `json:"projects"`
		Tasks    []map[string]json.RawMessage `json:"tasks"`
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
	out := &Parsed{Version: doc.Version}
	add := func(kind, titleField string, list []map[string]json.RawMessage) {
		for i, e := range list {
			row := Row{Line: i + 1, Kind: kind, Entity: e}
			var id string
			if err := json.Unmarshal(e["id"], &id); err != nil || id == "" {
				row.fail("%s #%d has no id", kind, i+1)
			}
			row.SourceID = id
			_ = json.Unmarshal(e[titleField], &row.Title)
			out.Rows = append(out.Rows, row)
		}
	}
	// Labels and projects first so the preview reads top-down; the op log does not care.
	add(KindLabel, "name", doc.Labels)
	add(KindProject, "name", doc.Projects)
	add(KindTask, "title", doc.Tasks)
	return out, nil
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
