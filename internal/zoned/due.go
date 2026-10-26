package zoned

import (
	"encoding/json"
	"fmt"
	"time"
)

// A task's due value and the reminder times computed from it, shared by web
// push reminders and CalDAV alarms (internal/httpapi and its davroutes).

type Due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	// TZ makes the Due zoned (OpenSpec change absolute-datetimes): the wall time
	// in that IANA zone. Kept as the series rolls forward.
	TZ *string `json:"tz,omitempty"`
}

func DecodeDue(raw json.RawMessage) *Due {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var d Due
	if json.Unmarshal(raw, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

// DueInstantMs is the Unix ms a Due denotes: a zoned Due is its wall time in its
// own zone (absolute-datetimes); a floating one is read in loc, 09:00 when
// date-only.
func DueInstantMs(d *Due, loc *time.Location) (int64, bool) {
	clock := "09:00"
	if d.Time != nil {
		clock = *d.Time
	}
	if d.TZ != nil && d.Time != nil {
		if zl, err := Load(*d.TZ); err == nil {
			loc = zl
		}
	}
	at, err := Instant(d.Date, clock, loc)
	if err != nil {
		return 0, false
	}
	return at.UnixMilli(), true
}

func RelativeFireAt(d *Due, offset json.RawMessage, loc *time.Location) json.RawMessage {
	if d == nil {
		return json.RawMessage("null")
	}
	at, ok := DueInstantMs(d, loc)
	if !ok {
		return json.RawMessage("null")
	}
	var minutes int64
	_ = json.Unmarshal(offset, &minutes)
	return json.RawMessage(fmt.Sprint(at + minutes*60_000))
}

// DeadlineFireAt is the firing instant of a deadline reminder (OpenSpec change
// deadlines, design D5): 09:00 in loc on the deadline day plus the offset, null
// without a deadline.
func DeadlineFireAt(deadlineRaw, offset json.RawMessage, loc *time.Location) json.RawMessage {
	var date string
	if json.Unmarshal(deadlineRaw, &date) != nil || date == "" {
		return json.RawMessage("null")
	}
	return RelativeFireAt(&Due{Date: date}, offset, loc)
}

// LocalToday is the server's local calendar date, the "today" of REST completions.
func LocalToday(now time.Time) string { return now.Local().Format("2006-01-02") }
