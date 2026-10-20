# Spec Delta

## MODIFIED Requirements

### Requirement: Capture screen
`/share` SHALL show a quick-add style title field prefilled with the shared title (or the URL's host), a description prefilled with the shared text followed by the URL, a project picker defaulting to the Inbox, and Save and Cancel actions; Enter saves, Escape cancels, focus starts in the title. Saving SHALL create the task in the local store as one operation set that syncs and converges like any quick-add task; nothing SHALL be saved without the user's confirmation. When the payload carries an `http` or `https` URL, the saved task SHALL also carry the origin `{kind: "url", url, title}` with the shared title (not the edited task title) as `title`; a URL of a recognised issue host SHALL be stored as `kind: "issue"` with its provider and id, derived on the device without any request. The URL SHALL still be written into the description, so the notes read as before.

#### Scenario: Save with selection
- **WHEN** the capture screen is opened with title `Interesting article`, text `the quoted paragraph` and url `https://example.org/post` and the user presses Enter
- **THEN** a task titled `Interesting article` exists in the Inbox with a description of the quoted paragraph followed by the URL, with origin `{kind: "url", url: "https://example.org/post", title: "Interesting article"}`, and the screen returns to the previous view or closes if it was opened as a popup

#### Scenario: Issue page shared from the extension
- **WHEN** the extension opens the capture screen for `https://github.com/o/r/issues/7` with the page title and the user saves
- **THEN** the task's origin is `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7", title: <page title>}`, its notes end with the URL, and no request was made to that host

#### Scenario: Share without a URL
- **WHEN** an app shares only a text
- **THEN** the task is created with the text as description and no origin

#### Scenario: Shared offline
- **WHEN** the device has no network and the user saves a shared page
- **THEN** the task with its origin is in the local store at once and both upload as one batch when the network returns

#### Scenario: File into a project
- **WHEN** the user picks the project "Reading" before saving
- **THEN** the task is created in "Reading"

#### Scenario: Cancel
- **WHEN** the user presses Escape
- **THEN** no task is created and the screen closes or returns to the previous view
