package agenttools

import (
	"context"
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// ---- search_tasks ----

func (r *Registry) searchTasks(ctx context.Context, userID string, a args) (map[string]any, error) {
	query, err := a.str("query")
	if err != nil {
		return nil, err
	}
	if query == "" {
		return nil, argErr("query: must not be empty")
	}
	includeCompleted, err := a.boolean("include_completed")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	limit, err := a.limit()
	if err != nil {
		return nil, err
	}
	cursor, err := a.str("cursor")
	if err != nil {
		return nil, err
	}
	wsArg, err := a.str("workspace")
	if err != nil {
		return nil, err
	}
	needle := strings.ToLower(query)
	snap, err := r.loadWith(ctx, userID, r.searchReader(userID, needle, wsArg))
	if err != nil {
		return nil, err
	}
	ws, err := snap.resolveWorkspace("workspace", wsArg)
	if err != nil {
		return nil, err
	}
	today := r.today(loc)
	items := snap.searchItems(needle, ws, includeCompleted, loc, today)
	list, next, err := page(items, cursor, limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"tasks": list, "next_cursor": nullable(next), "timezone": loc.String(), "today": today, "server_time": r.serverTime()}, nil
}

// searchItems renders the snapshot's tasks that match a search.
func (snap *snapshot) searchItems(needle, ws string, includeCompleted bool, loc *time.Location, today string) []keyed[taskOut] {
	items := []keyed[taskOut]{}
	labels := searchLabels(snap.labelList, needle)
	for _, t := range snap.tasks {
		if !snap.visible(t, false) || (!includeCompleted && !isOpen(t)) {
			continue
		}
		if ws != "" && snap.partition().Task(str(t, "id")) != ws {
			continue
		}
		if !textMatches(rawStr(t, "title"), needle) && !textMatches(rawStr(t, "description"), needle) && !hasAny(stringList(t, "labels"), labels) {
			continue
		}
		items = append(items, keyed[taskOut]{key: taskKey(t, loc), id: str(t, "id"), v: snap.render(t, loc, today, true)})
	}
	return items
}

// textMatches is search_tasks' rule for one stored text: it holds the
// lower-cased needle, ignoring case. Encrypted content (OpenSpec `e2ee`)
// cannot be searched server-side; the placeholder text must not match either.
func textMatches(stored, needle string) bool {
	if e2ee.IsCiphertext(stored) {
		return false
	}
	return strings.Contains(strings.ToLower(stored), needle)
}

// searchFields are the task fields search_tasks' first pass reads: the text and
// labels it matches, and what rendering a match reads of other tasks (its blockers' state
// and its series' records; a split lineage reads every task).
var searchFields = []string{"title", "description", "labels", "blocked_by", "series_id", "split_from"}

// searchReader narrows search_tasks' snapshot to the tasks its answer can
// depend on (performance-10k: listing every task of a 10,000-task account was
// most of the call). A first pass reads only the searched text of every task
// and keeps those that match in some visible scope, a superset of the matches;
// the snapshot then holds their full records, their blockers and their series'
// records, so filtering and rendering give the same answer as over every task.
// It reads every task instead when the answer can depend on more of them (a
// workspace filter walks parents, a split series reads every task), when a
// relayed call marks content (markers are matched as text), or when too many
// tasks match for the narrowing to pay.
func (r *Registry) searchReader(userID, needle, workspace string) taskReader {
	if workspace != "" || r.mark != nil {
		return nil
	}
	return func(ctx context.Context) ([]opsync.Entity, bool, error) {
		labelRows, err := r.list(ctx, userID, "label", false)
		if err != nil {
			return nil, false, err
		}
		labels := searchLabels(labelRows, needle)
		vals, err := r.sync.FieldValues(ctx, userID, "task", searchFields)
		if err != nil {
			return nil, false, err
		}
		matched := map[string]bool{}
		for _, v := range vals {
			switch v.Field {
			case "title", "description":
				if textMatches(rawText(v.Value), needle) {
					matched[v.EntityID] = true
				}
			case "labels":
				if len(labels) > 0 {
					var ids []string
					_ = json.Unmarshal(v.Value, &ids)
					if hasAny(ids, labels) {
						matched[v.EntityID] = true
					}
				}
			case "split_from":
				if _, ok := opsync.DecodeSplitFrom(v.Value); ok {
					return nil, false, nil
				}
			}
		}
		need := maps.Clone(matched)
		for _, v := range vals {
			switch v.Field {
			case "blocked_by":
				if matched[v.EntityID] {
					var ids []string
					_ = json.Unmarshal(v.Value, &ids)
					for _, id := range ids {
						need[id] = true
					}
				}
			case "series_id":
				if matched[rawText(v.Value)] {
					need[v.EntityID] = true
				}
			}
		}
		if len(need) > opsync.MaxListIDs {
			return nil, false, nil
		}
		tasks, err := r.sync.ListIDs(ctx, userID, "task", false, slices.Collect(maps.Keys(need)))
		return tasks, err == nil, err
	}
}

// rawText is a stored value read as a string, like rawStr ("" when it is not one).
func rawText(raw json.RawMessage) string {
	var v string
	_ = json.Unmarshal(raw, &v)
	return v
}
