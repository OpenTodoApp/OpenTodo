package vault

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// TaskNotes support (OpenSpec change vault-tasknotes): a folder of task notes
// kept by the Obsidian plugin TaskNotes, one task per note with its fields in
// the frontmatter, linked to a vault with `ot vault tasknotes <folder>`.

// tnSettingsFile is TaskNotes' settings file inside an Obsidian vault.
const tnSettingsFile = ".obsidian/plugins/tasknotes/data.json"

// TNStatus is one status of the TaskNotes settings.
type TNStatus struct {
	Value       string `json:"value"`
	IsCompleted bool   `json:"isCompleted"`
}

// TNPriority is one priority of the TaskNotes settings.
type TNPriority struct {
	Value  string  `json:"value"`
	Weight float64 `json:"weight"`
}

// TNSettings is the part of TaskNotes' settings the vault reads (design D3).
type TNSettings struct {
	FieldMapping         map[string]string
	Statuses             []TNStatus
	Priorities           []TNPriority
	DefaultStatus        string
	DefaultPriority      string
	TaskTag              string
	IdentificationMethod string // "tag" or "property"
	PropertyName         string
	PropertyValue        string
	StoreTitleInFilename bool
	// Source is the settings file read, "" for the defaults.
	Source string
}

// tnDefaultMapping is TaskNotes' default field mapping (the keys the vault
// maps or preserves), as in @tasknotes/model's DEFAULT_FIELD_MAPPING.
var tnDefaultMapping = map[string]string{
	"title": "title", "status": "status", "priority": "priority", "due": "due", "scheduled": "scheduled",
	"contexts": "contexts", "projects": "projects", "timeEstimate": "timeEstimate", "completedDate": "completedDate",
	"dateCreated": "dateCreated", "dateModified": "dateModified", "recurrence": "recurrence",
	"recurrenceAnchor": "recurrence_anchor", "archiveTag": "archived", "timeEntries": "timeEntries",
	"completeInstances": "complete_instances", "skippedInstances": "skipped_instances", "blockedBy": "blockedBy",
	"reminders": "reminders",
}

// DefaultTNSettings are TaskNotes' documented defaults, used without a
// settings file.
func DefaultTNSettings() *TNSettings {
	m := map[string]string{}
	for k, v := range tnDefaultMapping {
		m[k] = v
	}
	return &TNSettings{
		FieldMapping:  m,
		Statuses:      []TNStatus{{Value: "none"}, {Value: "open"}, {Value: "in-progress"}, {Value: "done", IsCompleted: true}},
		Priorities:    []TNPriority{{Value: "none", Weight: 0}, {Value: "low", Weight: 1}, {Value: "normal", Weight: 2}, {Value: "high", Weight: 3}},
		DefaultStatus: "open", DefaultPriority: "normal", TaskTag: "task", IdentificationMethod: "tag",
		StoreTitleInFilename: true,
	}
}

// SettingsError is a TaskNotes settings file that does not parse: the sync
// stops before any write or push.
type SettingsError struct {
	Path string
	Err  error
}

func (e *SettingsError) Error() string {
	return fmt.Sprintf("the TaskNotes settings %s are not valid JSON: %v", e.Path, e.Err)
}

// FindTNSettings walks up from dir to the first folder holding `.obsidian/`
// and returns its TaskNotes settings file ("" when there is none).
func FindTNSettings(dir string) string {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return ""
	}
	for cur := abs; ; {
		if fi, err := os.Stat(filepath.Join(cur, ".obsidian")); err == nil && fi.IsDir() {
			p := filepath.Join(cur, filepath.FromSlash(tnSettingsFile))
			if _, err := os.Stat(p); err == nil {
				return p
			}
			return ""
		}
		next := filepath.Dir(cur)
		if next == cur {
			return ""
		}
		cur = next
	}
}

// HasTaskNotes reports whether dir lies inside an Obsidian vault with
// TaskNotes installed (the hint of `ot vault init`).
func HasTaskNotes(dir string) bool {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return false
	}
	for cur := abs; ; {
		if fi, err := os.Stat(filepath.Join(cur, ".obsidian", "plugins", "tasknotes")); err == nil && fi.IsDir() {
			return true
		}
		next := filepath.Dir(cur)
		if next == cur {
			return false
		}
		cur = next
	}
}

