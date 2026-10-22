# comments Specification

## Purpose
Lets people discuss a task in place with threaded markdown comments that sync with the task, work offline, and respect authorship and project roles.

## Requirements

### Requirement: Comment entity
A comment SHALL belong to one task and SHALL have a markdown body, an author, an optional parent comment for threading, a creation time, an optional edit time, an optional deletion time, a list of mentioned accounts, per-account reactions, and, for a comment written by a guest through a task page (OpenSpec change `task-pages`), the guest's typed name and the page's id. The guest name is content and is encrypted like the body for an encrypted account; the author of a guest comment is the page's publisher. Comments SHALL be stored and synced as operations in the scope of their task, so they are created offline and converge by per-field last-writer-wins on every device of every member. The body SHALL stay a Markdown string whatever editor wrote it; no second body representation is stored.

#### Scenario: Comment offline
- **WHEN** a member writes a comment on a shared task while offline and later reconnects
- **THEN** the comment appears immediately on their device, and on every other member's devices after their next sync, under the same task

#### Scenario: Comment on a personal task
- **WHEN** a user comments on a task in their Inbox
- **THEN** the comment syncs between their own devices and is visible to nobody else

#### Scenario: Invalid comment
- **WHEN** a device submits a comment whose body is not a string, exceeds 64 KB, or names a task that is not in a scope the author can read
- **THEN** the batch is refused as invalid or the operation is rejected, and nothing is stored

#### Scenario: Guest comment
- **WHEN** a guest named Marco replies through a task page
- **THEN** the comment carries `guest_name` "Marco", the page's `page_id` and the publisher as author, and every member's device shows it by "Marco (guest)"

#### Scenario: Rich comment is Markdown on the wire
- **WHEN** a member writes a comment with a heading, a table and an embedded image in the editor and posts it
- **THEN** the `body` operation carries one Markdown string with the heading, a pipe table and `![…](attachment:<id>)`, and the REST representation returns that string

### Requirement: Threading
A comment MAY reply to another comment on the same task. Replies SHALL be shown nested one level under the comment they answer, in creation order; a reply to a reply SHALL attach to the same thread. A reply whose parent is deleted SHALL remain visible under a placeholder for the deleted parent. Thread structure derives from synced fields, so it converges on every device.

#### Scenario: Reply
- **WHEN** Bob replies to Alice's comment
- **THEN** his comment is shown indented under hers on every device, after any earlier replies

#### Scenario: Parent deleted
- **WHEN** Alice deletes her comment that has two replies
- **THEN** the replies remain visible under a "comment deleted" placeholder

### Requirement: Authorship and permissions
Any member who can read a task SHALL be able to comment on it, viewers included. Only the author SHALL edit a comment; the author, project admins and the owner SHALL be able to delete it. The author SHALL be set by the server to the submitting account, and the server SHALL check these rules per operation at receipt time, rejecting violations so the server state stays unchanged on every device.

#### Scenario: Viewer comments
- **WHEN** a viewer of a shared project posts a comment
- **THEN** the comment is accepted and visible to all members

#### Scenario: Editing someone else's comment
- **WHEN** a device submits a body change for a comment written by another account
- **THEN** the operation is rejected with reason `forbidden` and the body is unchanged everywhere

#### Scenario: Forged author
- **WHEN** a device submits a comment whose author field names another account
- **THEN** the operation is rejected with reason `forbidden` and nothing is stored

### Requirement: Edit and delete own comments
Editing SHALL replace the body and set the edit time, shown as "edited" on every device. Deleting SHALL set a deletion time; the body SHALL no longer be shown or served, while the comment keeps its place in the thread. Both work offline and converge: a delete wins over any concurrent edit by last-writer-wins on the deletion field.

#### Scenario: Edit shows marker
- **WHEN** the author edits a comment and devices sync
- **THEN** all devices show the new body with an "edited" marker

#### Scenario: Concurrent edit and delete
- **WHEN** the author edits a comment offline on one device and deletes it offline on another, then both sync
- **THEN** the comment is deleted on every device and the edited body is not shown

### Requirement: Mentions
A comment body MAY mention project members as `@name`; the client SHALL offer completion from the local membership cache, and the mentioned account ids SHALL be stored with the comment. The server SHALL keep only mentions of current members and SHALL notify each mentioned member through the notification hook. Mentions in personal tasks SHALL be ignored.

#### Scenario: Mention a member
- **WHEN** Alice types `@Bo`, picks Bob and posts the comment
- **THEN** Bob is listed in the comment's mentions and receives an unread notification naming Alice and the task after his next sync

#### Scenario: Mention a non-member
- **WHEN** a device submits mentions that include an account not in the project
- **THEN** that id is dropped from the stored mentions, the comment is still stored, and no notification is sent for it

