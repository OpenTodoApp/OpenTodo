## ADDED Requirements

### Requirement: Done from a notification applies to the due occurrence
**Done** on a reminder notification SHALL apply after the first sync of the app it opened has ended, at most 30 seconds later; offline, or when sync cannot run, it SHALL apply at once from what the device has, and the completion converges like any other on the next sync. **Done** on a repeating task whose relative or deadline reminder, computed on the device from the task's current due or deadline, fires more than an hour from now SHALL write nothing: that occurrence was completed elsewhere.

#### Scenario: Done on a notification for an occurrence already completed elsewhere writes nothing
- **WHEN** today's occurrence of a daily task was completed on another device and the user taps **Done** on today's notification on the phone
- **THEN** the phone writes nothing after it syncs, and the task stays on tomorrow

#### Scenario: Done from a notification waits for the first sync, up to 30 s; offline it applies at once
- **WHEN** the user taps **Done** on a notification and the app it opens is behind the server
- **THEN** Done applies once the first sync has ended, at most 30 seconds later, to the occurrence the server is on; with no network it applies at once
