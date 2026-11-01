## ADDED Requirements

### Requirement: Routine notices through channels
A channel SHALL be able to receive one more event, `routine`: the text of a routine's Notify me step with the routine's name and a link to the run and, once `routines-editor` adds them, a routine's failures and waiting proposals. The event SHALL be queued only while the owner switch `notifications.channels` is on, after the run's batches committed, at most once per channel and step run, under the channels' own content and privacy rules.

#### Scenario: Notify me on the phone
- **WHEN** a user's ntfy channel has the routine event on and a routine notifies "Too much waiting"
- **THEN** the in-app notification is listed and one ntfy message carries the text and the routine's name

#### Scenario: Event off
- **WHEN** the channel does not have the routine event on
- **THEN** only the in-app notification is delivered
