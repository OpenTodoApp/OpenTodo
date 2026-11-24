package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync"
)

// Event edits of connected calendars (OpenSpec change calendar-event-edits,
// design D4): PATCH and DELETE of one event, and the undo of an assistant's
// edit. The routes are behind the calendar sync switch, refused on the public
// demo and, without .Reach(), to tokens limited to workspaces; the work is
// calsync.Worker's, shared with the agent tool.

const (
	// maxEventBody caps a PATCH body.
	maxEventBody = 4 << 10
	// eventWritesPerHr limits event writes per user (the calsync.event limiter).
	eventWritesPerHr = 600
)

func (s *Server) registerCalendarEventRoutes(mux *routes, gate func(http.HandlerFunc) http.HandlerFunc) {
	mux.handle("PATCH /api/v1/calendar-sync/connections/{id}/events/{eventId}", signedIn.DemoDenied(), gate(s.handlePatchCalendarEvent))
	mux.handle("DELETE /api/v1/calendar-sync/connections/{id}/events/{eventId}", signedIn.DemoDenied(), gate(s.handleDeleteCalendarEvent))
	mux.handle("POST /api/v1/calendar-sync/connections/{id}/events/{eventId}/undo", signedIn.DemoDenied(), gate(s.handleUndoCalendarEvent))
}

// eventPatch is the PATCH body.
type eventPatch struct {
	Rev     *string       `json:"rev"`
	Summary *string       `json:"summary"`
	Start   *calfeed.When `json:"start"`
	End     *calfeed.When `json:"end"`
	AllDay  *bool         `json:"allDay"`
}

// editOf checks a patch (shared with update_calendar_event): it returns the
// edit, or the field at fault and why.
func (p eventPatch) editOf() (calsync.EventEdit, string, string) {
	var e calsync.EventEdit
	if p.Rev == nil || *p.Rev == "" {
		return e, "rev", "send the rev of the event you saw"
	}
	if p.Summary != nil {
		s, err := calsync.CleanSummary(*p.Summary)
		if err != nil {
			return e, "summary", err.Error()
		}
		e.Summary = &s
	}
	if (p.Start == nil) != (p.End == nil) {
		return e, "end", "send start and end together"
	}
	if p.Start == nil && p.AllDay != nil {
		return e, "allDay", "send allDay with start and end"
	}
	if p.Start != nil {
		allDay := p.AllDay != nil && *p.AllDay
		w, err := calsync.WhenOf(*p.Start, *p.End, allDay)
		if err != nil {
			return e, "start", err.Error()
		}
		e.When = &w
	}
	if e.Summary == nil && e.When == nil {
		return e, "summary", "nothing to change: send summary, or start and end"
	}
	return e, "", ""
}

func (s *Server) handlePatchCalendarEvent(w http.ResponseWriter, r *http.Request) {
	var in eventPatch
	if err := readJSONLimit(r, &in, maxEventBody); err != nil {
		badBodyWith(w, err, "invalid_input", `body must be {"rev": "...", "summary"?: "...", "start"?: {...}, "end"?: {...}, "allDay"?: false}`)
		return
	}
	edit, field, msg := in.editOf()
	if field != "" {
		writeFieldError(w, field, msg)
		return
	}
	uid := userFrom(r.Context()).ID
	if !s.calsyncEventLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar event changes; try again later")
		return
	}
	res, err := s.calsync.EditEvent(r.Context(), calsync.EditRequest{UserID: uid, ConnID: r.PathValue("id"), EventID: r.PathValue("eventId"), Rev: *in.Rev, Edit: edit})
	s.answerEvent(w, r, res, err, "updated")
}

func (s *Server) handleDeleteCalendarEvent(w http.ResponseWriter, r *http.Request) {
	rev := r.URL.Query().Get("rev")
	if rev == "" {
		writeFieldError(w, "rev", "send the rev of the event you saw")
		return
	}
	uid := userFrom(r.Context()).ID
	if !s.calsyncEventLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar event changes; try again later")
		return
	}
	provider, err := s.calsync.DeleteEvent(r.Context(), uid, r.PathValue("id"), r.PathValue("eventId"), rev)
	if err != nil {
		s.eventError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.CalendarEventChanged(uid, r.PathValue("id"), provider, "deleted", ""))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUndoCalendarEvent(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	if !s.calsyncEventLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar event changes; try again later")
		return
	}
	res, err := s.calsync.UndoEvent(r.Context(), uid, r.PathValue("id"), r.PathValue("eventId"))
	s.answerEvent(w, r, res, err, "undone")
}

func (s *Server) answerEvent(w http.ResponseWriter, r *http.Request, res *calsync.EventResult, err error, action string) {
	if err != nil {
		s.eventError(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.CalendarEventChanged(userFrom(r.Context()).ID, r.PathValue("id"), res.Provider, action, ""))
	writeJSON(w, http.StatusOK, map[string]any{"event": res.Event, "replaces": res.Replaces})
}

// eventMessage is the message of each refusal code; the reason is appended.
var eventMessage = map[string]string{
	calsync.CodeNotFound:          "calendar event not found",
	calsync.CodeGone:              "the event no longer exists in your calendar",
	calsync.CodeEditsOff:          "editing events is off for this connection",
	calsync.CodeAssistantEditsOff: "assistants may not edit this connection's events",
	calsync.CodeReadOnly:          "this calendar is read-only",
	calsync.CodeNotEditable:       "this event cannot be changed from OpenTodo",
	calsync.CodeInvalid:           "invalid change",
	calsync.CodeChanged:           "the event changed in your calendar; your edit was not applied",
	calsync.CodeUnreachable:       "the calendar could not be reached",
}

// eventText is the message of a refusal, with its reason.
func eventText(e *calsync.EventError) string {
	if e.Reason != "" {
		return eventMessage[e.Code] + ": " + e.Reason
	}
	return eventMessage[e.Code]
}

// eventError answers a refusal with its status (D4). Each code is written out
// as a literal so the error-code scanner and the OpenAPI description see it
// (TestEventErrorCodesMatchCalsync keeps them equal to calsync's).
func (s *Server) eventError(w http.ResponseWriter, err error) {
	var e *calsync.EventError
	if errors.Is(err, context.Canceled) {
		writeError(w, http.StatusBadGateway, "calendar_unreachable", "the calendar could not be reached: timeout")
		return
	}
	if !errors.As(err, &e) {
		s.internal(w, err)
		return
	}
	msg := eventText(e)
	switch e.Code {
	case calsync.CodeNotFound:
		writeError(w, http.StatusNotFound, "not_found", msg)
	case calsync.CodeGone:
		writeError(w, http.StatusNotFound, "event_gone", msg)
	case calsync.CodeEditsOff:
		writeError(w, http.StatusForbidden, "event_edits_off", msg)
	case calsync.CodeAssistantEditsOff:
		writeError(w, http.StatusForbidden, "assistant_edits_off", msg)
	case calsync.CodeReadOnly:
		writeError(w, http.StatusForbidden, "calendar_read_only", msg)
	case calsync.CodeNotEditable:
		writeError(w, http.StatusUnprocessableEntity, "event_not_editable", msg)
	case calsync.CodeInvalid:
		writeError(w, http.StatusBadRequest, "invalid_input", msg)
	case calsync.CodeChanged:
		writeError(w, http.StatusConflict, "event_changed", msg)
	case calsync.CodeUnreachable:
		writeError(w, http.StatusBadGateway, "calendar_unreachable", msg)
	default:
		s.internal(w, err)
	}
}
