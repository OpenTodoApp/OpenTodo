package issues

import (
	"encoding/json"
	"hash/fnv"
	"slices"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/origin"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// DevicePrefix marks the ops a connection's polls write: issues:<connection-id>.
const DevicePrefix = opsync.IssuesDevicePrefix

// Device is the op device of one connection's polls.
func Device(connID string) string { return DevicePrefix + connID }

// TruncatedNote ends a description whose issue text did not fit in one synced
// value (cut like an email body, design D7).
const TruncatedNote = "[Issue text truncated: the rest did not fit in the task's notes]"

// TaskID is the id of the task made from an issue of a connection: derived, so
// a repeated or interrupted poll yields one task (design D5).
func TaskID(connID, issueKey string) string {
	return ids.NameID("issue-task", connID+"\x00"+issueKey)
}

// opID derives an op id from the connection, the issue, the field and the
// issue version: the same version applied twice is a duplicate in the log, a
// new version writes new ops.
func opID(connID, issueKey, field string, version int64) string {
	return ids.NameID("issue-op", connID+"\x00"+issueKey+"\x00"+field+"\x00"+strconv.FormatInt(version, 10))
}

// LabelID is the id of a label a connection creates for a user: derived from
// the lower-cased name, so two connections or two polls create one label.
func LabelID(userID, name string) string {
	return ids.NameID("issue-label", userID+"\x00"+strings.ToLower(name))
}

// Description is the issue body as the task's notes: Markdown as stored, cut at
// a rune boundary with TruncatedNote when it would not fit one synced value.
func Description(body string) string {
	return e2ee.FitText(body, opsync.MaxValueBytes, func(b string, cut bool) string {
		if !cut {
			return b
		}
		return strings.TrimRight(b, " \n\t") + "\n\n" + TruncatedNote
	})
}

// Origin is the task's origin for an issue, as task-origin defines it: kind
// issue, the provider, the reference as id and title, the web address as url.
// origin.FromURL recognises github.com and gitlab.com addresses; a self-hosted
// instance's address is still an issue of the connection's provider.
func Origin(provider string, is Issue) (origin.Origin, bool) {
	o, err := origin.FromURL(is.URL, is.Key)
	if err != nil {
		o = origin.Origin{Title: origin.CutTitle(is.Key)}
	}
	o.Kind, o.Provider, o.ID = origin.KindIssue, provider, is.Key
	if o.Validate() != nil {
		return origin.Origin{}, false
	}
	return o, true
}

func jsonOf(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

type field struct {
	name  string
	value json.RawMessage
}

func taskOps(connID string, is Issue, ts int64, fields []field) []opsync.Op {
	out := make([]opsync.Op, 0, len(fields))
	for _, f := range fields {
		out = append(out, opsync.Op{ID: opID(connID, is.Key, f.name, is.UpdatedAt), Entity: "task", EntityID: TaskID(connID, is.Key),
			Field: f.name, Value: f.value, TS: ts, Device: Device(connID)})
	}
	return out
}

// CreateOps are the ops of a new task from an open issue (spec "An issue
// becomes a task"): title, notes, the target project or the Inbox, priority 4,
// no due date, created_at and position, the mapped labels, and the origin.
func CreateOps(c *Connection, is Issue, labelIDs []string, ts, nowMs int64) []opsync.Op {
	now := json.RawMessage(strconv.FormatInt(nowMs, 10))
	fields := []field{
		{"title", jsonOf(strings.TrimSpace(origin.CutTitle(is.Title)))},
		{"description", jsonOf(Description(is.Body))},
		{"priority", json.RawMessage("4")},
		{"created_at", now},
		{"position", now},
	}
	if c.ProjectID != nil && *c.ProjectID != "" {
		fields = append(fields, field{"project_id", jsonOf(*c.ProjectID)})
	}
	if len(labelIDs) > 0 {
		fields = append(fields, field{"labels", jsonOf(labelIDs)})
	}
	if o, ok := Origin(c.Provider, is); ok {
		fields = append(fields, field{"origin", jsonOf(o)})
	}
	return taskOps(c.ID, is, ts, fields)
}

// Change is what following an issue did to its task.
type Change struct {
	Renamed, Completed, Reopened bool
}

// FollowOps are the ops that make a linked task follow its issue (spec "A task
// follows its issue", "The user's edits stand"): each field changes only when
// the issue changed it since the poll last saw it (link), and only when the
// task disagrees. Nothing for a trashed or missing task, never the notes.
// mapped is the issue's labels mapped to label ids (nil when mapping is off).
func FollowOps(c *Connection, is Issue, l *Link, task opsync.Entity, mapped []string, ts int64) ([]opsync.Op, Change) {
	var ch Change
	if task == nil || !nullish(task["deleted_at"]) {
		return nil, ch
	}
	var fields []field
	title := strings.TrimSpace(origin.CutTitle(is.Title))
	if is.Title != l.Title && str(task["title"]) != title {
		fields = append(fields, field{"title", jsonOf(title)})
		ch.Renamed = true
	}
	open := nullish(task["completed_at"])
	switch {
	case is.State == Closed && l.State != Closed && open:
		at := is.ClosedAt
		if at == 0 {
			at = is.UpdatedAt
		}
		fields = append(fields, field{"completed_at", json.RawMessage(strconv.FormatInt(at, 10))})
		ch.Completed = true
	case is.State == Open && l.State == Closed && !open:
		fields = append(fields, field{"completed_at", json.RawMessage("null")})
		ch.Reopened = true
	}
	if c.MapLabels && !sameSet(mapped, l.Labels) {
		var current []string
		_ = json.Unmarshal(task["labels"], &current)
		next := []string{}
		for _, id := range current {
			if !slices.Contains(l.Labels, id) && !slices.Contains(next, id) {
				next = append(next, id)
			}
		}
		for _, id := range mapped {
			if !slices.Contains(next, id) {
				next = append(next, id)
			}
		}
		if !sameSet(next, current) {
			fields = append(fields, field{"labels", jsonOf(next)})
		}
	}
	return taskOps(c.ID, is, ts, fields), ch
}

// labelPalette are the colours a created label gets, picked by the name's hash
// (the importer's palette).
var labelPalette = []string{"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"}

// LabelIndex maps label names to the user's label ids, case-insensitively,
// and plans the creation of missing ones (design D8).
type LabelIndex struct {
	userID, connID string
	byName         map[string]string
	pending        []opsync.Op
}

// NewLabelIndex indexes the user's live labels.
func NewLabelIndex(userID, connID string, labels []opsync.Entity) *LabelIndex {
	ix := &LabelIndex{userID: userID, connID: connID, byName: map[string]string{}}
	for _, l := range labels {
		if !nullish(l["deleted_at"]) {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(str(l["name"])))
		if name == "" {
			continue
		}
		if _, ok := ix.byName[name]; !ok {
			ix.byName[name] = str(l["id"])
		}
	}
	return ix
}

// Resolve returns the ids of names, planning a label for each missing one.
func (ix *LabelIndex) Resolve(names []string, ts, nowMs int64) []string {
	out := []string{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		key := strings.ToLower(n)
		if key == "" {
			continue
		}
		id, ok := ix.byName[key]
		if !ok {
			id = LabelID(ix.userID, n)
			ix.byName[key] = id
			h := fnv.New32a()
			_, _ = h.Write([]byte(key))
			for _, f := range []field{{"name", jsonOf(n)}, {"color", jsonOf(labelPalette[int(h.Sum32()%uint32(len(labelPalette)))])},
				{"created_at", json.RawMessage(strconv.FormatInt(nowMs, 10))}} {
				ix.pending = append(ix.pending, opsync.Op{ID: ids.NameID("issue-label-op", ix.userID+"\x00"+key+"\x00"+f.name), Entity: "label",
					EntityID: id, Field: f.name, Value: f.value, TS: ts, Device: Device(ix.connID)})
			}
		}
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

// Take returns and clears the planned label ops.
func (ix *LabelIndex) Take() []opsync.Op {
	p := ix.pending
	ix.pending = nil
	return p
}

// Matches reports whether an issue carries every label of the filter
// (case-insensitive).
func Matches(f Filter, is Issue) bool {
	for _, want := range f.Labels {
		if !slices.ContainsFunc(is.Labels, func(l string) bool { return strings.EqualFold(l, want) }) {
			return false
		}
	}
	return true
}

func nullish(v json.RawMessage) bool { return len(v) == 0 || string(v) == "null" }

func str(v json.RawMessage) string {
	var s string
	_ = json.Unmarshal(v, &s)
	return s
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for _, x := range a {
		if !slices.Contains(b, x) {
			return false
		}
	}
	return true
}
