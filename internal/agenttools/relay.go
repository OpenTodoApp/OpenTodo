package agenttools

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/relay"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Content through an opted-in device (OpenSpec change mcp-device-relay, design
// D1, security review R6). For an encrypted account whose transport found an
// opted-in device, every tool runs as for an unencrypted account except:
//   - reads: ciphertext is replaced by markers while loading, the tool runs,
//     and only the values whose markers appear in the result are sent to the
//     device to decrypt; the markers are then replaced by the plaintext (or the
//     placeholder when the device could not decrypt one);
//   - writes: the planned operations' content values are sent to the device to
//     encrypt, with their exact entity, id and field, before Apply.
// Relayed plaintext lives only in this call's memory.

// Relay is the transport's link to the account's opted-in devices.
type Relay interface {
	Do(ctx context.Context, op relay.Op, items []relay.Item, call relay.Call) ([]relay.Result, error)
}

// unmarkable content fields: not shown as text by any tool (documents, the
// iCalendar extras, structured values), so they keep the placeholder.
var unmarkable = map[string]bool{"task.notes_doc": true, "project.notes_doc": true, "task.ical_extra": true, "task.origin": true, "field.options": true}

// marker collects the ciphertext values one read call loaded.
type marker struct {
	items []relay.Item
	index map[string]int
}

const markOpen, markClose = "R", ""

var markRe = regexp.MustCompile("R([0-9a-z]*)?")

// mark returns the marker standing for a loaded ciphertext value.
func (m *marker) mark(entity, id, field, value string) string {
	if m.index == nil {
		m.index = map[string]int{}
	}
	k := entity + "\x00" + id + "\x00" + field
	i, ok := m.index[k]
	if !ok {
		i = len(m.items)
		m.index[k] = i
		m.items = append(m.items, relay.Item{Entity: entity, ID: id, Field: field, Value: value})
	}
	return markOpen + strconv.FormatInt(int64(i), 36) + markClose
}

// marked copies entities, replacing their ciphertext content values by markers.
func (m *marker) marked(entity string, list []opsync.Entity) []opsync.Entity {
	out := make([]opsync.Entity, len(list))
	for i, e := range list {
		out[i] = m.markOne(entity, e)
	}
	return out
}

func (m *marker) markOne(entity string, e opsync.Entity) opsync.Entity {
	if e == nil {
		return nil
	}
	id := rawStr(e, "id")
	var cp opsync.Entity
	for k, raw := range e {
		if !e2ee.IsContentField(entity, k) || unmarkable[entity+"."+k] || !e2ee.IsCiphertextJSON(raw) {
			continue
		}
		var v string
		if json.Unmarshal(raw, &v) != nil {
			continue
		}
		if cp == nil {
			cp = make(opsync.Entity, len(e))
			for k2, v2 := range e {
				cp[k2] = v2
			}
		}
		cp[k], _ = json.Marshal(m.mark(entity, id, k, v))
	}
	if cp == nil {
		return e
	}
	return cp
}

// list, get and taskComments are the registry's reads of the sync service; a
// relayed read call marks what they return.
func (r *Registry) list(ctx context.Context, userID, entity string, includeDeleted bool) ([]opsync.Entity, error) {
	out, err := r.sync.List(ctx, userID, entity, includeDeleted)
	if err != nil || r.mark == nil {
		return out, err
	}
	return r.mark.marked(entity, out), nil
}

func (r *Registry) get(ctx context.Context, userID, entity, id string) (opsync.Entity, error) {
	out, err := r.sync.Get(ctx, userID, entity, id)
	if err != nil || r.mark == nil {
		return out, err
	}
	return r.mark.markOne(entity, out), nil
}

func (r *Registry) taskComments(ctx context.Context, userID, taskID string) ([]opsync.Entity, error) {
	out, err := r.sync.TaskComments(ctx, userID, taskID)
	if err != nil || r.mark == nil {
		return out, err
	}
	return r.mark.marked("comment", out), nil
}

// relayed reports whether this caller's content goes through a device.
func (c Caller) relayed() bool { return c.Encrypted && c.Relay != nil }

func relayCall(c Caller, tool string, write bool) relay.Call {
	return relay.Call{Tool: tool, Token: c.TokenName, Write: write}
}

