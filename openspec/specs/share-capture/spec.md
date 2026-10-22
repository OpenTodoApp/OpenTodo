# share-capture Specification

## Purpose
Defines how content from other apps and web pages becomes a task: the app as a system share target, the capture screen that confirms and files the shared title, text and URL, the bookmarklet and browser extension that reach the same screen, and the limits that keep shared payloads safe.

## Requirements

### Requirement: Web Share Target registration
The web app manifest SHALL declare a share target on `/share` receiving `title`, `text`, `url` and `files` as a `POST` with `multipart/form-data`, so the installed app is offered in the share sheet for text, links, images and documents. The service worker SHALL answer the `POST` itself, keep the files in a device-local hand-over store and redirect to the capture screen of the precached shell, so a share works offline. `GET /share` with query parameters SHALL keep working.

#### Scenario: Share from a mobile browser
- **WHEN** the user installs the app, opens a web page in another app and chooses the app from the share sheet
- **THEN** the capture screen opens with that page's title and URL prefilled

#### Scenario: Share while offline
- **WHEN** the device has no network and the user shares a page to the installed app
- **THEN** the capture screen opens and saving creates the task locally, to be uploaded when the network returns

#### Scenario: Share an image
- **WHEN** the user shares an image from another app to the installed app
- **THEN** the service worker stores the image on the device and the capture screen opens with the image listed

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

### Requirement: Capture when signed out
When `/share` is opened on a device that is not signed in, the client SHALL keep the shared payload in memory, show the sign-in screen, and return to the capture screen with the payload intact after sign-in. The payload SHALL not be sent to the server before the user saves. Shared files SHALL live only in the device-local hand-over store the service worker filled, SHALL be removed from it when the share is saved or cancelled and after ten minutes at the latest, and SHALL be cleared at sign-out.

#### Scenario: Sign in then capture
- **WHEN** a signed-out device opens `/share?title=Fix&url=https://example.org`
- **THEN** after successful sign-in the capture screen shows `Fix` and the URL, ready to save

#### Scenario: Shared file is not kept
- **WHEN** a signed-out device receives a shared image and the user cancels the capture
- **THEN** the image is removed from the hand-over store and was never sent to the server

### Requirement: Bookmarklet
Settings SHALL offer a bookmarklet, generated for the server's own origin, that the user can drag to the bookmarks bar. Activating it on any page SHALL open `/share` in a small popup window with that page's URL, title and current text selection. The bookmarklet SHALL contain no token or credential.

#### Scenario: Use the bookmarklet
- **WHEN** the user selects a sentence on a web page and clicks the bookmarklet
- **THEN** a popup shows the capture screen with the page title, the selected sentence and the URL, and closes after saving

#### Scenario: Bookmarklet without a session
- **WHEN** the bookmarklet is used on a browser that is not signed in to the app
- **THEN** the popup shows the sign-in screen and continues to the capture screen afterwards

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

### Requirement: Payload limits and hygiene
The capture screen SHALL treat shared title and text as plain text, SHALL truncate the title to 500 characters and the text to 16 KB, SHALL keep a shared URL only when its scheme is `http` or `https`, SHALL accept at most 10 shared files and none over the per-file limit, and SHALL ignore anything else. Opening `/share` SHALL never execute shared content, render a shared file as a document, or navigate to the shared URL.

#### Scenario: Unsafe URL dropped
- **WHEN** the share payload carries `url=javascript:alert(1)`
- **THEN** the description contains no URL and the rest of the payload is shown normally

#### Scenario: Oversized text
- **WHEN** the shared text is 40 KB long
- **THEN** the description holds the first 16 KB followed by a truncation note

#### Scenario: HTML file shared
- **WHEN** a shared file is an HTML document
- **THEN** it is listed by name, type and size only, never rendered, and is attached as a file that downloads rather than opens

### Requirement: Shared files on the capture screen
Files received by the share target SHALL be listed on the capture screen with name, type and size (a thumbnail for images), each removable before saving. Saving SHALL create the task and one attachment per file in one local operation batch and queue the bytes for upload, so a share works offline exactly like a text share. At most 10 files per share SHALL be accepted; files over the last known per-file limit SHALL be refused with the limit named before saving.

#### Scenario: Share a photo offline
- **WHEN** the device has no network and the user shares a photo from the gallery to the installed app and presses Enter
- **THEN** a task titled after the file name exists in the Inbox with the photo as an uploading attachment, and the photo uploads on the next sync

#### Scenario: Share text with a file
- **WHEN** an app shares a title, a text and a PDF
- **THEN** the capture screen shows the title and text as before and the PDF below them, and saving creates the task with the PDF attached

#### Scenario: Oversized file
- **WHEN** a shared file is larger than the per-file limit
- **THEN** the capture screen lists it as refused with the limit named, and saving creates the task without it

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

### Requirement: Share target accepts only the share sheet and the app
The service worker SHALL store a `POST /share` only when the request's `Sec-Fetch-Site` is `none` or `same-origin`, or the header is absent (older browsers), and only when the share, files and text together, is at most 100 MB (a declared `Content-Length` over the cap is refused before the body is read). Any other request SHALL be redirected to the app without storing anything.

#### Scenario: Share from the system share sheet
- **WHEN** the share sheet posts a photo to `/share` with `Sec-Fetch-Site: none`
- **THEN** the share is stored and the capture screen opens with it

#### Scenario: Form on another website
- **WHEN** a page on another site submits a form to `/share` (`Sec-Fetch-Site: cross-site`)
- **THEN** the app opens and nothing is stored

#### Scenario: Share over the cap
- **WHEN** a share holds files of 150 MB in total
- **THEN** the app opens and nothing is stored

### Requirement: Extension icon
The browser extension's toolbar and store icons (16, 48 and 128 px) SHALL be the colour variant of the brand mark, generated from the app's one brand source by the brand script, never drawn by hand, and a test SHALL fail when they differ from the source. The extension's version SHALL be raised when the icons change so the stores and installed copies pick them up.

#### Scenario: Icons regenerated
- **WHEN** the brand script runs
- **THEN** the three extension icons are written from the brand source and `make test-extension` compares them against it

#### Scenario: Toolbar icon
- **WHEN** the extension is loaded in Chrome and in Firefox
- **THEN** the toolbar shows the brand mark on its slate square at 16 px, legible in light and dark browser themes

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
