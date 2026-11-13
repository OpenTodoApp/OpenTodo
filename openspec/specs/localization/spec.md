# localization Specification

## Purpose
Lets each user read and operate the web app in their own language: the interface language preference and how it syncs, the shipped languages and their catalogs, how text, dates, plurals and server errors follow the language, the Settings panel, and the checks that keep every string translated.

## Requirements

### Requirement: Interface language preference
Each user SHALL have an interface language preference whose value is `system` or the code of a shipped language. It SHALL default to `system`, which means the first of the browser's preferred languages that is shipped, else English. A client SHALL treat an unknown or missing value as `system` and SHALL leave the stored value unchanged.

Chinese SHALL be resolved by script and region, not by the primary subtag alone. When Simplified Chinese is shipped, the tags `zh`, `zh-Hans`, `zh-CN` and `zh-SG`, and a `zh` tag whose script is `Hans`, SHALL resolve to `zh`. The tags `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO`, a `zh` tag whose script is `Hant`, and any other `zh` tag SHALL NOT resolve to `zh`. The browser's list SHALL be walked in order. A stored preference `zh` means Simplified Chinese on every device. Dates and numbers SHALL use the browser's own tag when that tag resolves to `zh`, and SHALL use `zh` otherwise.

The preference SHALL be written as an operation on the user's personal data. It SHALL be editable offline and take effect at once on the editing device, SHALL converge by last-writer-wins, and SHALL be part of the JSON export like the date and time preferences.

#### Scenario: New account on a German browser
- **WHEN** a user whose browser prefers `de-CH` opens the app without ever choosing a language
- **THEN** the interface is shown in German

#### Scenario: Browser language not shipped
- **WHEN** the browser prefers only Japanese
- **THEN** the interface is shown in English and no error is shown

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives a language code it does not ship
- **THEN** it behaves as `system` and keeps the stored value unchanged

#### Scenario: Simplified Chinese browser
- **WHEN** a user whose browser prefers `zh-CN` opens the app without ever choosing a language, and Simplified Chinese is shipped
- **THEN** the interface is Simplified Chinese and dates and numbers use the `zh-CN` locale

#### Scenario: Traditional Chinese browser
- **WHEN** the browser prefers only `zh-TW`, `zh-HK`, `zh-MO` or `zh-Hant`
- **THEN** the interface is shown in English and no error is shown

#### Scenario: Traditional tag ahead of a simplified tag
- **WHEN** the browser prefers `zh-TW` and then `zh-CN`, and the account has not chosen a language
- **THEN** the interface is Simplified Chinese

#### Scenario: Chosen Chinese on an English browser
- **WHEN** the user has chosen Simplified Chinese and the browser prefers `en-US`
- **THEN** dates and numbers use the `zh` locale

#### Scenario: Older client receives Chinese
- **WHEN** a device running a release without Simplified Chinese receives `language: "zh"` from another device
- **THEN** it behaves as `system` and keeps the stored value, and the newer device stays in Simplified Chinese

#### Scenario: Chosen offline
- **WHEN** the installed app is offline and the user picks 简体中文
- **THEN** the interface switches to Simplified Chinese immediately and the change reaches the other devices on the next sync, converging by last-writer-wins

### Requirement: Language is personal, synced and offline
The preference SHALL be written as an operation on the user's personal data, so it applies on every device of that user and never on another user's, SHALL be editable offline and take effect at once on the editing device, SHALL converge by last-writer-wins, and SHALL be part of the JSON export like the date and time preferences.

#### Scenario: Change on one device
- **WHEN** the user sets the language to French on a laptop and a phone later syncs
- **THEN** the phone's interface switches to French without a reload

#### Scenario: Change offline
- **WHEN** the installed app is offline and the user picks Italian
- **THEN** the interface switches to Italian immediately and the change reaches the other devices on the next sync

#### Scenario: Concurrent edits
- **WHEN** device A picks German and device B picks Spanish, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

#### Scenario: Not shared with project members
- **WHEN** a user who shares a project picks Portuguese
- **THEN** the other member's devices keep their own language

### Requirement: Interface text follows the language
Every text the client renders SHALL come from the active language: views, menus, dialogs, Settings, toasts, the shortcut overlay, placeholders, tooltips, screen-reader labels and names, relative date words, and the wording of activity and history entries. A message missing from the active catalog SHALL be shown in English. User-written content (titles, notes, comments, names) is never translated.

#### Scenario: Task list in German
- **WHEN** the language is German and the user opens Today with an overdue task
- **THEN** the headings, the row's due label, the quick-add placeholder and the row menu are in German, and the task's title is as written

