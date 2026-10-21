package importer

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Imported custom fields (OpenSpec change more-importers, design D3): typed values
// a named profile reads beyond the task model become custom field values of the
// task's project. A project's live definition of the same name and type is
// reused; otherwise the import creates one, recorded with the job so undo removes
// it. Fields belong to a project, so a task in the Inbox gets none.

// Limits of a definition the import may create (custom-fields, "Typed values and
// their limits"); a choice that would exceed them is created as a text field.
const (
	maxImportedOptions   = 50
	maxImportedOptionLen = 100
	maxImportedFieldName = 100
)

// plannedField is a definition this import creates.
type plannedField struct {
	id, project, name, typ string
	options                []string
	refused                bool // the project is at its limit: nothing is created
	row                    int  // first row that needs it
}

type fieldTarget struct {
	def     opsync.Entity // an existing definition, or nil
	planned *plannedField
}

// customFields plans the definitions and values of rows carrying Fields, after
// every task has its project.
func (fp *foreignPlan) customFields() {
	pl := fp.pl
	existing := map[string]opsync.Entity{} // project NUL lower name → live definition
	live := map[string]int{}               // project → live definitions
	for _, e := range pl.st.Fields {
		if e.Deleted() {
			continue
		}
		p := str(e, "project_id")
		live[p]++
		existing[fieldKey(p, str(e, "name"))] = e
	}
	planned := map[string]*plannedField{}
	var order []*plannedField
	type pending struct {
		row   int
		field *plannedField
		value any
	}
	var waiting []pending

	// The choice options of a definition to create are the values the file shows
	// for it, in first-seen order, so they are collected before any value is written.
	for i, row := range fp.rows {
		if row.Kind != KindTask || len(row.Fields) == 0 || fp.taskChanges[i] == nil {
			continue
		}
		res := &pl.results[i]
		project := fp.plans[i].projectID
		if project == "" {
			res.Warnings = append(res.Warnings, fmt.Sprintf("custom field values dropped (%s): fields belong to a project and this task is in the Inbox", fieldNames(row.Fields)))
			continue
		}
		for _, fv := range row.Fields {
			name := strings.TrimSpace(fv.Name)
			if name == "" || fv.Value == nil {
				continue
			}
			if utf8.RuneCountInString(name) > maxImportedFieldName {
				res.Warnings = append(res.Warnings, fmt.Sprintf("field %q dropped (a field name has at most %d characters)", truncateRunes(name, 40), maxImportedFieldName))
				continue
			}
			key := fieldKey(project, name)
			t := fieldTarget{def: existing[key], planned: planned[key]}
			if t.def == nil && t.planned == nil {
				pf := &plannedField{project: project, name: name, typ: fv.Type, row: i}
				if live[project]+countPlanned(order, project) >= opsync.MaxFieldsPerProject {
					pf.refused = true
				}
				planned[key], t.planned = pf, pf
				order = append(order, pf)
			}
			if t.def != nil {
				var typ string
				_ = json.Unmarshal(t.def["type"], &typ)
				if typ != fv.Type && !(typ == FieldText && fv.Type == FieldChoice) {
					res.Warnings = append(res.Warnings, fmt.Sprintf("field %q exists with another type (%s); value dropped", name, typ))
					continue
				}
				value, _ := json.Marshal(fv.Value)
				if reason := opsync.CheckFieldValue(t.def, value); reason != "" {
					res.Warnings = append(res.Warnings, fmt.Sprintf("field %q: value dropped (%s)", name, reason))
					continue
				}
				fp.taskChanges[i].fields = append(fp.taskChanges[i].fields, field{opsync.FieldValuePrefix + str(t.def, "id"), value})
				continue
			}
			pf := t.planned
			if pf.refused {
				res.Warnings = append(res.Warnings, fmt.Sprintf("field %q not created: the project already has %d fields; value dropped", name, opsync.MaxFieldsPerProject))
				continue
			}
			if pf.typ != fv.Type {
				res.Warnings = append(res.Warnings, fmt.Sprintf("field %q holds %s values in an earlier row; this %s value is dropped", name, pf.typ, fv.Type))
				continue
			}
			if pf.typ == FieldChoice {
				if s, _ := fv.Value.(string); s != "" && !containsFold(pf.options, s) {
					pf.options = append(pf.options, s)
				}
			}
			waiting = append(waiting, pending{row: i, field: pf, value: fv.Value})
		}
	}
	for _, pf := range order {
		if pf.refused {
			continue
		}
		if pf.typ == FieldChoice && !choiceFits(pf.options) {
			pf.typ, pf.options = FieldText, nil
		}
		pf.id = pl.newID()
		fields := []field{
			{"name", raw(pf.name)},
			{"project_id", raw(pf.project)},
			{"type", raw(pf.typ)},
			{"options", raw(strings.Join(pf.options, "\n"))},
			{"position", raw(pl.nextPosition())},
			{"created_at", raw(pl.now)},
		}
		if err := validateFields(KindField, pf.id, fields); err != nil {
			pf.refused = true
			pl.results[pf.row].Warnings = append(pl.results[pf.row].Warnings, fmt.Sprintf("field %q not created: %v", pf.name, err))
			continue
		}
		fp.fieldChanges = append(fp.fieldChanges, &change{entity: KindField, id: pf.id, fields: fields, created: true})
	}
	for _, w := range waiting {
		pf := w.field
		if pf.refused {
			continue
		}
		value, _ := json.Marshal(w.value)
		def := opsync.Entity{"type": raw(pf.typ), "options": raw(strings.Join(pf.options, "\n"))}
		if pf.typ == FieldText {
			if s, ok := w.value.(string); ok {
				value, _ = json.Marshal(s)
			}
		}
		if reason := opsync.CheckFieldValue(def, value); reason != "" {
			res := &pl.results[w.row]
			res.Warnings = append(res.Warnings, fmt.Sprintf("field %q: value dropped (%s)", pf.name, reason))
			continue
		}
		fp.taskChanges[w.row].fields = append(fp.taskChanges[w.row].fields, field{opsync.FieldValuePrefix + pf.id, value})
	}
}

func fieldKey(project, name string) string {
	return project + "\x00" + strings.ToLower(strings.TrimSpace(name))
}

func countPlanned(order []*plannedField, project string) int {
	n := 0
	for _, pf := range order {
		if pf.project == project && !pf.refused {
			n++
		}
	}
	return n
}

func choiceFits(options []string) bool {
	if len(options) == 0 || len(options) > maxImportedOptions {
		return false
	}
	for _, o := range options {
		if utf8.RuneCountInString(o) > maxImportedOptionLen || strings.Contains(o, "\n") {
			return false
		}
	}
	return true
}

func containsFold(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func fieldNames(list []FieldValue) string {
	names := make([]string, 0, len(list))
	for _, f := range list {
		names = append(names, f.Name)
	}
	return strings.Join(names, ", ")
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
