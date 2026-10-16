# Spec Delta

## MODIFIED Requirements

### Requirement: Zone control
A due fixed to a zone SHALL read its zone's city as a suffix of the Do on part ("Tomorrow 09:00 · New York"); a floating due SHALL show no zone at rest. The Do on segment of the When popover SHALL hold the zone control reading "Floating" or the zone's city and current UTC offset. Opening it SHALL explain both modes in one sentence each, offer "Fix to my zone" or "Make floating", and offer a searchable list of all IANA zones with the viewer's zone and recently used zones first. Without a time the control SHALL be disabled with the reason stated inside the segment only.

#### Scenario: Read the mode at a glance
- **WHEN** a task is due `09:00 America/New_York`
- **THEN** the Do on part reads the local time and "· New York", and the zone control in the Do on segment reads "New York · UTC−4" (or −5 in winter)

#### Scenario: Floating at rest
- **WHEN** a task has a floating due with a time
- **THEN** the Do on part shows no zone suffix, and the Do on segment's zone control reads "Floating"

#### Scenario: No time set
- **WHEN** the task has a due date without a time
- **THEN** the panel shows no zone text at rest, and in the Do on segment the zone control is disabled and states that a time is needed to fix a zone
