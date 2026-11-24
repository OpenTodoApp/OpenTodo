## ADDED Requirements

### Requirement: Urgent reminders
A time reminder (relative, absolute or deadline) MAY be marked urgent. The flag SHALL be a field of the reminder, `false` unless set, written as a field-level operation applied locally first, so it can be set offline and converges by per-field last-writer-wins like every reminder field. The reminder's menu in the task panel SHALL offer **Urgent** as a checkable item, and an urgent reminder SHALL show an alarm clock instead of a bell. Marking a reminder urgent or not SHALL NOT move its firing time or clear its delivered or dismissed state. In the browser, by push and in the Android app an urgent reminder SHALL fire as an ordinary reminder; the iPhone app rings it as an alarm where it can (`native-shells` "Urgent reminders ring as alarms on iPhone"). Location reminders SHALL NOT offer the flag.

#### Scenario: Mark a reminder urgent offline
- **WHEN** the device is offline and the user picks **Urgent** in a reminder's menu
- **THEN** the reminder shows an alarm clock at once, keeps its firing time, and the flag is uploaded on the next successful sync

#### Scenario: Two devices disagree
- **WHEN** device A marks a reminder urgent while device B, both offline, snoozes the same reminder, and both sync
- **THEN** every device shows the reminder urgent with B's new firing time

#### Scenario: Elsewhere it is an ordinary reminder
- **WHEN** an urgent reminder fires in the browser or the Android app
- **THEN** it shows the same notification as any other reminder

#### Scenario: Invalid value
- **WHEN** a client submits a reminder whose `urgent` is not a boolean
- **THEN** the write is rejected as an invalid operation and nothing changes
