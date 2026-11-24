package agenttools

import (
	"encoding/json"
	"strings"
)

// The assignee in create_tasks and update_tasks (OpenSpec change
// mcp-assignee): the member is named by account id, email or name and
// resolved against the task's scope only, so a person outside it can never
// be named. The resulting assignee_id op is checked again by the sync path
// (task-assignment D2), exactly as a REST or device write is.

// assigneeProp is the assignee property of both tools.
var assigneeProp = map[string]any{"type": []string{"string", "null"}, "maxLength": 320,
	"description": "Who the task is assigned to: a member of the task's shared project by account id, email or name, or me; in the Inbox or an unshared project only me. null unassigns."}

// assigneePatch sets patch.assignee_id from an assignee argument for a task in
// project pid ("" for none). null unassigns.
func (snap *snapshot) assigneePatch(p string, c Caller, v json.RawMessage, pid string, patch map[string]json.RawMessage) error {
	if string(v) == "null" {
		patch["assignee_id"] = nullRaw
		return nil
	}
	var who string
	if json.Unmarshal(v, &who) != nil || strings.TrimSpace(who) == "" {
		return argErr(p + "assignee: must be a member's account id, email or name, me, or null")
	}
	id, err := snap.assignee(p, c, pid, strings.TrimSpace(who))
	if err != nil {
		return err
	}
	patch["assignee_id"] = raw(id)
	return nil
}

// newAssignee sets a new task's assignee when its item names one.
func (snap *snapshot) newAssignee(p string, c Caller, it args, pid string, patch map[string]json.RawMessage) error {
	if v, ok := it["assignee"]; ok {
		return snap.assigneePatch(p, c, v, pid, patch)
	}
	return nil
}

// assignee resolves who among the people the task can be assigned to: the
// project's current members in a shared project, the caller alone otherwise.
// An account id matches first, then an email, then a name (both ignoring
// case), then "me".
func (snap *snapshot) assignee(p string, c Caller, pid, who string) (string, error) {
	if snap.scopeKey(pid) == "personal" {
		if who == c.UserID || strings.EqualFold(who, "me") {
			return c.UserID, nil
		}
		return "", argErr(p + "assignee: a task in the Inbox or an unshared project can only be assigned to you (me)")
	}
	members := snap.memberRows[pid]
	for _, m := range members {
		if m.UserID == who {
			return m.UserID, nil
		}
	}
	for _, m := range members {
		if m.Email != "" && strings.EqualFold(m.Email, who) {
			return m.UserID, nil
		}
	}
	var named []string
	for _, m := range members {
		if m.Name != "" && strings.EqualFold(m.Name, who) {
			named = append(named, m.UserID)
		}
	}
	switch {
	case len(named) == 1:
		return named[0], nil
	case len(named) > 1:
		return "", argErr(p + "assignee: several members have that name; use their email or account id")
	case strings.EqualFold(who, "me") && snap.members[pid][c.UserID]:
		return c.UserID, nil
	}
	return "", argErr(p + "assignee: " + who + " is not a member of the task's project")
}
