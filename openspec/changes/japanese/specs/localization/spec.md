## MODIFIED Requirements

### Requirement: Interface language preference
Each user SHALL have an interface language preference whose value is `system` or the code of a shipped language. It SHALL default to `system`, which means the first of the browser's preferred languages that is shipped, else English. A client SHALL treat an unknown or missing value as `system` and SHALL leave the stored value unchanged.

Chinese SHALL be resolved by script and region, not by the primary subtag alone. When Simplified Chinese is shipped, the tags `zh`, `zh-Hans`, `zh-CN` and `zh-SG`, and a `zh` tag whose script is `Hans`, SHALL resolve to `zh`. The tags `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO`, a `zh` tag whose script is `Hant`, and any other `zh` tag SHALL NOT resolve to `zh`. The browser's list SHALL be walked in order. A stored preference `zh` means Simplified Chinese on every device. Dates and numbers SHALL use the browser's own tag when that tag resolves to `zh`, and SHALL use `zh` otherwise.

The preference SHALL be written as an operation on the user's personal data. It SHALL be editable offline and take effect at once on the editing device, SHALL converge by last-writer-wins, and SHALL be part of the JSON export like the date and time preferences.

#### Scenario: New account on a German browser
- **WHEN** a user whose browser prefers `de-CH` opens the app without ever choosing a language
- **THEN** the interface is shown in German

#### Scenario: Browser language not shipped
- **WHEN** the browser prefers only Swedish
- **THEN** the interface is shown in English and no error is shown

#### Scenario: Japanese browser
- **WHEN** a user whose browser prefers `ja-JP` opens the app without ever choosing a language
- **THEN** the interface is Japanese and dates and numbers use the `ja-JP` locale

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

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese, Simplified Chinese (`zh`, shown as 简体中文), Dutch, Turkish (`tr`, shown as Türkçe) and Polish (`pl`, shown as Polski) SHALL be maintained in the repository and SHALL be complete in every release. A maintained language SHALL be offered in Settings only when its catalog is complete. A community language (see "Community languages") SHALL be offered when it meets that requirement's threshold. The Simplified Chinese catalog MAY be drafted by machine translation and SHALL be reviewed afterwards by a person who reads Simplified Chinese. Russian (`ru`, shown as Русский) SHALL be shipped as a community language; its catalog MAY be drafted by machine translation, SHALL be listed in the translation guide as a machine draft looking for a reviewer until a speaker has read it, and SHALL be reviewed by a person who reads Russian once one signs up. Japanese (`ja`, shown as 日本語) SHALL be shipped as a community language; its catalog MAY be drafted by machine translation at the maintainer's decision, SHALL be listed in the translation guide as a machine draft looking for a native reviewer until a person who reads Japanese has reviewed it, and SHALL stay a community language until then. The other shipped catalogs, maintained or community, SHALL be written and reviewed by people; machine translation SHALL NOT be used for them.

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

### Requirement: Plural and number forms follow the language
Messages with a count SHALL use the active language's plural categories, and counts SHALL be written with the language's digit grouping. Dates follow `date-time-preferences`. Simplified Chinese and Japanese SHALL use their only plural category, `other`, for every count.

#### Scenario: Singular and plural
- **WHEN** the language is German and a proposal has 1 change, then 2 changes
- **THEN** the texts read `1 Änderung` and `2 Änderungen`

#### Scenario: Grouped count
- **WHEN** the language is French and a search placeholder names 10000 tasks
- **THEN** the number is written as `10 000`

#### Scenario: Chinese has no singular
- **WHEN** the language is Simplified Chinese and a count is 1, then 2
- **THEN** both counts use the same wording, the `other` category, and a catalog entry that also contains a `one` branch fails the translation check

#### Scenario: Japanese has no singular
- **WHEN** the language is Japanese and a count is 1, then 1234
- **THEN** the texts read `1件のタスク` and `1,234件のタスク`, and a Japanese entry that also contains a `one` branch fails the translation check
