# Spec Delta

## ADDED Requirements

### Requirement: The range has visible controls
The timeline SHALL offer three buttons beside its zoom, named Earlier, Today and Later: Earlier and Later move the range by the step the keys `[` and `]` move it (one week in Days, four in Weeks), and Today returns it to today. They SHALL be there on every device, so a device without a keyboard can move the range. The keys stay. Moving the range changes what is shown and writes nothing.

#### Scenario: Move the range on a phone
- **WHEN** a person taps Later in Days
- **THEN** the timeline starts one week later

#### Scenario: Back to today
- **WHEN** the range was moved and a person taps Today
- **THEN** the timeline shows today's range again
