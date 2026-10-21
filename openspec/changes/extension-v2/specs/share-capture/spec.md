## MODIFIED Requirements

### Requirement: Browser extension
The repository SHALL include a browser extension for Chromium-based browsers and Firefox with a toolbar button, a keyboard shortcut and context-menu entries "Add to OpenTodo" (on a page, a selection, a link and an image) and "Add screenshot to OpenTodo". The toolbar button and the shortcut SHALL open the extension's own popup (the requirement "Extension popup"); the context-menu entries SHALL open the popup with the clicked thing already filled in. The extension SHALL work in one of two modes chosen on its options page: **Capture screen** (the default), in which saving opens `/share` on the configured server with the title line, the text and the URL as before and the extension holds no token and makes no network request; and **Quick save**, in which the user has pasted an API token and granted the extension access to the server's address, and saving creates the task through the server's API (the requirement "Quick save"). In both modes the extension SHALL store only the server URL, the mode and, in Quick save mode, the token, SHALL hold no password or session, and SHALL ask only for the permissions it needs: `activeTab`, `contextMenus`, `scripting`, `storage`, and optional access to the configured server's address only.

#### Scenario: First use asks for the server
- **WHEN** the extension is installed and used before a server URL is set
- **THEN** its options page opens asking for the server URL, and the capture continues once it is saved

#### Scenario: Capture screen mode is the default
- **WHEN** the user saves a server URL and nothing else, then presses Save in the popup on a page
- **THEN** the capture screen opens on that server in a popup window with the popup's title line as the title, the selection as the text and the page URL, and the extension has sent no request of its own

#### Scenario: Context menu capture
- **WHEN** the user right-clicks a selection and chooses "Add to OpenTodo"
- **THEN** the popup opens with the tab's title as the title line, the selection as the text and the tab's URL as the origin

#### Scenario: Screenshot capture
- **WHEN** the user chooses "Add screenshot to OpenTodo" on a page and has granted the extension access to their server
- **THEN** the capture popup opens with the page's title and URL and a PNG of the visible tab listed as a file, and nothing is saved until the user presses Save

#### Scenario: Screenshot without the host permission
- **WHEN** the user chooses "Add screenshot to OpenTodo" without having granted access to their server
- **THEN** the capture popup opens with the title and URL and explains that the screenshot could not be handed over until the permission is granted in the extension's options

#### Scenario: No background traffic
- **WHEN** the extension is installed and idle, in either mode
- **THEN** it opens no connections to any host

#### Scenario: Manifest holds no host permission
- **WHEN** the extension package is built
- **THEN** its manifest declares no `host_permissions` and no `content_scripts`, and the build fails if either is present

### Requirement: Browser extension language
The extension's name, description, context-menu entries, shortcut description, popup and options page SHALL be shown in the browser's interface language when it is one of the shipped languages (OpenSpec `localization`), else in English. Chips and messages the popup shows from the server's parse route SHALL be in the account's language, since the server renders them. The extension SHALL NOT learn or store the account's language preference.

#### Scenario: French browser
- **WHEN** the browser's interface language is French and the user right-clicks a page
- **THEN** the menu entry reads `Ajouter à OpenTodo` and the popup and the options page are in French

#### Scenario: Browser language not shipped
- **WHEN** the browser's interface language is Japanese
- **THEN** the extension's texts are English and the capture works as usual

#### Scenario: Account language differs from the browser
- **WHEN** the account's interface language is German, the browser's is English and the user types `morgen #Haus` in Quick save mode
- **THEN** the popup's labels and buttons are English, and the chips under the line read the date and the project in German because the server rendered them

## ADDED Requirements

