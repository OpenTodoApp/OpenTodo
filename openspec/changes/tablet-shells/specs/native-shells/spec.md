## ADDED Requirements

### Requirement: Tablets get keyboard, pointer and window support
On an iPad the shell SHALL pass hardware keyboard shortcuts to the page, SHALL list the app's main shortcuts in the system's shortcut overlay and send them to the page as the same shortcut ids, and SHALL let a trackpad or mouse act as a hover-capable fine pointer. On iPad and Android tablets the app SHALL run in split view, Stage Manager or freeform windows of any size and SHALL keep its state when the window is resized or a foldable changes posture. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: The shortcut overlay
- **WHEN** a person holds Cmd on an iPad with a hardware keyboard in the app
- **THEN** the system overlay lists New task, Search, Today, Inbox and Upcoming, and choosing one does what the same key does in the page

#### Scenario: Unfolding a foldable
- **WHEN** a person unfolds an Android foldable with a task open
- **THEN** the app keeps the task open and lays out for the wider screen without restarting
