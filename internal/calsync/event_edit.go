package calsync

import (
	"context"
	"errors"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// Worker.EditEvent, DeleteEvent and UndoEvent (calendar-event-edits D4, D5,
// D12): the one path the REST routes and the agent tool share. Each takes the
// connection's cycle lock, checks the option, the calendar's capability, the
// lock and the version the caller saw, writes with the cycle's transport,
// updates the cache in one transaction and wakes the user's devices.

// Codes of a refused event write (the REST error codes of D4).
const (
	CodeNotFound          = "not_found"
	CodeEditsOff          = "event_edits_off"
	CodeAssistantEditsOff = "assistant_edits_off"
	CodeReadOnly          = "calendar_read_only"
	CodeNotEditable       = "event_not_editable"
	CodeChanged           = "event_changed"
	CodeGone              = "event_gone"
	CodeUnreachable       = "calendar_unreachable"
	CodeInvalid           = "invalid_input"
)

// EventError is a refused or failed event write; Reason names the lock or the
// calendar's failure.
type EventError struct {
	Code   string
	Reason string
}

func (e *EventError) Error() string { return e.Code + ": " + e.Reason }

func refuse(code, reason string) error { return &EventError{Code: code, Reason: reason} }

// Assistant is the AI assistant's token an edit is made with.
type Assistant struct{ TokenID, TokenName string }

// EditRequest is one event edit. Assistant is nil for the person's own.
type EditRequest struct {
	UserID, ConnID, EventID, Rev string
	Edit                         EventEdit
	Assistant                    *Assistant
}

// EventResult is the event as the calendar now holds it, the id it replaces
// and the connection's provider.
type EventResult struct {
	Event    calfeed.EventRow
	Replaces string
	Provider string
}

// Rev is the opaque version served for an ETag.
func Rev(etag string) string { return hash16(etag) }

// EditEvent changes an event of one of the user's connections.
func (w *Worker) EditEvent(ctx context.Context, req EditRequest) (*EventResult, error) {
	release, err := w.gate.Enter(ctx, InFlight, req.ConnID)
	if err != nil {
		return nil, err
	}
	defer release()
	return w.editLocked(ctx, req)
}

func (w *Worker) editLocked(ctx context.Context, req EditRequest) (*EventResult, error) {
	c, row, err := w.resolve(ctx, req.UserID, req.ConnID, req.EventID, req.Rev, false, req.Assistant != nil)
	if err != nil {
		return nil, err
	}
	writer, err := w.eventWriter(ctx, c)
	if err != nil {
		return nil, unreachable(err)
	}
	ref := EventRef{Calendar: row.Ref.CalendarURL, Href: row.Ref.Href, ETag: row.Ref.ETag}
	state, err := writer.Update(ctx, ref, req.Edit, w.clock())
	if err != nil {
		return nil, w.writeFailed(ctx, c, row, err)
	}
	occ := occurrenceOf(state.Events)
	if occ == nil {
		return nil, refuse(CodeUnreachable, ReasonInvalid)
	}
	if err := w.Feeds.ReplaceManagedEvent(ctx, row.SubscriptionID, row.UID, row.Ref.Instance, occ,
		calfeed.EventRemote{Href: state.Ref.Href, ETag: state.Ref.ETag, Locked: state.Locked}); err != nil {
		return nil, err
	}
	newID := calfeed.EventID(row.SubscriptionID, occ.UID, occ.Instance)
	if err := w.keepUndo(ctx, req, row, newID, state.Ref.ETag); err != nil {
		return nil, err
	}
	w.notify(c.UserID)
	out, err := w.Feeds.ManagedEvent(ctx, c.ID, newID)
	if err != nil {
		return nil, err
	}
	Decorate([]*calfeed.EventRow{&out}, []Connection{*c})
	return &EventResult{Event: out, Replaces: req.EventID, Provider: c.Provider}, nil
}

// keepUndo keeps what an assistant's edit replaced, or forgets the undo of an
// event the person changed themselves.
func (w *Worker) keepUndo(ctx context.Context, req EditRequest, before calfeed.EventRow, newID, etag string) error {
	if err := w.Store.dropUndo(ctx, req.ConnID, req.EventID); err != nil {
		return err
	}
	if req.Assistant == nil {
		return nil
	}
	u := Undo{ETag: etag, TokenID: req.Assistant.TokenID, TokenName: req.Assistant.TokenName}
	if req.Edit.Summary != nil {
		s := before.Summary
		u.Summary = &s
	}
	if req.Edit.When != nil {
		when, err := WhenOf(before.Start, before.End, before.AllDay)
		if err != nil {
			return nil // a time OpenTodo cannot write back keeps no undo
		}
		u.When = &when
	}
	return w.Store.saveUndo(ctx, req.ConnID, newID, u)
}

// DeleteEvent deletes an event of one of the user's connections.
func (w *Worker) DeleteEvent(ctx context.Context, userID, connID, eventID, rev string) (string, error) {
	release, err := w.gate.Enter(ctx, InFlight, connID)
	if err != nil {
		return "", err
	}
	defer release()
	c, row, err := w.resolve(ctx, userID, connID, eventID, rev, true, false)
	if err != nil {
		return "", err
	}
	writer, err := w.eventWriter(ctx, c)
	if err != nil {
		return "", unreachable(err)
	}
	if err := writer.Delete(ctx, EventRef{Calendar: row.Ref.CalendarURL, Href: row.Ref.Href, ETag: row.Ref.ETag}); err != nil {
		return "", w.writeFailed(ctx, c, row, err)
	}
	if err := w.forget(ctx, c, row); err != nil {
		return "", err
	}
	return c.Provider, nil
}

// UndoEvent restores what an assistant's edit replaced, conditional on the
// version that edit produced.
func (w *Worker) UndoEvent(ctx context.Context, userID, connID, eventID string) (*EventResult, error) {
	release, err := w.gate.Enter(ctx, InFlight, connID)
	if err != nil {
		return nil, err
	}
	defer release()
	if _, err := w.Store.Get(ctx, userID, connID); err != nil {
		return nil, refuse(CodeNotFound, "")
	}
	u, err := w.Store.undo(ctx, connID, eventID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, refuse(CodeNotFound, "no undo is kept for this event")
	}
	row, err := w.Feeds.ManagedEvent(ctx, connID, eventID)
	if err != nil || row.Ref == nil || row.Ref.ETag != u.ETag {
		_ = w.Store.dropUndo(ctx, connID, eventID)
		return nil, refuse(CodeChanged, "the event changed since the assistant's edit")
	}
	return w.editLocked(ctx, EditRequest{UserID: userID, ConnID: connID, EventID: eventID, Rev: Rev(u.ETag), Edit: EventEdit{Summary: u.Summary, When: u.When}})
}

// resolve finds the user's connection and cached event and checks, in order,
// the option, the calendar's capability, the lock and the version.
func (w *Worker) resolve(ctx context.Context, userID, connID, eventID, rev string, del, assistant bool) (*Connection, calfeed.EventRow, error) {
	c, err := w.Store.Get(ctx, userID, connID)
	if errors.Is(err, ErrNotFound) {
		return nil, calfeed.EventRow{}, refuse(CodeNotFound, "")
	}
	if err != nil {
		return nil, calfeed.EventRow{}, err
	}
	row, err := w.Feeds.ManagedEvent(ctx, connID, eventID)
	if errors.Is(err, calfeed.ErrNoEvent) || (err == nil && row.Ref == nil) {
		return nil, row, refuse(CodeNotFound, "")
	}
	if err != nil {
		return nil, row, err
	}
	caps := Caps{}
	if cal := c.Calendar(row.Ref.CalendarURL); cal != nil {
		caps = cal.CapsOf()
	}
	switch {
	case !c.EditEvents:
		return nil, row, refuse(CodeEditsOff, "")
	case assistant && !c.AssistantEdits:
		return nil, row, refuse(CodeAssistantEditsOff, "")
	case (del && !caps.Delete) || (!del && !caps.Update):
		return nil, row, refuse(CodeReadOnly, "")
	case row.Ref.Locked != "":
		return nil, row, refuse(CodeNotEditable, row.Ref.Locked)
	case rev != Rev(row.Ref.ETag):
		return nil, row, refuse(CodeChanged, "")
	}
	return c, row, nil
}

// writeFailed maps a writer's error and keeps the cache in step: a gone
// event is dropped, a refused write makes the calendar read-only.
func (w *Worker) writeFailed(ctx context.Context, c *Connection, row calfeed.EventRow, err error) error {
	var lock *lockedError
	switch {
	case errors.As(err, &lock):
		return refuse(CodeNotEditable, lock.reason)
	case errors.Is(err, ErrEventChanged):
		return refuse(CodeChanged, "")
	case errors.Is(err, ErrSummary):
		return refuse(CodeInvalid, err.Error())
	case errors.Is(err, ErrEventGone):
		if ferr := w.forget(ctx, c, row); ferr != nil {
			return ferr
		}
		return refuse(CodeGone, "")
	case errors.Is(err, ErrCalendarRO):
		if serr := w.Store.SetCaps(ctx, c.ID, row.Ref.CalendarURL, Caps{}); serr != nil {
			return serr
		}
		return refuse(CodeReadOnly, "")
	}
	return unreachable(err)
}

func unreachable(err error) error {
	reason := reasonOf(err)
	switch {
	case reason == ReasonUnauthorized:
		reason = "unauthorized_remote"
	case errors.Is(err, context.DeadlineExceeded):
		reason = ReasonTimeout
	case reason == "internal_error":
		return err
	}
	return refuse(CodeUnreachable, reason)
}

// forget drops a deleted or gone event from the cache and wakes devices.
func (w *Worker) forget(ctx context.Context, c *Connection, row calfeed.EventRow) error {
	if err := w.Feeds.ReplaceManagedEvent(ctx, row.SubscriptionID, row.UID, row.Ref.Instance, nil, calfeed.EventRemote{}); err != nil {
		return err
	}
	if err := w.Store.dropUndo(ctx, c.ID, row.ID); err != nil {
		return err
	}
	w.notify(c.UserID)
	return nil
}

func (w *Worker) notify(userID string) {
	if w.Notify != nil {
		w.Notify(userID)
	}
}

// occurrenceOf is the single occurrence of a written event.
func occurrenceOf(events []calfeed.Event) *calfeed.Occurrence {
	if len(events) != 1 {
		return nil
	}
	ev := events[0]
	end := ev.Start.T.Add(24 * time.Hour)
	if ev.End != nil {
		end = ev.End.T
	}
	occ, _ := calfeed.ExpandContext(context.Background(), events, calfeed.Window{From: ev.Start.T.Add(-48 * time.Hour), To: end.Add(48 * time.Hour)}, 1)
	if len(occ) != 1 {
		return nil
	}
	return &occ[0]
}

// AccessOf is what OpenTodo may do with a managed event (D3): the first unmet
// condition of the option, the calendar's capability, the lock and a cache
// read since the upgrade names the reason.
func AccessOf(c *Connection, row *calfeed.EventRow) calfeed.EventAccess {
	ref := row.Ref
	caps := Caps{}
	if cal := c.Calendar(ref.CalendarURL); cal != nil {
		caps = cal.CapsOf()
	}
	switch {
	case !c.EditEvents:
		return calfeed.EventAccess{Reason: "edits_off"}
	case !caps.Update && !caps.Delete:
		return calfeed.EventAccess{Reason: CodeReadOnly}
	case ref.Locked != "":
		return calfeed.EventAccess{Reason: ref.Locked}
	case !ref.Known:
		return calfeed.EventAccess{Reason: "refresh_pending"}
	case !caps.Update || !caps.Delete:
		return calfeed.EventAccess{Update: caps.Update, Delete: caps.Delete, Reason: CodeReadOnly}
	}
	return calfeed.EventAccess{Update: true, Delete: true}
}

// Decorate sets rev, access and changedBy on the managed rows of conns.
func Decorate(rows []*calfeed.EventRow, conns []Connection) {
	byID := map[string]*Connection{}
	for i := range conns {
		byID[conns[i].ID] = &conns[i]
	}
	for _, r := range rows {
		if r.Ref == nil {
			continue
		}
		c := byID[r.Ref.ConnectionID]
		if c == nil {
			continue
		}
		acc := AccessOf(c, r)
		r.Access = &acc
		if r.Ref.Known {
			r.Rev = Rev(r.Ref.ETag)
		}
		if r.Ref.UndoETag != "" {
			r.ChangedBy = &calfeed.ChangedBy{Kind: "assistant", Name: r.Ref.UndoBy}
		}
	}
}
