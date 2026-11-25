## MODIFIED Requirements

### Requirement: Document language
The document's `lang` attribute SHALL name the active language and its `dir` attribute SHALL name the language's writing direction (`rtl` for Arabic, `ltr` for every other shipped language) at first paint and whenever the language changes, offline included, so browsers, screen readers and spell checkers use the right rules and the layout mirrors. The direction SHALL follow the interface language, never the language of user-written text. For Simplified Chinese the language named SHALL be `zh`.

#### Scenario: Screen reader voice
- **WHEN** the language is Italian and the page loads
- **THEN** the root element's `lang` is `it` and its `dir` is `ltr` before the first screen is shown

#### Scenario: Change without reload
- **WHEN** the user switches from Italian to English
- **THEN** the root element's `lang` becomes `en` at once

#### Scenario: Simplified Chinese
- **WHEN** the user switches the language to Simplified Chinese
- **THEN** the root element's `lang` becomes `zh` at once and its `dir` stays `ltr`

#### Scenario: Arabic, then back
- **WHEN** the user switches the language to Arabic while offline, then to English
- **THEN** the root element's `lang` becomes `ar` and its `dir` `rtl` at once, then `en` and `ltr`

#### Scenario: Shared task page
- **WHEN** a guest whose browser prefers Arabic opens a shared task page
- **THEN** the page's `lang` is `ar` and its `dir` is `rtl`

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese, Simplified Chinese (`zh`, shown as 简体中文), Dutch, Turkish (`tr`, shown as Türkçe) and Polish (`pl`, shown as Polski) SHALL be maintained in the repository and SHALL be complete in every release. A maintained language SHALL be offered in Settings only when its catalog is complete. A community language (see "Community languages") SHALL be offered when it meets that requirement's threshold. The Simplified Chinese catalog MAY be drafted by machine translation and SHALL be reviewed afterwards by a person who reads Simplified Chinese. Russian (`ru`, shown as Русский) SHALL be shipped as a community language; its catalog MAY be drafted by machine translation, SHALL be listed in the translation guide as a machine draft looking for a reviewer until a speaker has read it, and SHALL be reviewed by a person who reads Russian once one signs up. Japanese (`ja`, shown as 日本語) SHALL be shipped as a community language; its catalog MAY be drafted by machine translation at the maintainer's decision, SHALL be listed in the translation guide as a machine draft looking for a native reviewer until a person who reads Japanese has reviewed it, and SHALL stay a community language until then. Arabic (`ar`, shown as العربية) SHALL be shipped as a community language; its catalog MAY be drafted by machine translation, SHALL be listed in the translation guide as a machine draft looking for a reviewer until a speaker has read it, and SHALL be reviewed by a person who reads Arabic. The other shipped catalogs, maintained or community, SHALL be written and reviewed by people; machine translation SHALL NOT be used for them.

Simplified Chinese SHALL be complete on the web app, the service worker's notification texts, the browser extension, the Android shell, server emails, the weekly digest and notification-channel messages.

#### Scenario: Complete languages offered
- **WHEN** the user opens the Language panel
- **THEN** the ten maintained languages are listed, each in its own name, 简体中文 and `Nederlands` among them

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

#### Scenario: Russian as a community language
- **WHEN** the user opens the Language panel
- **THEN** `Polski` is listed among the maintained languages, `Русский` after them with the community caption, and picking `Polski` shows Today's headings in Polish with the root element's `lang` set to `pl`

#### Scenario: Japanese as a community language
- **WHEN** the user picks 日本語 and opens Today with an overdue task
- **THEN** 日本語 is listed after the maintained languages with the community caption, the headings and the row menu are in Japanese, the root element's `lang` is `ja` and its `dir` stays `ltr`, dates read like 2026年11月4日, and the task's title is as written

#### Scenario: Japanese email
- **WHEN** a person whose app is in Japanese is sent a password reset
- **THEN** the email is in English until Japanese is a maintained language

#### Scenario: Arabic as a community language
- **WHEN** the user opens the Language panel
- **THEN** `العربية` is listed after the maintained languages with the community caption, and picking it shows Today's headings in Arabic with the root element's `lang` set to `ar` and its `dir` set to `rtl`

## ADDED Requirements

