## ADDED Requirements

### Requirement: Location reminders are not calendar alarms
The server SHALL NOT serve a location reminder (`arrive` or `leave`) as a `VALARM`, and the rule that deletes a served reminder whose alarm is absent from a client's VTODO SHALL never delete a location reminder. An inbound `VALARM` carrying a `PROXIMITY` property SHALL be kept as client data and SHALL create no reminder, whatever its trigger.

#### Scenario: Calendar client saves a task with a location reminder
- **WHEN** a calendar client fetches a task with an `arrive` reminder and a relative reminder and PUTs it back unchanged
- **THEN** the VTODO carried one VALARM, and after the PUT the task still has both reminders

#### Scenario: Apple proximity alarm
- **WHEN** a client PUTs a VALARM with `PROXIMITY:ARRIVE` and `TRIGGER;VALUE=DATE-TIME:19760401T005545Z`
- **THEN** no reminder is created, and the alarm is served back unchanged as client data