### Requirement: Markdown rendering
Comment bodies SHALL be rendered as a safe markdown subset: paragraphs, headings, emphasis, strike-through, inline code, code blocks, links, bullet, numbered and check lists, block quotes, pipe tables, images that name an attachment of the same task, and mentions of members. Raw HTML in a body SHALL be shown as text, links SHALL open in a new tab without referrer, an image SHALL be loaded only from the app's own authenticated attachment route or from a blob decrypted on the device (never from a third-party address, which renders as a link), and rendering SHALL be identical online and offline since it happens on the device.

#### Scenario: Script in a comment
- **WHEN** a comment body contains an HTML script tag
- **THEN** it is displayed as literal text and nothing executes

#### Scenario: Link
- **WHEN** a comment contains a markdown link
- **THEN** it renders as a clickable link that opens in a new tab

#### Scenario: Table
- **WHEN** a comment body contains a pipe table with a header row and two rows
- **THEN** it renders as a table with a header, readable without horizontal page scroll at 360 px (the table scrolls inside its own box)

#### Scenario: Image from the web stays a link
- **WHEN** a comment body contains `![photo](https://example.org/a.png)`
- **THEN** no request leaves for example.org and the text renders as a link to that address named "photo"

#### Scenario: Embedded attachment while uploading
- **WHEN** a comment embeds an image attachment whose bytes have not been uploaded yet
- **THEN** a placeholder with the file name and "Uploading" is shown where the image will appear, and the image replaces it once the bytes are available on this device

### Requirement: Comment routes
`GET /api/v1/tasks/{id}/comments` SHALL return the task's non-deleted comments in thread order; creating, editing and deleting comments through the API SHALL use `POST /api/v1/tasks/{id}/comments`, `PATCH` and `DELETE /api/v1/comments/{id}` and SHALL write through the operation log. All routes SHALL require authentication and apply the authorship rules.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any comment route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Comment on an unreadable task
- **WHEN** an authenticated user posts a comment on a task in a project they are not a member of
- **THEN** the response is a 404 `not_found` error and nothing is stored

### Requirement: Comment thread in the client
The task detail panel SHALL show the comment threads in its Comments tab, oldest first, with the composer pinned to the bottom of the panel below the newest thread, and reply, edit and delete actions, and a comment count on task rows and on the tab. An empty thread SHALL be one line of text above the composer, not a card. Everything SHALL be reachable with the keyboard and SHALL render from local storage so threads are readable and writable offline.

#### Scenario: Keyboard-only comment
- **WHEN** the user focuses the composer with its shortcut, types a body and presses the submit key combination
- **THEN** the comment is posted and the composer clears, with no mouse interaction

#### Scenario: Count on rows
- **WHEN** a task has three comments
- **THEN** its row shows a comment indicator with the number three

#### Scenario: Chronological reading
- **WHEN** a task has comments posted on Monday, Tuesday and Wednesday
- **THEN** the Comments tab lists Monday's thread first and Wednesday's last, directly above the composer

#### Scenario: Empty thread
- **WHEN** a task has no comments
- **THEN** the tab reads "No comments yet" in one line and the composer is visible beneath it without scrolling

### Requirement: Readable comment presentation
Each comment SHALL show the author's avatar initials and name, a relative time with the absolute time in the user's date and time format on hover and focus, an "edited" marker when edited, and the body with comfortable line length and spacing. Reply, Edit and Delete SHALL take no space at rest: on a fine pointer they SHALL appear on hover and focus at the end of the comment's header line; on touch devices they SHALL be reachable at all times from one "More actions" control on that line. Root comments SHALL be spaced as one thread, without empty rows between them. Replies SHALL be indented under their comment with a connecting line. A comment the user has just posted SHALL be scrolled into view.

#### Scenario: Absolute time on focus
- **WHEN** the user focuses the relative time "2 h ago" of a comment
- **THEN** the full date and time are announced and shown in the user's chosen format

#### Scenario: Actions on touch
- **WHEN** the user views a comment on a phone
- **THEN** a "More actions" control is visible on the comment's header line, and it offers Reply, and Edit and Delete on the user's own comments

#### Scenario: No gaps in the thread
- **WHEN** a task with 14 one-line comments is open on a 1280×800 screen and the pointer is not over the thread
- **THEN** consecutive comments are at most 24 px apart, and hovering a comment does not change the position of any other comment

#### Scenario: Posted comment in view
- **WHEN** the user posts a comment on a task with 30 comments
- **THEN** the new comment is visible above the composer without scrolling

### Requirement: Composer behaviour
The composer SHALL rest as a single line and expand when focused, when it holds a draft or a reply target, or when its shortcut is pressed. Expanded, it SHALL be the rich-text editor of this app (the one used for notes) with the editing features of `rich-text-editing` except Make subtask, SHALL grow with its content up to a limit, keep @-mention completion, show the submit key combination, keep an unsent draft per task on the device while the panel is closed, and show the reply target with a way to cancel it when replying. While the editor is still loading on a device that has never opened it, typed text SHALL be kept in a plain field and submitted as plain Markdown if the user submits first. The composer SHALL serialise to Markdown on submit within the documented subset, and editing an existing comment SHALL open its Markdown in the editor so that a comment opened and submitted unchanged keeps the same body.