// relayRead runs a read tool with markers and has the device decrypt exactly
// the values its result shows.
func (r *Registry) relayRead(ctx context.Context, c Caller, name string, rawArgs json.RawMessage) (Plan, error) {
	rc := *r
	rc.mark = &marker{}
	p, err := rc.Plan(ctx, c, name, rawArgs, nil)
	if err != nil {
		return p, err
	}
	raw, err := json.Marshal(p.Result)
	if err != nil {
		return p, err
	}
	text := string(raw)
	var items []relay.Item
	var order []int
	seen := map[int]bool{}
	for _, m := range markRe.FindAllStringSubmatch(text, -1) {
		if !strings.HasSuffix(m[0], markClose) {
			continue
		}
		i, err := strconv.ParseInt(m[1], 36, 64)
		if err != nil || int(i) >= len(rc.mark.items) || seen[int(i)] {
			continue
		}
		seen[int(i)] = true
		order = append(order, int(i))
		items = append(items, rc.mark.items[i])
	}
	plain := map[int]string{}
	if len(items) > 0 {
		res, err := c.Relay.Do(ctx, relay.Decrypt, items, relayCall(c, name, false))
		if err != nil {
			return Plan{}, relayToolErr(err)
		}
		for k, i := range order {
			if k < len(res) && res[k].Error == "" {
				plain[i] = res[k].Value
			}
		}
	}
	text = markRe.ReplaceAllStringFunc(text, func(m string) string {
		v := e2ee.Placeholder
		if strings.HasSuffix(m, markClose) {
			if i, err := strconv.ParseInt(markRe.FindStringSubmatch(m)[1], 36, 64); err == nil {
				if s, ok := plain[int(i)]; ok {
					v = s
				}
			}
		}
		esc, _ := json.Marshal(v)
		return string(esc[1 : len(esc)-1])
	})
	var out map[string]any
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return Plan{}, err
	}
	p.Result = out
	return p, nil
}

// relayEncrypt has the device encrypt every plaintext content value of the
// planned changes, bound to its entity, id and field, and puts the envelopes
// in place. An envelope already in the plan is kept as given.
func relayEncrypt(ctx context.Context, c Caller, name string, cs ChangeSet) error {
	type ref struct {
		change int
		field  string
	}
	var items []relay.Item
	var refs []ref
	for i, ch := range cs {
		for field, raw := range ch.Patch {
			if !e2ee.IsContentField(ch.Entity, field) {
				continue
			}
			var v any
			if json.Unmarshal(raw, &v) != nil || v == nil {
				continue
			}
			var plain string
			switch t := v.(type) {
			case string:
				if e2ee.IsEnvelope(t) {
					continue
				}
				plain = t
			case map[string]any:
				plain = string(raw) // an object-valued field (task.origin) is encrypted as its JSON
			default:
				continue // numbers and booleans of custom fields stay plaintext
			}
			items = append(items, relay.Item{Entity: ch.Entity, ID: ch.EntityID, Field: field, Value: plain})
			refs = append(refs, ref{i, field})
		}
	}
	if len(items) == 0 {
		return nil
	}
	res, err := c.Relay.Do(ctx, relay.Encrypt, items, relayCall(c, name, true))
	if err != nil {
		return relayToolErr(err)
	}
	for k, rf := range refs {
		if k >= len(res) || res[k].Error != "" || !e2ee.IsEnvelope(res[k].Value) {
			return relayToolErr(&relay.Error{Code: relay.CodeUnavailable})
		}
		cs[rf.change].Patch[rf.field], _ = json.Marshal(res[k].Value)
	}
	return nil
}

// relayToolErr turns a relay error into the tool error an assistant sees.
func relayToolErr(err error) error {
	var re *relay.Error
	if !errors.As(err, &re) {
		return err
	}
	switch re.Code {
	case relay.CodeUnavailable:
		return toolErr(re.Code, "no device that answers AI connectors is online: open OpenTodo on a device where \"Answer AI connectors from this device\" is on, and unlock it")
	case relay.CodeTimeout:
		return toolErr(re.Code, "the user's device did not answer in time; nothing was changed")
	case relay.CodeBusy:
		return toolErr(re.Code, "the user's device is answering other calls; try again in a moment")
	case relay.CodeLimit:
		return toolErr(re.Code, "the user's device has reached its own limit on how many values it decrypts or encrypts; try again later")
	case relay.CodeDeclined:
		return toolErr(re.Code, "the user declined this change on their device; nothing was changed")
	case relay.CodeRateLimited:
		return rateLimited(re.RetryAfter, "at most 60 calls a minute go through the user's device")
	case relay.CodeTooLarge:
		return toolErr(re.Code, "this call needs too many values from the user's device; ask for fewer items")
	}
	return toolErr(re.Code, "the user's device could not answer")
}
