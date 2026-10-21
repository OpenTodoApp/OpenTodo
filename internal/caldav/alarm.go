package caldav

import (
	"strings"
)

// Alarms as reminders (OpenSpec change caldav-interop, design D3, D4, D7).
// The codec reads and writes VALARM components; which reminder kind an
// inbound alarm becomes depends on the task's state, so the caller decides
// (internal/httpapi, the inbound date and alarm tables).

// Reminder is the outbound view of one live reminder.
type Reminder struct {
	ID string
	// Kind is "relative", "absolute" or "deadline".
	Kind string
	// Offset is the signed offset in minutes of a relative or deadline reminder.
	Offset int
	// FireAt is the instant of an absolute reminder (Unix ms); 0 when unknown.
	FireAt int64
}

// Alarm is what one inbound VALARM says. Mappable reports an alarm the
// reminder model can express (ACTION:DISPLAY or none, one trigger, no
// REPEAT/DURATION, an offset within the reminder limit); the caller keeps
// Lines as client data for any alarm it does not map.
type Alarm struct {
	// UID is the alarm's UID or X-WR-ALARMUID ("" when it has neither).
	UID string
	// Kind is the X-OPENTODO-KIND marker this server serves ("DEADLINE",
	// "RELATIVE" or "").
	Kind string
	// Related is "START" or "END" for a relative trigger ("" means END).
	Related string
	// Offset is a relative trigger in whole minutes, rounded toward the anchor.
	Offset *int
	// At is an absolute trigger (TRIGGER;VALUE=DATE-TIME), as a due value so a
	// floating time can be read in the user's zone.
	At       *Due
	Mappable bool
	Lines    []string
}

// alarmComponent renders a reminder as a VALARM. deadlineTask reports a task
// served with a deadline, whose DUE is the deadline and DTSTART the due date.
func alarmComponent(r Reminder, title string, deadlineTask bool) *Component {
	c := &Component{Name: "VALARM", Props: []Prop{
		{Name: "UID", Value: EscapeText(r.ID)},
		{Name: "X-WR-ALARMUID", Value: EscapeText(r.ID)},
		{Name: "ACTION", Value: "DISPLAY"},
		{Name: "DESCRIPTION", Value: EscapeText(title)},
	}}
	related := func(rel string) []Param { return []Param{{Name: "RELATED", Values: []string{rel}}} }
	switch r.Kind {
	case "absolute":
		c.Props = append(c.Props, Prop{Name: "TRIGGER", Params: []Param{{Name: "VALUE", Values: []string{"DATE-TIME"}}}, Value: utcStamp(r.FireAt)})
	case "deadline":
		c.Props = append(c.Props, Prop{Name: "TRIGGER", Params: related("END"), Value: TriggerText(r.Offset)},
			Prop{Name: "X-OPENTODO-KIND", Value: "DEADLINE"})
	default:
		if deadlineTask {
			// DUE is the deadline here; the due date is DTSTART.
			c.Props = append(c.Props, Prop{Name: "TRIGGER", Params: related("START"), Value: TriggerText(r.Offset)},
				Prop{Name: "X-OPENTODO-KIND", Value: "RELATIVE"})
		} else {
			c.Props = append(c.Props, Prop{Name: "TRIGGER", Params: related("END"), Value: TriggerText(r.Offset)})
		}
	}
	return c
}

// decodeAlarm reads one VALARM component.
func decodeAlarm(c *Component) Alarm {
	a := Alarm{Lines: c.Lines()}
	mappable := len(c.Children) == 0
	triggers := 0
	for _, p := range c.Props {
		switch p.Name {
		case "UID":
			if a.UID == "" {
				a.UID = strings.TrimSpace(UnescapeText(p.Value))
			}
		case "X-WR-ALARMUID":
			if u := strings.TrimSpace(UnescapeText(p.Value)); u != "" {
				a.UID = u
			}
		case "X-OPENTODO-KIND":
			a.Kind = strings.ToUpper(strings.TrimSpace(p.Value))
		case "ACTION":
			if v := strings.ToUpper(strings.TrimSpace(p.Value)); v != "DISPLAY" {
				mappable = false
			}
		case "REPEAT", "DURATION":
			mappable = false
		case "TRIGGER":
			triggers++
			if !a.trigger(p) {
				mappable = false
			}
		}
	}
	a.Mappable = mappable && triggers == 1
	return a
}

// trigger reads a TRIGGER; false when it does not parse or is out of range.
func (a *Alarm) trigger(p Prop) bool {
	if strings.EqualFold(p.Param("VALUE"), "DATE-TIME") {
		at, err := parseDue(p)
		if err != nil || at.Time == nil {
			return false
		}
		a.At = at
		return true
	}
	sec, err := ParseDuration(p.Value)
	if err != nil {
		return false
	}
	minutes := int(sec / 60) // toward zero: toward the anchor
	if minutes < -MaxAlarmOffset || minutes > MaxAlarmOffset {
		return false
	}
	a.Offset = &minutes
	a.Related = strings.ToUpper(strings.TrimSpace(p.Param("RELATED")))
	return true
}
