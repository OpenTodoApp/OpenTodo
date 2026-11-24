package calsync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// graphEvents writes events through Microsoft Graph (calendar-event-edits
// D5): a PATCH of only the changed members, and a DELETE, both with If-Match
// on the event's @odata.etag; Graph.do never follows a redirect.
type graphEvents struct {
	g *Graph
	// zone is the mailbox's zone (IANA, "" for UTC).
	zone string
}

const graphEventSelect = "id,subject,start,end,isAllDay,showAs,type,isOrganizer,attendees,location,lastModifiedDateTime"

func (e *graphEvents) read(ctx context.Context, id string) (*graphEvent, error) {
	resp, err := e.g.do(ctx, http.MethodGet, eventPath(id)+"?"+query(url.Values{"$select": {graphEventSelect}}), nil, nil)
	if err != nil {
		return nil, err
	}
	if err := writeAnswer(resp.Status); err != nil {
		return nil, err
	}
	var ev graphEvent
	if json.Unmarshal(resp.Body, &ev) != nil || ev.ID == "" {
		return nil, &Error{Reason: ReasonInvalid}
	}
	return &ev, nil
}

// Update reads the event, checks its version and locks, and PATCHes it once.
func (e *graphEvents) Update(ctx context.Context, ref EventRef, edit EventEdit, _ time.Time) (EventState, error) {
	cur, err := e.read(ctx, ref.Href)
	if err != nil {
		return EventState{}, err
	}
	if cur.ETag != ref.ETag {
		return EventState{}, ErrEventChanged
	}
	if lock := cur.lock(); lock != "" {
		return EventState{}, &lockedError{lock}
	}
	body := map[string]any{}
	if edit.Summary != nil {
		s, err := CleanSummary(*edit.Summary)
		if err != nil {
			return EventState{}, err
		}
		body["subject"] = s
	}
	if edit.When != nil {
		body["start"], body["end"] = graphPoint(edit.When.Start, edit.When.AllDay, e.zone), graphPoint(edit.When.End, edit.When.AllDay, e.zone)
		body["isAllDay"] = edit.When.AllDay
	}
	resp, err := e.g.do(ctx, http.MethodPatch, eventPath(ref.Href), map[string]string{"If-Match": ref.ETag}, body)
	if err != nil {
		return EventState{}, err
	}
	if err := writeAnswer(resp.Status); err != nil {
		return EventState{}, err
	}
	var ev graphEvent
	if json.Unmarshal(resp.Body, &ev) != nil || ev.ID == "" {
		return EventState{}, &Error{Reason: ReasonInvalid}
	}
	r, ok := ev.remote()
	if !ok {
		return EventState{}, &Error{Reason: ReasonInvalid}
	}
	return EventState{Ref: EventRef{Calendar: ref.Calendar, Href: ev.ID, ETag: ev.ETag}, Events: r.Events, Locked: ev.lock()}, nil
}

// Delete removes the event once, with If-Match.
func (e *graphEvents) Delete(ctx context.Context, ref EventRef) error {
	resp, err := e.g.do(ctx, http.MethodDelete, eventPath(ref.Href), map[string]string{"If-Match": ref.ETag}, nil)
	if err != nil {
		return err
	}
	return writeAnswer(resp.Status)
}

// graphPoint is a start or end as Graph wants it: an all-day date and a
// floating time in the mailbox zone, a zoned time in its zone's Windows id,
// and a zone without one as the same instant in UTC.
func graphPoint(p calfeed.Point, allDay bool, mailbox string) graphDateTime {
	const layout = "2006-01-02T15:04:05"
	if allDay {
		zone, _ := mailboxWindows(mailbox)
		return graphDateTime{p.T.Format("2006-01-02") + "T00:00:00", zone}
	}
	if p.Zone == "" {
		zone, _ := mailboxWindows(mailbox)
		return graphDateTime{p.T.Format(layout), zone}
	}
	if loc, err := zoned.Load(p.Zone); err == nil && p.Zone != "UTC" {
		if win, ok := zoned.WindowsName(loc.String()); ok {
			return graphDateTime{p.T.In(loc).Format(layout), win}
		}
	}
	return graphDateTime{p.T.UTC().Format(layout), "UTC"}
}
