package httpapi

import (
	"context"
	"errors"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync"
)

// calendarEventEditor serves list_calendar_events and update_calendar_event
// (calendar-event-edits D8) over the events route's reads and the PATCH
// route's own path: the same checks, cycle lock, conditional write, limiter,
// audit and notification, with the assistant's undo kept.
type calendarEventEditor struct{ s *Server }

func (e calendarEventEditor) Events(ctx context.Context, c agenttools.Caller, from, to string) ([]agenttools.EventItem, error) {
	feeds, managed := e.s.calFeedsOn.On(ctx), e.s.calsyncOn.On(ctx)
	out := []agenttools.EventItem{}
	if !feeds && !managed {
		return out, nil
	}
	rows, err := e.s.calWorker.Store.EventsOf(ctx, c.UserID, from, to, feeds, managed)
	if err != nil {
		return nil, err
	}
	if _, err := e.s.decorateManaged(ctx, c.UserID, rows, managed); err != nil {
		return nil, err
	}
	conns := map[string]bool{}
	if managed {
		list, err := e.s.calsync.Store.List(ctx, c.UserID)
		if err != nil {
			return nil, err
		}
		for _, cn := range list {
			conns[cn.ID] = cn.AssistantEdits
		}
	}
	for i := range rows {
		out = append(out, eventItem(&rows[i], conns))
	}
	return out, nil
}

// eventItem is a served row as the tools return it; access is the
// assistant's: the person's access and "Let assistants edit events".
func eventItem(r *calfeed.EventRow, assistants map[string]bool) agenttools.EventItem {
	it := agenttools.EventItem{ID: r.ID, Rev: r.Rev, AllDay: r.AllDay, Free: r.Free,
		Start:     agenttools.EventTime{Date: r.Start.Date, Time: r.Start.Time, TZ: r.Start.TZ},
		End:       agenttools.EventTime{Date: r.End.Date, Time: r.End.Time, TZ: r.End.TZ},
		Untrusted: agenttools.EventText{Summary: r.Summary, Location: r.Location}}
	if r.Ref != nil && r.Access != nil {
		it.ConnectionID = r.Ref.ConnectionID
		acc := agenttools.EventAccess{Update: r.Access.Update, Reason: r.Access.Reason}
		if acc.Update && !assistants[r.Ref.ConnectionID] {
			acc = agenttools.EventAccess{Reason: calsync.CodeAssistantEditsOff}
		}
		it.Access = &acc
	}
	return it
}

func patchOfUpdate(u agenttools.EventUpdate) eventPatch {
	p := eventPatch{Rev: &u.Rev, Summary: u.Summary, AllDay: u.AllDay}
	if u.Start != nil {
		p.Start = &calfeed.When{Date: u.Start.Date, Time: u.Start.Time, TZ: u.Start.TZ}
	}
	if u.End != nil {
		p.End = &calfeed.When{Date: u.End.Date, Time: u.End.Time, TZ: u.End.TZ}
	}
	return p
}

func (e calendarEventEditor) Validate(u agenttools.EventUpdate) error {
	if _, field, msg := patchOfUpdate(u).editOf(); field != "" {
		return &agenttools.ToolError{Code: "invalid_input", Message: field + ": " + msg}
	}
	return nil
}

func (e calendarEventEditor) Update(ctx context.Context, c agenttools.Caller, u agenttools.EventUpdate) (agenttools.EventItem, error) {
	if !e.s.calsyncOn.On(ctx) {
		return agenttools.EventItem{}, &agenttools.ToolError{Code: "calendar_sync_disabled", Message: "the server owner has not enabled calendar sync"}
	}
	edit, field, msg := patchOfUpdate(u).editOf()
	if field != "" {
		return agenttools.EventItem{}, &agenttools.ToolError{Code: "invalid_input", Message: field + ": " + msg}
	}
	if e.s.calsyncEventLimiter != nil && !e.s.calsyncEventLimiter.allow(c.UserID) {
		return agenttools.EventItem{}, &agenttools.ToolError{Code: "rate_limited", Message: "too many calendar event changes; try again later"}
	}
	res, err := e.s.calsync.EditEvent(ctx, calsync.EditRequest{UserID: c.UserID, ConnID: u.ConnectionID, EventID: u.EventID, Rev: u.Rev, Edit: edit,
		Assistant: &calsync.Assistant{TokenID: c.TokenID, TokenName: c.TokenName}})
	var ee *calsync.EventError
	if errors.As(err, &ee) {
		m := eventMessage[ee.Code]
		if ee.Reason != "" {
			m += ": " + ee.Reason
		}
		return agenttools.EventItem{}, &agenttools.ToolError{Code: ee.Code, Message: m}
	}
	if err != nil {
		return agenttools.EventItem{}, err
	}
	e.s.audit.Record(ctx, audit.CalendarEventChanged(c.UserID, u.ConnectionID, res.Provider, "updated", c.TokenID))
	return eventItem(&res.Event, map[string]bool{u.ConnectionID: true}), nil
}