### Requirement: Extension popup
The toolbar button, the shortcut (Alt+Shift+O by default, changeable in the browser's shortcut settings) and the context-menu entries SHALL open a popup inside the browser with: one quick-add line, prefilled with the tab's title (or the link's text for a link, or the file name for an image) and focused with the text selected; the selected text, when any, as a description preview under it; a project picker and a label picker; the page address shown as the task's origin, removable; a Save button and a link to the options page. Enter SHALL save and Escape SHALL close without saving. The popup SHALL fit a width of 360 CSS pixels, SHALL be operable by keyboard alone, and SHALL show the browser's interface language. The popup SHALL open on every page, including pages the browser protects (where the selection cannot be read, the line is the tab's title alone).

#### Scenario: Popup from the toolbar
- **WHEN** the user clicks the toolbar button on an article titled "How to bleed a radiator"
- **THEN** the popup shows "How to bleed a radiator" in the line with the text selected, the page address as the origin, Inbox as the project, and Save

#### Scenario: Protected page
- **WHEN** the user opens the popup on the browser's extensions page
- **THEN** the popup opens with the tab's title and no selection, and Save works as on any page

#### Scenario: Escape closes without a trace
- **WHEN** the user types a line in the popup and presses Escape
- **THEN** the popup closes, nothing is saved, and nothing is stored

### Requirement: Quick save
In Quick save mode, Save SHALL create the task through `POST /api/v1/tasks` on the configured server with the token, with the line's title and the fields the parse route returned (date, deadline, Someday, evening, project, labels, priority, estimate, recurrence), the origin the parse route recognised for the page address (or the page address as a `url` origin), and the selected text followed by the page address as the description; it SHALL then create the parse's reminders and tracked time exactly as the command-line client does for `ot add --natural`. A label the parse named that does not exist SHALL be created first through the API. The popup SHALL show "Saved" with a link that opens the task on the server, and SHALL close after two seconds or on Escape. Save SHALL be refused, with the text kept, while the server has not answered: a double press creates one task. When the server cannot be reached, answers 401 or 403, or the request times out, the popup SHALL keep everything the user typed, say what happened in plain words, and offer **Open capture screen**, which continues in Capture screen mode with the same line, text and address.

#### Scenario: Save with parsed fields
- **WHEN** Quick save is on, the user edits the line to `Call the plumber tomorrow 9am #Home @call p1 remind me at 8` and presses Enter
- **THEN** one task "Call the plumber" exists in the Home project with the label call, priority 1, due tomorrow at 09:00, one reminder at 08:00, the page as its origin and the page address at the end of its description, the popup says "Saved" with a link to it, and every device sees the task on its next sync

#### Scenario: New label
- **WHEN** the line names `@plumbing` and no label of that name exists
- **THEN** the label is created, the task carries it, and a second save with the same label reuses it

#### Scenario: Server unreachable
- **WHEN** the user presses Save and the server does not answer within ten seconds
- **THEN** the popup keeps the line, the text and the address, says the server could not be reached, and offers "Open capture screen", which opens `/share` on the server with the same content

#### Scenario: Token refused
- **WHEN** the token was revoked on the server and the user presses Save
- **THEN** the popup says the token no longer works and points to the options page, keeps the text, and offers the capture screen; nothing is retried on its own

#### Scenario: Read token
- **WHEN** the options page is given a `read` token
- **THEN** the options page says the token can parse but not save, Quick save stays off, and the popup saves through the capture screen

#### Scenario: No double task
- **WHEN** the user presses Enter twice while the first request is in flight
- **THEN** one task is created

### Requirement: Parse preview in the popup
In Quick save mode, the popup SHALL send the line to the server's parse route while the user types, no more than once every 150 milliseconds and never with an empty line, and SHALL show the result under the line as chips in the account's language: the date, the deadline, Someday or Evening, the project, each label, the priority, the estimate, the tracked time, the recurrence, each reminder, and an "unmatched" chip for a `#name` that names no project. Choosing a project or a label in the pickers SHALL override the parsed one. In Capture screen mode the popup SHALL show no chips, and the capture screen parses the line as today.

#### Scenario: Chips follow the line
- **WHEN** Quick save is on and the user types `Pay the bill friday p2 #Finance`
- **THEN** within a moment the popup shows a date chip for the coming Friday, a priority chip "p2" and a project chip "Finance", and the project picker shows Finance selected

#### Scenario: Unknown project
- **WHEN** the line names `#Fiance`
- **THEN** a grey chip says no project has that name, and saving keeps `#Fiance` in the title

#### Scenario: Parse route unavailable
- **WHEN** the server does not answer the parse request
- **THEN** the popup shows no chips, says nothing, and Save still works with the line as the title

### Requirement: Context menu on links, images and selections
"Add to OpenTodo" SHALL appear on a page, a selection, a link and an image. On a link the popup's line SHALL be the link's text (the link's address when the text is empty) and the origin the link's address; on an image the line SHALL be the image's file name, the tab's address SHALL be the origin, and the image's address SHALL be the first line of the description as a link, without the extension fetching the image; on a selection the line SHALL be the tab's title and the selection the description. Nothing SHALL be saved until the user saves in the popup.

#### Scenario: Link
- **WHEN** the user right-clicks a link "Radiator bleeding kit" to a shop page and chooses "Add to OpenTodo"
- **THEN** the popup's line reads "Radiator bleeding kit" and the origin is the shop page's address, not the current tab's

#### Scenario: Image
- **WHEN** the user right-clicks an image `boiler-manual.png` and chooses "Add to OpenTodo"
- **THEN** the popup's line reads "boiler-manual.png", the description starts with the image's address, and the extension made no request for the image

### Requirement: Mail message recognition
When the popup opens on an open message in Gmail (`mail.google.com`) or Outlook on the web (`outlook.office.com`, `outlook.live.com`), the line SHALL be the message's subject, the origin SHALL be the message's permalink (the tab's own address) as an `email` origin with `provider` `gmail` or `outlook`, the message or conversation id from the address as `id`, and the subject as `title`, and the description SHALL start with "From: " followed by the sender's name and address when the header could be read. The extension SHALL obtain the subject from the tab's title and the sender from the message header elements through one script run on the user's click under `activeTab`; it SHALL NOT read the message body, SHALL NOT run on any page without a click, and SHALL hold no permission for the mail hosts. A list view, a draft or a page whose message cannot be recognised SHALL be captured like any other page. In the app, such an origin SHALL show as a chip reading "Gmail" or "Outlook" that opens the message in a new tab, and `origin: gmail` and `origin: outlook` SHALL list the tasks in a filter.

#### Scenario: Gmail message
- **WHEN** the user opens the popup on a Gmail conversation whose tab is titled "Boiler service quote - me@gmail.com - Gmail" from "Acme Heating <quotes@acme.example>"
- **THEN** the line reads "Boiler service quote", the description starts with "From: Acme Heating <quotes@acme.example>", and the saved task's origin is `{kind: "email", provider: "gmail", id: <conversation id>, url: <the tab's address>, title: "Boiler service quote"}`

#### Scenario: Outlook list view
- **WHEN** the user opens the popup on the Outlook inbox list with no message open
- **THEN** the popup is filled like any page: the tab's title and address, and no "From:" line

#### Scenario: Header not readable
- **WHEN** the message header cannot be read (the page changed its structure)
- **THEN** the line is still the subject from the tab's title, the origin is still the permalink, and the description has no "From:" line

#### Scenario: Chip in the app
- **WHEN** a task saved from Gmail is shown in a list and in the panel
- **THEN** the chip reads "Gmail" with the subject as its tooltip and opens the message in a new tab

### Requirement: Extension privacy with a token
The token entered on the options page SHALL be kept in the browser's local extension storage only, never in storage that the browser synchronises between devices, and SHALL be sent only to the configured server's origin, as a bearer header, over https unless the server address is `http://localhost` or `http://127.0.0.1`. The options page SHALL verify the token against `GET /api/v1/me` when it is saved and show the account it belongs to and its scope, SHALL offer **Forget token**, and SHALL explain in one paragraph what the extension sends in each mode. The extension's store listing and privacy disclosure SHALL say the same: it talks only to the server address the user enters, stores the address, the mode and the token, collects nothing, and sends nothing to anyone else.

#### Scenario: Token stays on the device
- **WHEN** the user saves a token in one browser profile that synchronises extension settings to another device
- **THEN** the server address and the mode arrive on the other device and the token does not

#### Scenario: Plain http refused
- **WHEN** the server address is `http://todo.lan` and the user pastes a token
- **THEN** the options page refuses to save the token, says tokens travel only over https, and Capture screen mode stays available

#### Scenario: Token checked on save
- **WHEN** the user pastes a token and presses Save
- **THEN** the options page shows the account name and the scope the server reported, or the error the server returned, and Quick save turns on only for a `full` or `admin` token

### Requirement: Extension packaging for the stores
`make extension` SHALL build two packages from one source manifest, one for the Chrome Web Store and one for addons.mozilla.org, each holding only the files the extension needs, and SHALL run the browser extension linter on both; a build whose manifest version is not the first entry of the extension's own changelog SHALL fail. The repository SHALL hold the store listing texts in the six shipped languages, the privacy disclosure, the list of screenshots to upload, and a release checklist; continuous integration SHALL build and lint both packages on every push and attach them to releases.

#### Scenario: Two packages
- **WHEN** `make extension` runs
- **THEN** `dist/` holds a Chrome package and a Firefox package, the linter reports no error for either, and both contain the same scripts, popup, options page, icons and catalogs

#### Scenario: Version not described
- **WHEN** the manifest says version 0.6.0 and the extension changelog's first entry is 0.5.0
- **THEN** `make extension` fails naming the version

#### Scenario: Listing matches the manifest
- **WHEN** the listing texts and the privacy disclosure are checked
- **THEN** every permission the manifest declares is named in the disclosure, and the test fails when one is missing
