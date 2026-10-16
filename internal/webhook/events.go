// Package webhook delivers outbound, signed HTTP notifications for task and
// project events (OpenSpec change `webhooks`). Events are derived from the
// winning changes that sync.Apply reports after each committed batch, queued
// durably in SQLite, and sent by one worker through an SSRF-safe client.
package webhook

import (
	"encoding/json"
	"slices"

	"github.com/pixari/opentodo/internal/importer"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// PayloadVersion is the version of the JSON body documented in docs/webhooks.md.
const PayloadVersion = 1

// EventPing is sent by the test action; it is never derived from data.
const EventPing = "ping"

// Events lists every event a webhook may subscribe to, in display order.
var Events = []string{
	"task.created", "task.updated", "task.completed", "task.reopened", "task.deleted",
	"project.created", "project.updated", "project.archived", "project.deleted",
	importer.EventCompleted, importer.EventUndone,
}

// KnownEvent reports whether name is a subscribable event.
func KnownEvent(name string) bool { return slices.Contains(Events, name) }

// EventFor maps one entity's coalesced change to exactly one event name, by
// precedence: created, deleted, completed, reopened, archived, updated.
func EventFor(c opsync.Change) string {
	f := c.Fields
	if fc, ok := f["created_at"]; ok && isNull(fc.From) && !isNull(fc.To) {
		return c.Entity + ".created"
	}
	if fc, ok := f["deleted_at"]; ok && isNull(fc.From) && !isNull(fc.To) {
		return c.Entity + ".deleted"
	}
	if c.Entity == "task" {
		if fc, ok := f["completed_at"]; ok {
			switch {
			case isNull(fc.From) && !isNull(fc.To):
				return "task.completed"
			case !isNull(fc.From) && isNull(fc.To):
				return "task.reopened"
			}
		}
	}
	if c.Entity == "project" {
		if fc, ok := f["archived"]; ok && !isTrue(fc.From) && isTrue(fc.To) {
			return "project.archived"
		}
	}
	return c.Entity + ".updated"
}

// SourceFor names where a change came from: "server" (REST API), "import",
// "caldav", or "device" for any syncing client (the device id is sent separately).
func SourceFor(origin string) string {
	switch origin {
	case "server", "import", "caldav":
		return origin
	}
	return "device"
}

// Payload is the version 1 delivery body. Data and Changes are kept raw so a
// stored body can be re-encoded with a new delivery id without reordering keys.
type Payload struct {
	Version   int             `json:"version"`
	ID        string          `json:"id"`
	Event     string          `json:"event"`
	Time      int64           `json:"time"`
	WebhookID string          `json:"webhook_id"`
	Source    string          `json:"source"`
	Device    string          `json:"device,omitempty"`
	Data      json.RawMessage `json:"data"`
	Changes   json.RawMessage `json:"changes"`
}

// BuildPayload assembles the body for one event. entity is the current
// materialized record (may be nil if it vanished); changes are the fields that
// changed with their previous values (null when unknown).
func BuildPayload(deliveryID, webhookID, event string, timeMs int64, origin, entityKind string, entity opsync.Entity, changes map[string]opsync.FieldChange) ([]byte, error) {
	data := map[string]any{}
	if entityKind != "" {
		if entity == nil {
			data[entityKind] = nil
		} else {
			e := withoutDocValues(entityKind, entity)
			if entityKind == "task" {
				// Custom field values as one object, like the REST API (custom-fields D3);
				// a change names the value it touched as `fields.<id>`.
				e = opsync.FoldFieldValues(e)
			}
			data[entityKind] = e
		}
	}
	rawData, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	if changes == nil {
		changes = map[string]opsync.FieldChange{}
	}
	rawChanges, err := json.Marshal(changes)
	if err != nil {
		return nil, err
	}
	p := Payload{Version: PayloadVersion, ID: deliveryID, Event: event, Time: timeMs, WebhookID: webhookID,
		Source: SourceFor(origin), Data: rawData, Changes: rawChanges}
	if p.Source == "device" {
		p.Device = origin
	}
	return json.Marshal(p)
}

// importData is the `data.import` object of an import summary delivery.
type importData struct {
	ID         string                    `json:"id"`
	Format     string                    `json:"format"`
	Status     string                    `json:"status"`
	Message    string                    `json:"message,omitempty"`
	Totals     importer.Totals           `json:"totals"`
	Counts     map[string]map[string]int `json:"counts"`
	ProjectIDs []string                  `json:"project_ids"`
}

// BuildImportPayload assembles the body of an import.completed or import.undone
// delivery: one summary for a whole job, with the projects this receiver's
// owner can see (projectIDs) instead of one event per written entity.
func BuildImportPayload(deliveryID, webhookID string, timeMs int64, sum importer.Summary, projectIDs []string) ([]byte, error) {
	if projectIDs == nil {
		projectIDs = []string{}
	}
	counts := sum.Counts
	if counts == nil {
		counts = map[string]map[string]int{}
	}
	rawData, err := json.Marshal(map[string]importData{"import": {ID: sum.JobID, Format: sum.Format, Status: sum.Status,
		Message: sum.Message, Totals: sum.Totals, Counts: counts, ProjectIDs: projectIDs}})
	if err != nil {
		return nil, err
	}
	p := Payload{Version: PayloadVersion, ID: deliveryID, Event: sum.Event, Time: timeMs, WebhookID: webhookID,
		Source: importer.Device, Data: rawData, Changes: json.RawMessage(`{}`)}
	return json.Marshal(p)
}

// WithDeliveryID returns body with its id replaced, keeping everything else.
// Redelivery uses it: same event, data and changes, new delivery id.
func WithDeliveryID(body []byte, id string) ([]byte, error) {
	var p Payload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	p.ID = id
	return json.Marshal(p)
}

func isNull(v json.RawMessage) bool { return len(v) == 0 || string(v) == "null" }

func isTrue(v json.RawMessage) bool {
	var b bool
	return json.Unmarshal(v, &b) == nil && b
}

// withoutDocFields returns c without opaque document fields (opsync.DocFields).
func withoutDocFields(c opsync.Change) opsync.Change {
	has := false
	for f := range c.Fields {
		has = has || opsync.IsDocField(c.Entity, f)
	}
	if !has {
		return c
	}
	out := make(map[string]opsync.FieldChange, len(c.Fields))
	for f, fc := range c.Fields {
		if !opsync.IsDocField(c.Entity, f) {
			out[f] = fc
		}
	}
	c.Fields = out
	return c
}

// withoutDocValues returns e without opaque document fields: deliveries carry
// the readable projection (description), not the encoded note.
func withoutDocValues(kind string, e opsync.Entity) opsync.Entity {
	has := false
	for f := range e {
		has = has || opsync.IsDocField(kind, f)
	}
	if !has {
		return e
	}
	out := make(opsync.Entity, len(e))
	for f, v := range e {
		if !opsync.IsDocField(kind, f) {
			out[f] = v
		}
	}
	return out
}