// LoadTNSettings reads the settings found above dir. Without a file it
// returns the defaults and found=false; a file that is not JSON is a
// SettingsError. Fields are read one by one and a field of an unexpected
// shape keeps its default, so a newer TaskNotes never breaks the sync.
func LoadTNSettings(dir string) (s *TNSettings, found bool, err error) {
	s = DefaultTNSettings()
	p := FindTNSettings(dir)
	if p == "" {
		return s, false, nil
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return nil, false, &SettingsError{Path: p, Err: err}
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, false, &SettingsError{Path: p, Err: err}
	}
	s.Source = p
	var fm map[string]any
	if json.Unmarshal(top["fieldMapping"], &fm) == nil {
		for k, v := range fm {
			if str, ok := v.(string); ok && strings.TrimSpace(str) != "" {
				s.FieldMapping[k] = strings.TrimSpace(str)
			}
		}
	}
	var sts []TNStatus
	if json.Unmarshal(top["customStatuses"], &sts) == nil {
		var keep []TNStatus
		for _, st := range sts {
			if st.Value != "" {
				keep = append(keep, st)
			}
		}
		if len(keep) > 0 {
			s.Statuses = keep
		}
	}
	var prs []TNPriority
	if json.Unmarshal(top["customPriorities"], &prs) == nil {
		var keep []TNPriority
		for _, pr := range prs {
			if pr.Value != "" {
				keep = append(keep, pr)
			}
		}
		if len(keep) > 0 {
			s.Priorities = keep
		}
	}
	str := func(key string, dst *string) {
		var v string
		if json.Unmarshal(top[key], &v) == nil && strings.TrimSpace(v) != "" {
			*dst = strings.TrimSpace(v)
		}
	}
	str("defaultTaskStatus", &s.DefaultStatus)
	str("defaultTaskPriority", &s.DefaultPriority)
	str("taskTag", &s.TaskTag)
	str("taskIdentificationMethod", &s.IdentificationMethod)
	str("taskPropertyName", &s.PropertyName)
	str("taskPropertyValue", &s.PropertyValue)
	var b bool
	if json.Unmarshal(top["storeTitleInFilename"], &b) == nil {
		s.StoreTitleInFilename = b
	}
	s.TaskTag = strings.TrimPrefix(s.TaskTag, "#")
	return s, true, nil
}

// key is the frontmatter key of a TaskNotes field.
func (s *TNSettings) key(field string) string {
	if k := s.FieldMapping[field]; k != "" {
		return k
	}
	return tnDefaultMapping[field]
}

// completed reports a status TaskNotes counts as completed.
func (s *TNSettings) completed(status string) bool {
	for _, st := range s.Statuses {
		if strings.EqualFold(st.Value, status) {
			return st.IsCompleted
		}
	}
	return false
}

// doneStatus is the status written for a completed task: the first status
// marked completed.
func (s *TNSettings) doneStatus() string {
	for _, st := range s.Statuses {
		if st.IsCompleted {
			return st.Value
		}
	}
	return "done"
}

// openStatus is the status written for a reopened task.
func (s *TNSettings) openStatus() string {
	if s.DefaultStatus != "" && !s.completed(s.DefaultStatus) {
		return s.DefaultStatus
	}
	for _, st := range s.Statuses {
		if !st.IsCompleted {
			return st.Value
		}
	}
	return "open"
}

// above lists the priorities ranked above the default, highest weight first.
// A default the settings do not list counts as the lowest weight.
func (s *TNSettings) above() []TNPriority {
	dw, found := 0.0, false
	for _, p := range s.Priorities {
		if strings.EqualFold(p.Value, s.DefaultPriority) {
			dw, found = p.Weight, true
		}
	}
	if !found {
		for i, p := range s.Priorities {
			if i == 0 || p.Weight < dw {
				dw = p.Weight
			}
		}
	}
	var out []TNPriority
	for _, p := range s.Priorities {
		if p.Weight > dw {
			out = append(out, p)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Weight > out[j].Weight })
	return out
}

// priorityOf maps a TaskNotes priority to 1–4 (design D5): the priorities
// above the default, highest first, are 1, 2 and 3 (any further are 3); the
// default and everything below it, or a value the settings do not know, are 4.
func (s *TNSettings) priorityOf(value string) int {
	for i, p := range s.above() {
		if strings.EqualFold(p.Value, value) {
			return min(i+1, 3)
		}
	}
	return 4
}

// priorityValue is the TaskNotes priority written for 1–4: the highest-weight
// value that maps to the number, else the nearest level above it, else the
// default.
func (s *TNSettings) priorityValue(n int) string {
	if n >= 4 || n < 1 {
		return s.DefaultPriority
	}
	ab := s.above()
	for want := n; want >= 1; want-- {
		for i, p := range ab {
			if min(i+1, 3) == want {
				return p.Value
			}
		}
	}
	return s.DefaultPriority
}

