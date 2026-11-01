package webhook

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// EventRuleFired is sent to the one webhook an automation rule's webhook
// action names (OpenSpec change automation-rules, webhooks delta).
const EventRuleFired = "rule.fired"

// ErrNoWebhook is QueueRuleFired's answer when the webhook does not exist, is
// another user's or is turned off.
var ErrNoWebhook = errors.New("webhook missing")

// RuleRef names the rule in a rule.fired delivery; the name is as stored, so a
// ciphertext string for an encrypted account.
type RuleRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// QueueRuleFired queues one rule.fired delivery to webhookID only: the task's
// current state, the field changes the rule made and the rule, with source
// "rule". Signed, retried and logged like every delivery.
func (s *Service) QueueRuleFired(ctx context.Context, userID, webhookID string, rule RuleRef, taskID string, changes map[string]opsync.FieldChange) error {
	var enabled bool
	err := s.db.QueryRowContext(ctx, `SELECT enabled FROM webhooks WHERE id = ? AND user_id = ?`, webhookID, userID).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !enabled) {
		return ErrNoWebhook
	}
	if err != nil {
		return err
	}
	task, err := s.sync.Get(ctx, userID, "task", taskID)
	if err != nil {
		return err
	}
	now := s.nowMs()
	id := ids.New()
	body, err := BuildPayload(id, webhookID, EventRuleFired, now, opsync.RuleDevicePrefix+rule.ID, "task", task, changes)
	if err != nil {
		return err
	}
	var p Payload
	if err := json.Unmarshal(body, &p); err != nil {
		return err
	}
	var data map[string]json.RawMessage
	if err := json.Unmarshal(p.Data, &data); err != nil {
		return err
	}
	if data["rule"], err = json.Marshal(rule); err != nil {
		return err
	}
	if p.Data, err = json.Marshal(data); err != nil {
		return err
	}
	if body, err = json.Marshal(p); err != nil {
		return err
	}
	return s.insertQueued(ctx, []queuedRow{{id, webhookID, EventRuleFired, string(body)}}, now)
}

// RoutineRef is a routine's Send a webhook step in a rule.fired delivery
// (routines-engine "Routine webhook step"): the run, the step, its text when
// given and the ids of the tasks it was given (at most 500).
type RoutineRef struct {
	RunID   string   `json:"run_id"`
	StepID  string   `json:"step_id"`
	Text    *string  `json:"text"`
	TaskIDs []string `json:"task_ids"`
}

// MaxRoutineTasks bounds the task ids one routine delivery carries.
const MaxRoutineTasks = 500

// QueueRoutine queues one rule.fired delivery to webhookID only for a
// routine's Send a webhook step: the rule, source "rule", the routine object
// and, when exactly one task was given, that task's state. Signed, retried and
// logged like every delivery. ErrNoWebhook when the webhook is missing,
// another user's or turned off.
func (s *Service) QueueRoutine(ctx context.Context, userID, webhookID string, rule RuleRef, routine RoutineRef) error {
	var enabled bool
	err := s.db.QueryRowContext(ctx, `SELECT enabled FROM webhooks WHERE id = ? AND user_id = ?`, webhookID, userID).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !enabled) {
		return ErrNoWebhook
	}
	if err != nil {
		return err
	}
	if routine.TaskIDs == nil {
		routine.TaskIDs = []string{}
	}
	if len(routine.TaskIDs) > MaxRoutineTasks {
		routine.TaskIDs = routine.TaskIDs[:MaxRoutineTasks]
	}
	kind := ""
	var task opsync.Entity
	if len(routine.TaskIDs) == 1 {
		if task, err = s.sync.Get(ctx, userID, "task", routine.TaskIDs[0]); err != nil {
			return err
		}
		kind = "task"
	}
	now := s.nowMs()
	id := ids.New()
	body, err := BuildPayload(id, webhookID, EventRuleFired, now, opsync.RuleDevicePrefix+rule.ID, kind, task, nil)
	if err != nil {
		return err
	}
	var p Payload
	if err := json.Unmarshal(body, &p); err != nil {
		return err
	}
	data := map[string]json.RawMessage{}
	if err := json.Unmarshal(p.Data, &data); err != nil {
		return err
	}
	if data["rule"], err = json.Marshal(rule); err != nil {
		return err
	}
	if data["routine"], err = json.Marshal(routine); err != nil {
		return err
	}
	if p.Data, err = json.Marshal(data); err != nil {
		return err
	}
	if body, err = json.Marshal(p); err != nil {
		return err
	}
	return s.insertQueued(ctx, []queuedRow{{id, webhookID, EventRuleFired, string(body)}}, now)
}
