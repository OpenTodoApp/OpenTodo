# app-links Specification

## Purpose
Lets a person open links to items in other apps (Zotero, a mail, an Obsidian note) from notes, comments and a task's origin, only for the URL schemes they allowed themselves, checked and confirmed on their own device.

## Requirements

### Requirement: Personal list of app link schemes
A person SHALL be able to keep a list of URL schemes whose links open in other apps, empty by default, in Settings under **Links to other apps**. The list SHALL sync to the person's devices as a personal preference, encrypted on accounts with end-to-end encryption, and SHALL hold at most 20 schemes of the RFC 3986 scheme grammar, lower case, at most 32 characters each, optionally narrowed to one action (`obsidian:open`).

#### Scenario: Nothing changes by default
- **WHEN** a person who added no scheme views a note with `[paper](zotero://select/items/ABC)`
- **THEN** the note shows "paper" as text with the address in its tooltip, as today

### Requirement: Denied schemes
`javascript`, `data`, `vbscript`, `file`, `blob`, `about`, `filesystem`, `view-source`, `intent` and `opentodo`, the browser-internal schemes `chrome`, `chrome-extension`, `moz-extension`, `resource`, `jar`, `ms-appx` and `ms-appx-web`, the system handlers `ms-msdt`, `search-ms`, `search`, `ms-officecmd` and `jnlp`, and every scheme starting `ms-cxh` SHALL never open as app links, and SHALL be refused when added to the list. A link holding a control, format, line or paragraph separator or space character anywhere (a bidi override such as U+202E included) SHALL not be an app link. `http`, `https` and `mailto` SHALL keep their own rules and never count as app links. Go, TypeScript and the shells SHALL run one shared set of vectors for the grammar and the deny list.

#### Scenario: Deny list wins
- **WHEN** a person tries to add `javascript` to the list
- **THEN** it is refused with a message, and a `javascript:` link stays text everywhere

#### Scenario: A hidden character
- **WHEN** a note holds `zotero://select/items/A` with a U+202E right-to-left override inside it, and the viewer allowed `zotero`
- **THEN** it stays text

### Requirement: Links open for the viewer's list only
A note or comment link and a `url` origin whose URL is an app link SHALL be stored as written, and SHALL be clickable for a viewer only when the viewer's own list allows its scheme. The first time a scheme opens on a device, a confirmation SHALL show the full link with **Open** and "Don't ask again for `<scheme>:`". An app link SHALL carry no address the browser can follow: a click, a middle click, Enter, a tap, and a plain click in a read-only note SHALL each open it only through that confirmation. The assistant tools SHALL never write an app link as an origin, and an import SHALL never restore the list of schemes.

#### Scenario: Shared project
- **WHEN** Ana, who allowed `zotero`, and Ben, who did not, view the same task whose origin is `zotero://select/items/ABC`
- **THEN** Ana's chip opens it after the first confirmation on her device, and Ben's chip is plain text

#### Scenario: A read-only note
- **WHEN** Ben, who allowed `shortcuts`, views a read-only note of Ana's with a `shortcuts://run-shortcut?name=X` link and clicks it, or middle-clicks it
- **THEN** the confirmation shows the full link first, and nothing opens until he chooses Open

### Requirement: CalDAV URL as origin
A VTODO `URL` that is an app link SHALL become the task's origin when the task has none, and a later `URL` SHALL update an origin CalDAV set; an `http(s)` `URL` SHALL keep its current handling.

#### Scenario: Tasks CalDAV Sync backlink
- **WHEN** a client sends a VTODO with `URL:obsidian://open?vault=V&file=Note` for a task without an origin
- **THEN** the task's origin becomes that link

### Requirement: Shells open only allowed app links
The Android and iOS shells SHALL offer capability `app-links` and SHALL hand a link to the system only when its scheme is on the list the page passes and not on the shell's own deny list.

#### Scenario: Denied in the shell
- **WHEN** the page asks the shell to open `intent://…` with `intent` on the passed list
- **THEN** the shell opens nothing