// isTaskNote reports whether TaskNotes counts a note as a task, by its task
// tag (also a nested `task/…` tag) or by its task property.
func (s *TNSettings) isTaskNote(f *Front) bool {
	if s.IdentificationMethod == "property" && s.PropertyName != "" {
		k := f.get(s.PropertyName)
		if k == nil {
			return false
		}
		vals := k.List
		if k.Kind == kindScalar {
			vals = []string{k.Scalar}
		}
		for _, v := range vals {
			if s.PropertyValue == "" || strings.EqualFold(strings.TrimSpace(v), s.PropertyValue) {
				return true
			}
		}
		return false
	}
	tag := strings.ToLower(s.TaskTag)
	for _, t := range f.strings("tags") {
		t = strings.ToLower(normTag(t))
		if t == tag || strings.HasPrefix(t, tag+"/") {
			return true
		}
	}
	return false
}

// archived reports a note carrying TaskNotes' archive tag.
func (s *TNSettings) archived(f *Front) bool {
	at := strings.ToLower(normTag(s.key("archiveTag")))
	if at == "" {
		return false
	}
	for _, t := range f.strings("tags") {
		if strings.ToLower(normTag(t)) == at {
			return true
		}
	}
	return false
}

// normTag is a tag as TaskNotes compares it: no `#`, spaces as `-`.
func normTag(t string) string {
	t = strings.TrimSpace(t)
	t = strings.TrimSpace(strings.TrimPrefix(t, "#"))
	return strings.Join(strings.Fields(t), "-")
}

// errNoFolder is a linked folder that is gone.
var errNoFolder = errors.New("the linked TaskNotes folder is missing")

// Link refusals of `ot vault tasknotes` (exit 2).
var (
	ErrNotFolder   = errors.New("not a folder")
	ErrInsideVault = errors.New("inside the vault folder")
	ErrIsVault     = errors.New("the vault folder itself")
)

// LinkTaskNotes links a TaskNotes folder to the vault in vaultDir (design D1).
// A folder below the vault folder needs inside: older ot binaries would read
// its notes as project files. Linking the folder already linked keeps what
// the vault knows about its notes. It returns the stored folder.
func LinkTaskNotes(vaultDir, folder string, inside bool) (string, error) {
	st, err := LoadState(vaultDir)
	if err != nil {
		return "", err
	}
	fi, err := os.Stat(folder)
	if err != nil || !fi.IsDir() {
		return "", fmt.Errorf("%s: %w", folder, ErrNotFolder)
	}
	vabs, err := filepath.Abs(vaultDir)
	if err != nil {
		return "", err
	}
	nabs, err := filepath.Abs(folder)
	if err != nil {
		return "", err
	}
	if ev, err := filepath.EvalSymlinks(vabs); err == nil {
		vabs = ev
	}
	if ev, err := filepath.EvalSymlinks(nabs); err == nil {
		nabs = ev
	}
	stored := nabs
	rel, err := filepath.Rel(vabs, nabs)
	switch {
	case err == nil && rel == ".":
		return "", fmt.Errorf("%s: %w", folder, ErrIsVault)
	case err == nil && !strings.HasPrefix(rel, ".."):
		if !inside {
			return "", fmt.Errorf("%s: %w", folder, ErrInsideVault)
		}
		stored = filepath.ToSlash(rel)
	}
	if st.TaskNotes != nil && st.TaskNotes.Folder == stored {
		return stored, nil
	}
	st.TaskNotes = &TaskNotesState{Folder: stored, Notes: map[string]string{}, Hashes: map[string]string{}, Archived: map[string]bool{}}
	return stored, st.Save(vaultDir)
}

// UnlinkTaskNotes unlinks the TaskNotes folder; the notes keep their ids and
// their tasks stay in the account. It reports whether one was linked.
func UnlinkTaskNotes(vaultDir string) (bool, error) {
	st, err := LoadState(vaultDir)
	if err != nil {
		return false, err
	}
	if st.TaskNotes == nil {
		return false, nil
	}
	st.TaskNotes = nil
	// Every project file is printed again on the next sync, so the tasks that
	// lived in notes come back as lines.
	st.Initialized = false
	return true, st.Save(vaultDir)
}

// IsNoFolder reports the error of a sync whose linked folder is gone.
func IsNoFolder(err error) bool { return errors.Is(err, errNoFolder) }
