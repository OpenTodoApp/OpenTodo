# feedback Specification

## Purpose
How people tell the project that something isn't working, or say hello: one dialog that drafts the report with the facts the app knows, opens it as a GitHub issue or an email to the project's feedback address, and sends nothing by itself.

## Requirements

### Requirement: Something isn't working
The account menu SHALL offer "Something isn't working" directly under Help, with no shortcut. Choosing it SHALL open a dialog titled "Something isn't working", with a line that a hello is welcome, a text box, and the actions Open on GitHub, Send by email, and Cancel. The text box SHALL start with the person's words, then a blank line, then a context block the person can edit or delete. The context block SHALL contain only the server version when it is known (otherwise "unknown"), the current page path, a short browser description, the active language, and whether the app is offline. It SHALL NOT contain the account's name, email, id, or any task content unless the person typed it. Escape and Cancel SHALL close the dialog and return focus to the control that opened it. The dialog SHALL work offline. The same dialog SHALL open from Settings → About → Feedback and problems.

#### Scenario: From the account menu
- **WHEN** the user opens the account menu and chooses Something isn't working
- **THEN** the dialog opens with focus in the text box, the context block names the page they were on, and the menu is closed

#### Scenario: A hello
- **WHEN** the user types "hi" and leaves the context block as it is
- **THEN** both actions are available and the text they will send starts with "hi"

#### Scenario: Context removed
- **WHEN** the user deletes the context block and leaves only "the date picker closes by itself"
- **THEN** the text the actions carry is that sentence alone

#### Scenario: Offline
- **WHEN** the user opens the dialog with no network connection
- **THEN** the dialog is usable, the version line reads unknown when the server version was never received, and both actions are still offered

### Requirement: The two doors send nothing from the app
Open on GitHub SHALL open the new-issue page of the OpenTodo repository in a new tab, with the text box as the issue body and the first line of the text as the title. Send by email SHALL open the person's mail program with a new message to the project's published feedback address, the same title as the subject, and the text box as the body. The app SHALL issue no request of its own for either action: no fetch, and no request through the server. When the resulting address would be longer than 1800 characters, the app SHALL copy the text to the clipboard, open the door without the body, and tell the person it was copied so they can paste it. If the clipboard is refused, the text SHALL stay selected in the box and the dialog SHALL say to copy it. Activating either door SHALL NOT include a label, an account id, or an instance id that the person did not type.

#### Scenario: GitHub
- **WHEN** the user activates Open on GitHub with a short message
- **THEN** a new tab opens on the repository's new-issue page with that message as the body, and the app has made no request other than that navigation

#### Scenario: Email
- **WHEN** the user activates Send by email with a short message
- **THEN** the mail program opens addressed to the published feedback address with that message as the body, and the app has made no request

#### Scenario: A very long message
- **WHEN** the text box holds more than 1800 characters and the user activates Open on GitHub
- **THEN** the new-issue page opens without the body, the text is on the clipboard, and the dialog says it was copied

#### Scenario: Nothing is attached
- **WHEN** the user sends either way without editing the context block
- **THEN** the body has no account email, no user id, and no task title
