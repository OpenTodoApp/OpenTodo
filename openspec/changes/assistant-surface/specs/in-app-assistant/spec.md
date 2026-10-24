## MODIFIED Requirements

### Requirement: Reviewable change sets
The panel and the Assistant page SHALL show a proposed change set as a card: a head naming it, the number of checked items out of all ("3 of 4 selected") and that nothing changes until the user applies; one row per task or project with a checkbox, the title and each change in words (old → new) at the right of a wide card and under the title of a narrow one, checked by default, with shared items marked; and a foot with an apply action naming how many changes it applies ("Apply 3 changes"), Discard, and the keys. It SHALL apply only after confirmation (Enter or the apply action) or discard it (Esc or Discard). Items whose local value changed since the proposal SHALL be unchecked and marked; items missing locally SHALL be dropped with a note. Review and apply work offline once the proposal has arrived; applied changes converge as ops.

#### Scenario: Review and apply part
- **WHEN** a change set proposes 5 changes and the user unchecks one and presses Enter
- **THEN** exactly the 4 checked changes are applied and the summary says 4 of 5 were applied

#### Scenario: Changed since proposed
- **WHEN** another device changed a task's due date after the proposal arrived and before the user applies
- **THEN** that item is unchecked and marked "changed since proposed", and applying leaves the newer value in place

#### Scenario: The card counts the selection
- **WHEN** a change set proposes 4 changes, one of them changed since proposed
- **THEN** the head reads "3 of 4 selected" and the apply action reads "Apply 3 changes"; unchecking another item makes them "2 of 4 selected" and "Apply 2 changes"

### Requirement: Chat panel
The panel SHALL open from a header button and Shift+I, use the overlay module (side sheet from 640 px, full-screen sheet below), trap and return focus, close with Esc, announce streamed text at sentence boundaries in a polite live region, load as a separate chunk on first open, and offline show past conversations with the composer disabled. It SHALL show the same empty state, messages, composer and change-set card as the Assistant page, with the composer at its foot. While the Assistant page is open, opening the assistant SHALL NOT open the panel: the page's composer SHALL take the request and the focus.

#### Scenario: Keyboard only
- **WHEN** a user presses Shift+I, types a question, presses Enter, then Tab to the change set and Enter
- **THEN** the answer streams, the change set is reachable and applied without a mouse, and Esc returns focus to where it was

#### Scenario: Phone
- **WHEN** the panel opens on a 390 px wide screen
- **THEN** it is a full-screen sheet with the composer above the on-screen keyboard and no horizontal scrolling

#### Scenario: Offline
- **WHEN** the device is offline and the user opens the panel
- **THEN** past conversations are listed and the composer says the assistant needs a connection

#### Scenario: Shift+I on the Assistant page
- **WHEN** the Assistant page is open and the user presses Shift+I, or sends "plan my afternoon" from the command bar's Ask mode
- **THEN** no panel opens, the focus moves to the page's composer, and the command bar's text is sent as a turn on the page

### Requirement: Ask composer
When the assistant is available to the user, the Ask screen (`/ask`, named "Assistant" in the sidebar, the command palette and the page header) SHALL be the Assistant page: it SHALL hold the conversation itself, with History and New chat in its header. With no messages it SHALL show the assistant's mark, a greeting with the user's first name for the time of day on the device, the composer in the middle of the page and up to three starter skills under it; once a conversation runs, the messages SHALL fill a centred column with the composer at the foot. The Today view SHALL offer an "Ask" action in its page header that opens the assistant panel; no composer or cards SHALL be rendered inside Today's list. Choosing a starter SHALL put its skill in the composer without sending. A turn from the page SHALL carry no view as context, only tasks a prefill names. The starters can be hidden on the device; the Skills menu keeps every skill.

#### Scenario: Start from Today
- **WHEN** a user with the assistant available activates Ask in Today's page header, types "what is overdue in Work?" and presses Enter
- **THEN** the assistant panel opens and sends that message as a turn

#### Scenario: Card fills the panel
- **WHEN** a user with the assistant available chooses the "Plan my week" starter on the Assistant page, or in the panel's empty state
- **THEN** that composer shows the skill with its description and example, ready to send, and nothing is sent yet

#### Scenario: Greeting
- **WHEN** Ada Lovelace opens the Assistant page at 14:00 with no conversation
- **THEN** the page reads "Good afternoon, Ada." and "What should we sort out?" above the composer

#### Scenario: Conversation on the page
- **WHEN** the user sends "Friday is too full" from the page's composer
- **THEN** the message appears at the right of a centred column, the answer streams beside the assistant's mark, any change set follows as a card, and the composer moves to the foot of the page

#### Scenario: Hide the starters
- **WHEN** the user selects × beside "Start from a skill"
- **THEN** the starters are gone on that device, also after a reload, and the Skills menu still lists every skill

### Requirement: Skills menu in the panel
The composer of the panel and of the Assistant page SHALL offer the Skills menu in a tray under the text field, followed by a context line naming what the turn carries: the selected tasks a request names ("1 selected task"), else the panel's view (Today, Upcoming, Inbox, This project, This view), else nothing. Choosing a skill SHALL show its description and example and let the user add their own text before sending. The menu SHALL be fully operable by keyboard and announce the chosen skill.

#### Scenario: Choose a skill by keyboard
- **WHEN** the user opens the Skills menu with the keyboard, moves to "Break this down" and presses Enter while a task is selected
- **THEN** the panel shows the skill with the selected task as its subject, ready to send

#### Scenario: Context in the tray
- **WHEN** the user opens the panel from Today, and later opens it with "Break down" from a task's menu
- **THEN** the tray reads "Context: Today" the first time and "Context: 1 selected task" the second

### Requirement: Ask from the command bar
When the assistant is available to the user, the command bar's Ask mode SHALL hand its text to the assistant as one turn on Enter, through the same path as the Ask composer: to the panel, or to the Assistant page while it is open. It SHALL be absent when the assistant is unavailable; no composer, hint or Ask segment SHALL be shown to a user without the assistant.

#### Scenario: Member without the assistant
- **WHEN** the owner has not enabled the assistant and a member opens the command bar
- **THEN** the segmented control shows Search, Add and Commands only, and `?` is ordinary text

#### Scenario: Ask hands over one turn
- **WHEN** a user with consent recorded types `?plan my afternoon` in the bar and presses Enter
- **THEN** the assistant panel opens, "plan my afternoon" is sent as one turn, and the token usage is counted as for a turn from the panel
