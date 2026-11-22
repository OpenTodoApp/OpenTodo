# Spec Delta

## ADDED Requirements

### Requirement: No link previews in the iOS shell
The iOS shell SHALL NOT show the system's link preview when a link in the web app is held: a long press never lifts a browser preview of a page out of the app. Tapping a link SHALL behave as before (the server's own addresses stay in the shell, others open in the browser), and a link in content SHALL still be copyable. This is presentation only: nothing is stored or synced, and it is the same offline.

#### Scenario: Holding a link in a note
- **WHEN** the user holds a finger on a link in a task's notes in the iOS app
- **THEN** no preview of the linked page appears, and the link can still be copied

#### Scenario: Tapping still opens
- **WHEN** the user taps a link to another site in a comment
- **THEN** it opens in the system browser as before