#### Scenario: Assistive technology
- **WHEN** a screen reader user in French moves over an icon-only button
- **THEN** its accessible name is announced in French

#### Scenario: Missing message
- **WHEN** a message has no entry in the active catalog
- **THEN** the English text is shown in its place and the rest of the screen stays translated

### Requirement: Catalogs load on demand and work offline
Only the catalog of the active language SHALL be loaded; English SHALL need no catalog. Catalogs SHALL be served by the user's own server and precached by the service worker with the application shell, so the installed app switches language offline. When a catalog cannot be loaded, the interface SHALL keep its current language and say so where the language is chosen.

#### Scenario: English costs nothing
- **WHEN** the language is English or resolves to English
- **THEN** no catalog is downloaded

#### Scenario: Switch offline in the installed app
- **WHEN** the installed app is offline and the user switches from English to Spanish
- **THEN** Spanish is shown from the precached catalog

#### Scenario: Catalog unavailable
- **WHEN** a browser without the precache is offline and the user switches to German
- **THEN** the interface stays in its current language, the Language panel explains that the catalog could not be loaded, and the preference is still saved and applied when the catalog loads later

### Requirement: Plural and number forms follow the language
Messages with a count SHALL use the active language's plural categories, and counts SHALL be written with the language's digit grouping. Dates follow `date-time-preferences`. Simplified Chinese SHALL use its only plural category, `other`, for every count.

#### Scenario: Singular and plural
- **WHEN** the language is German and a proposal has 1 change, then 2 changes
- **THEN** the texts read `1 Änderung` and `2 Änderungen`

#### Scenario: Grouped count
- **WHEN** the language is French and a search placeholder names 10000 tasks
- **THEN** the number is written as `10 000`

#### Scenario: Chinese has no singular
- **WHEN** the language is Simplified Chinese and a count is 1, then 2
- **THEN** both counts use the same wording, the `other` category, and a catalog entry that also contains a `one` branch fails the translation check

### Requirement: Document language
The document's `lang` attribute SHALL name the active language at first paint and whenever it changes, so browsers, screen readers and spell checkers use the right rules. The `dir` attribute SHALL NOT be changed by this capability. For Simplified Chinese the language named SHALL be `zh`.

#### Scenario: Screen reader voice
- **WHEN** the language is Italian and the page loads
- **THEN** the root element's `lang` is `it` before the first screen is shown

#### Scenario: Change without reload
- **WHEN** the user switches from Italian to English
- **THEN** the root element's `lang` becomes `en` at once

#### Scenario: Simplified Chinese
- **WHEN** the user switches the language to Simplified Chinese
- **THEN** the root element's `lang` becomes `zh` at once and its `dir` stays `ltr`

### Requirement: Server errors translated by code
When the server answers with its error envelope, the client SHALL show a translated message for every error code it knows and the server's own message verbatim for a code it does not know. Server messages are English and are not changed by this capability.

#### Scenario: Known code
- **WHEN** the language is Spanish and sign-in fails with code `invalid_credentials`
- **THEN** the form shows the Spanish message for that code

#### Scenario: Unknown code
- **WHEN** a newer server answers with a code the client does not know
- **THEN** the client shows the server's message as received

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese, Simplified Chinese (`zh`, shown as 简体中文) and Dutch SHALL be maintained in the repository and SHALL be complete in every release. A maintained language SHALL be offered in Settings only when its catalog is complete. A community language (see "Community languages") SHALL be offered when it meets that requirement's threshold. The Simplified Chinese catalog MAY be drafted by machine translation and SHALL be reviewed afterwards by a person who reads Simplified Chinese. The other shipped catalogs, maintained or community, SHALL be written and reviewed by people; machine translation SHALL NOT be used for them.

Simplified Chinese SHALL be complete on the web app, the service worker's notification texts, the browser extension, the Android shell, server emails, the weekly digest and notification-channel messages.

#### Scenario: Complete languages offered
- **WHEN** the user opens the Language panel
- **THEN** the eight maintained languages are listed, each in its own name, 简体中文 and `Nederlands` among them

#### Scenario: Work-in-progress catalog
- **WHEN** a catalog in the repository is incomplete
- **THEN** it is not offered in Settings and the release check reports its missing messages

#### Scenario: Simplified Chinese interface
- **WHEN** the user picks 简体中文 and opens Today with an overdue task
- **THEN** the headings, the row's due label, the quick-add placeholder and the row menu are in Simplified Chinese, the root element's `lang` is `zh`, and the task's title is as written

