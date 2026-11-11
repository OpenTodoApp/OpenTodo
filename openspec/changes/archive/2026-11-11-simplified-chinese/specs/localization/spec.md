## MODIFIED Requirements

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

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese and Simplified Chinese (`zh`, shown as 简体中文) SHALL be maintained in the repository and SHALL be complete in every release. A language SHALL be offered in Settings only when its catalog is complete. The Simplified Chinese catalog MAY be drafted by machine translation and SHALL be reviewed afterwards by a person who reads Simplified Chinese. The other shipped catalogs SHALL be written and reviewed by people; machine translation SHALL NOT be used for them. A community language follows the same rule.

Simplified Chinese SHALL be complete on the web app, the service worker's notification texts, the browser extension, the Android shell, server emails, the weekly digest and notification-channel messages.

#### Scenario: Complete languages offered
- **WHEN** the user opens the Language panel
- **THEN** the seven shipped languages are listed, each in its own name, 简体中文 among them

#### Scenario: Work-in-progress catalog
- **WHEN** a catalog in the repository is incomplete
- **THEN** it is not offered in Settings and the release check reports its missing messages

#### Scenario: Simplified Chinese interface
- **WHEN** the user picks 简体中文 and opens Today with an overdue task
- **THEN** the headings, the row's due label, the quick-add placeholder and the row menu are in Simplified Chinese, the root element's `lang` is `zh`, and the task's title is as written

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