### Requirement: Right-to-left layout
When the direction is `rtl`, the web app SHALL mirror its layout with one set of start/end rules: the sidebar, the phone drawer and the phone bar's menu at the right, rows, menus, the calendar, Settings and indentation starting from the right, the docked task panel on the left (the end side), popovers aligned to their trigger's start or end edge, and the safe-area insets applied to the edge they belong to. Targets SHALL keep their size (44 px on touch). At 375 px and beside the docked panel, rows SHALL fit without horizontal scrolling. Left to right the layout SHALL be unchanged. Time axes drawn from coordinates (the Timeline view, the review charts, the assistant's timeline and free-time strip, the notes and connections graphs) MAY stay left to right in an isolated box.

#### Scenario: Today in Arabic on a desktop
- **WHEN** the language is Arabic and the user opens Today at 1280 px
- **THEN** the sidebar is on the right, each row starts with its checkbox at the right and ends with its time at the left, and opening a task docks the panel on the left

#### Scenario: Phone
- **WHEN** the language is Arabic on a 375 px phone
- **THEN** the drawer slides in from the right, the bar's menu button is at the right, and no row scrolls sideways

#### Scenario: Left to right unchanged
- **WHEN** the language is German
- **THEN** every screen is laid out as before this change

### Requirement: Input follows the direction
When the direction is `rtl`, ← SHALL move towards the end of the line and → towards its start wherever the arrows move along a line: list details and folding, board columns, tabs, segmented controls and pickers, the date picker and the calendar views (a day towards the end is the next day), and the resizers. ↑, ↓, Home and End SHALL be unchanged. Swipes and drags SHALL mirror: on a phone row, a swipe towards the end (to the left) completes and a swipe towards the start schedules or edits the title; the edge swipe starts at the right edge and moves left; a dragged row's depth grows towards the end. Inside a box kept left to right, the arrows SHALL keep their left-to-right meaning. A shortcut SHALL NOT fire while an input method is composing.

#### Scenario: Show details
- **WHEN** the language is Arabic, a task row is selected and the user presses ←
- **THEN** the row's details open, as → does left to right

#### Scenario: Next day in the calendar
- **WHEN** the language is Arabic, a task is selected in Week and the user presses ←
- **THEN** the task moves one day later

#### Scenario: Back on a phone
- **WHEN** the language is Arabic, a task page is open on a phone and the user swipes from the right edge to the left
- **THEN** the page follows the finger and goes back

#### Scenario: Composing
- **WHEN** the user composes Arabic text with an input method and presses an arrow
- **THEN** no shortcut runs

### Requirement: Directional icons mirror
When the direction is `rtl`, icons that point along the line (back, forward and disclosure chevrons and arrows, undo and redo, send, list icons, the panel icons) SHALL be mirrored, and a disclosure chevron SHALL still point down when open. Icons that do not point along the line (a check, a clock, the logo) SHALL NOT be mirrored.

#### Scenario: Back and disclosure
- **WHEN** the language is Arabic and a task page and a folded group are shown
- **THEN** Back points to the right, the folded group's chevron points to the left, and the open group's chevron points down

### Requirement: User text keeps its own direction
Text people wrote (titles, descriptions, notes, comments, names) SHALL take its direction from its own first letter in both layouts, so an English title in an Arabic row and an Arabic title in an English row read correctly and do not reorder the time, the checkbox or the menu around them. Code, keyboard keys and the English Help SHALL read left to right in an Arabic page.

#### Scenario: English title in Arabic
- **WHEN** the language is Arabic and a row's title is `Call Bob!`
- **THEN** the title reads `Call Bob!` with the exclamation mark at its right end, and the row's checkbox, time and menu keep their places

#### Scenario: Arabic title in English
- **WHEN** the language is English and a row's title is `اتصل بالبنك`
- **THEN** the title reads right to left and the row's layout is unchanged

### Requirement: Western digits in Arabic
In Arabic, numbers, counts, times and dates SHALL be written with Western digits (0-9), as the stored dates and times are, while month and weekday names and the date order follow the Arabic language and the existing date preferences; the week start SHALL stay the user's preference. Counts SHALL use Arabic's plural categories (`zero`, `one`, `two`, `few`, `many`, `other`) as the platform's plural rules give them, and the translation check SHALL refuse a category Arabic does not have.

#### Scenario: A count in Arabic
- **WHEN** the language is Arabic with the browser's region Egypt and a view names 12345 tasks
- **THEN** the number is written with Western digits (`12,345`), not `١٢٬٣٤٥`

#### Scenario: Two tasks
- **WHEN** the language is Arabic and a message counts 2 tasks
- **THEN** the catalog's `two` form is used