#### Scenario: Dutch interface
- **WHEN** the user picks `Nederlands` and opens Today with an overdue task
- **THEN** the headings, the row's due label, the quick-add placeholder and the row menu are in Dutch, the root element's `lang` is `nl`, and the task's title is as written

#### Scenario: Older client receives Dutch
- **WHEN** a device running a release without Dutch receives `language: "nl"` from another device
- **THEN** it behaves as `system` and keeps the stored value, and the newer device stays in Dutch

### Requirement: Translation checks
The project's checks SHALL fail when a new user-facing string in the web app is not routed through the message layer (naming the file and line, with an allow-list for proper nouns, codes and samples), when a shipped catalog misses a message or holds one no longer used, when a message is malformed, or when a translation's placeholders differ from the source. The untranslated-string check SHALL also catch a prop value that reads as a phrase without any two-letter word (such as a placeholder "e.g. 45m, 1h30") and text assembled in a template literal under an object key a view shows (such as a group's `note`).

#### Scenario: Untranslated string
- **WHEN** a change adds a button labelled with a bare literal
- **THEN** the check fails and names the file and line

#### Scenario: Missing translation
- **WHEN** a change adds a message without its German entry
- **THEN** the catalog check fails and names the message and the language

#### Scenario: Placeholder mismatch
- **WHEN** a French entry drops the `{name}` placeholder of its source message
- **THEN** the catalog check fails and names the entry

#### Scenario: Assembled group note
- **WHEN** a change builds a list group's note as `${n} done`
- **THEN** the check fails and names the file and line

### Requirement: Language panel in Settings
Settings → Preferences SHALL offer a Language panel with `System` (naming the language it resolves to) and every shipped language, each written in its own name. A choice SHALL apply at once, without a reload. The panel SHALL have a Help link.

#### Scenario: Pick a language
- **WHEN** the user picks `Deutsch`
- **THEN** the Settings page, the sidebar and open views are in German without a reload

#### Scenario: System option names its result
- **WHEN** the browser prefers Portuguese and the user opens the panel
- **THEN** the first option reads `System (Português)`

#### Scenario: System option on a Chinese browser
- **WHEN** the browser prefers `zh-CN` and the user opens the panel
- **THEN** the first option reads `System (简体中文)`

### Requirement: Help stays English, and says so
The in-app Help and its contextual sections SHALL keep the English guide. When the active language is not English, Help SHALL start with a short note in the active language that the guide is in English.

#### Scenario: Help in French
- **WHEN** the language is French and the user opens Help from a Settings panel
- **THEN** the panel opens on the English section with a French note at the top

### Requirement: Interface lookups do not depend on the language
Code that finds an element of the interface (to focus it, or to test where focus is) SHALL identify it by a stable attribute, never by translated text, so every command works the same in every shipped language.

#### Scenario: Vim insert in German
- **WHEN** the language is German, the Vim layer is on and the user presses `i` on a task
- **THEN** the task panel opens with the caret at the end of the title

#### Scenario: Logbook count in Spanish
- **WHEN** the language is Spanish and the Completed view shows a day with two completed tasks
- **THEN** the day's note reads "2 hechas"

### Requirement: Sentences built from facts

Text that the app composes from several facts, such as the day page briefing, SHALL be translatable in every shipped language without gluing words.

- **Whole messages:** each fact SHALL be one whole message, with its numbers as plural arguments.
- **Joining:** facts SHALL be joined by the reader's language's own list pattern (in English with the serial comma).
- **Sentence start:** a fact that starts a sentence SHALL be shown with its first letter in upper case.
- **Data stays as written:** task titles and people's names SHALL be inserted as values and never translated.
- **No gendered words about a title:** a message SHALL NOT need to agree in gender with a task title, because a title has no grammatical gender.

The composed text SHALL be complete in every shipped catalog. It SHALL change language with the interface, without a reload, and SHALL work offline like every message.

#### Scenario: Italian
- **WHEN** the interface language is Italian and the same three facts stand out
- **THEN** the briefing reads "Oggi contano tre cose. Renew the passport è in ritardo di 2 giorni, venerdì è già al completo e Mia ha risposto su Boiler.", with the title and the name as written

#### Scenario: A fact first
- **WHEN** the first fact of the sentence is today's load
- **THEN** the sentence starts "Today holds 9h of work…", with a capital, in English, and "Oggi hai 9h di lavoro…" in Italian

#### Scenario: Language switched
- **WHEN** the user switches the language in Settings while Today is open
- **THEN** the briefing is shown in the new language at once, with the same facts

### Requirement: Local refusal messages translated by known sentence

When an action fails with a local refusal, the client SHALL translate the source sentences a user can cause: project not found, parent project not found, task not found, parent task not found, not signed in, time entry not found, reminder time is required, and offset must be a whole number of minutes. A source sentence the catalogue does not know SHALL pass through verbatim, so a newer client on an older catalog remains usable.

#### Scenario: Known local refusal is translated

- **WHEN** a French user acts on a task whose project was deleted on another device and the client throws "project not found"
- **THEN** the toast reads "Ce projet n’est plus disponible." instead of the English sentence

#### Scenario: Unknown local refusal passes through

- **WHEN** the client throws a sentence absent from the catalogue
- **THEN** the toast shows that sentence unchanged

### Requirement: News entries stay English, and the page says so
What's new entries SHALL be the English text shipped with the version. The card's own chrome (its name, the version-notices switch, the disclosure, the empty line) SHALL follow the active language. When the active language is not English and there is at least one entry, the card SHALL start with a short note in the active language that the notes are in English.

#### Scenario: News in French
- **WHEN** the language is French and the user opens What's new on a client that has an entry
- **THEN** the note at the top of the card is French, the switch and the disclosure are French, and the entry body is the English text

#### Scenario: English has no note
- **WHEN** the language is English and the user opens What's new
- **THEN** no "these notes are in English" line is shown

### Requirement: Community languages
A catalog SHALL be offered as a community language when it is listed as such, is at least 90 % complete (translated messages over source messages) and names a maintainer in the translation guide. The Language panel SHALL list community languages after the maintained ones, each in its own name with the caption "Community translation, some text in English". A message missing from a community catalog SHALL be shown in English. Text outside the web app (emails, channel messages, the native shell, the browser extension, quick-add vocabulary) MAY be missing for a community language and SHALL then be in English. The translation check SHALL fail when a listed community catalog falls below 90 %.

#### Scenario: Community language offered
- **WHEN** a Polish catalog is 94 % complete, listed as community and has a maintainer
- **THEN** the Language panel lists `Polski` after the maintained languages with the community caption, and picking it shows Polish with the missing 6 % in English

#### Scenario: Below the threshold
- **WHEN** a change adds 400 source messages and the listed Polish catalog drops to 85 %
- **THEN** the translation check fails, naming the language and its coverage

#### Scenario: Community language without quick-add vocabulary
- **WHEN** the interface language is a community language with no bundled vocabulary and the user enters `Pay rent tomorrow`
- **THEN** English vocabulary is active, the task is due tomorrow, and no error is shown

#### Scenario: Email in a community language
- **WHEN** a person whose app is in a community language without email templates is sent the weekly digest
- **THEN** the digest is in English

### Requirement: Language scaffolding and status
The repository SHALL provide one command that scaffolds every file a new language needs on every surface (web catalog, service worker notification texts, browser extension, native shell, email templates, channel messages, quick-add vocabulary stub) without listing the language as shipped and without changing any existing language, and one read-only command that reports, per language and per surface, how many messages are translated and which are missing. Neither command SHALL need a network connection or a new dependency.

#### Scenario: Scaffold a language
- **WHEN** a contributor runs the scaffold command for `sv` "Svenska"
- **THEN** the files for every surface exist, Settings does not offer Swedish, `make check` passes, and the status report lists Swedish at 0 % on every surface

#### Scenario: Existing code refused
- **WHEN** a contributor runs the scaffold command for `de`
- **THEN** it stops with an error naming the existing catalog and changes no file

#### Scenario: Status report
- **WHEN** a contributor runs the status command
- **THEN** it prints each language's translated and total counts for the web app, notifications, extension, shell, emails, channel messages and vocabulary, with the first missing keys, and exits successfully

### Requirement: Server-written text follows the maintained languages
Every text the server or a native shell writes for a person (emails, the weekly digest, notification channel messages, the service worker's notification texts, the browser extension and the native shell's own strings) SHALL exist in every maintained language. A check SHALL fail when a maintained language is missing from any of these surfaces.

#### Scenario: Dutch digest
- **WHEN** a person whose app is in Dutch has the weekly digest on
- **THEN** the digest's subject and text are in Dutch, and task titles are as written

#### Scenario: Surface forgotten
- **WHEN** a change lists a language as maintained without its email templates
- **THEN** the check fails, naming the language and the missing templates