#### Scenario: Draft survives closing the panel
- **WHEN** the user types a comment, closes the panel without sending and reopens the task on the same device
- **THEN** the draft is still in the expanded composer, and it is not visible on other devices

#### Scenario: Cancel a reply
- **WHEN** the user chooses Reply on a comment and then cancels the reply target
- **THEN** the composer posts a new top-level comment instead

#### Scenario: Collapses when left empty
- **WHEN** the user focuses the composer, types nothing and moves focus elsewhere
- **THEN** the composer returns to its single resting line

#### Scenario: Formatting from the keyboard
- **WHEN** the user expands the composer, types `- ` and some text, selects a word and presses the bold shortcut, then submits with the key combination
- **THEN** the stored body is `- …**word**…` Markdown and the thread shows a bullet with the bold word, with no mouse interaction

#### Scenario: Unchanged edit is byte-identical
- **WHEN** the author opens Edit on a comment whose body uses only the documented subset and submits without changing anything
- **THEN** no operation is produced, because the serialised body equals the stored body

#### Scenario: Text outside the subset survives an edit
- **WHEN** the author edits a comment whose body contains `<details>` HTML and a footnote reference, changes one word elsewhere and submits
- **THEN** the HTML and the footnote text are still in the body verbatim, shown as text, and only the word changed

### Requirement: Reactions
A member who can read a task SHALL be able to add and remove reactions on any non-deleted comment of it, from a closed set of six named reactions: thumbs up, heart, check, eyes, party popper and question. Reactions SHALL be stored on the comment as one additive field per reacting account, `reactions.<account id>`, holding that account's list of reaction names (distinct, at most six), written only by that account; the server SHALL reject a reaction field whose account id is not the submitting account with reason `forbidden`, and an unknown reaction name as invalid. Reactions SHALL work offline and converge: each account's list converges by last-writer-wins across that account's own devices, and different accounts' reactions never overwrite each other. Reactions SHALL be plaintext for encrypted accounts and SHALL be included in the export and the own-format import. Each comment SHALL show its reactions as a row of icons with counts, each toggling the viewer's own reaction, with the names of who reacted in the tooltip and announced to assistive technology; a comment with no reactions SHALL show an Add reaction control only on hover, focus or, on touch, from the comment's More actions.

#### Scenario: Two people react concurrently
- **WHEN** Alice adds a heart and Bob adds a thumbs up to the same comment while both are offline, then both sync
- **THEN** every device shows one heart by Alice and one thumbs up by Bob

#### Scenario: Toggle own reaction
- **WHEN** Alice has reacted with a heart and activates the heart again
- **THEN** her reaction is removed on every device after sync and the count drops by one

#### Scenario: Reacting for someone else
- **WHEN** a device submits `reactions.<Bob's id>` as Alice
- **THEN** the operation is rejected with reason `forbidden` and Bob's reactions are unchanged everywhere

#### Scenario: Unknown reaction
- **WHEN** a device submits a reaction list containing `fire`
- **THEN** the operation is rejected as invalid and the account's reactions are unchanged

#### Scenario: Keyboard reaction
- **WHEN** the user moves to a comment with the keyboard, opens Add reaction and picks Check with Enter
- **THEN** the check reaction is added with no mouse interaction and focus returns to the comment

#### Scenario: Deleted comment
- **WHEN** a comment is deleted
- **THEN** its reactions are no longer shown and reacting to it is refused

### Requirement: Reaction routes
`GET /api/v1/tasks/{id}/comments` SHALL return each comment with `reactions`, a map from reaction name to the list of account ids that reacted, and `my_reactions`, the caller's own list. `PUT /api/v1/comments/{id}/reactions` with `{reactions: [names]}` SHALL replace the caller's own list through the operation log and return the updated comment; it SHALL require authentication, SHALL refuse `read` and `agent` tokens with 403 `insufficient_scope`, SHALL answer 404 `not_found` for a comment the caller cannot read or that is deleted, and 400 `invalid_input` for an unknown name or more than six.

#### Scenario: Script reacts
- **WHEN** a script with a `full` token puts `{reactions: ["thumbs_up"]}` on a readable comment
- **THEN** the response is 200 with the comment, `my_reactions` is `["thumbs_up"]`, and devices see the reaction after their next sync

#### Scenario: Anonymous request
- **WHEN** a request without credentials puts reactions
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token
- **WHEN** a `read` token puts reactions
- **THEN** the response is 403 `insufficient_scope` and nothing changes

#### Scenario: Unreadable or deleted comment
- **WHEN** the comment is in a project the caller is not a member of, or is deleted
- **THEN** the response is 404 `not_found` in both cases

#### Scenario: Invalid list
- **WHEN** the body is `{reactions: ["thumbs_up", "fire"]}`
- **THEN** the response is 400 `invalid_input` naming `fire`
