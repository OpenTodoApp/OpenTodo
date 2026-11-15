## MODIFIED Requirements

### Requirement: Shipped languages and their catalogs
English, German, French, Spanish, Italian, Portuguese, Simplified Chinese (`zh`, shown as 简体中文) and Dutch SHALL be maintained in the repository and SHALL be complete in every release. A maintained language SHALL be offered in Settings only when its catalog is complete. A community language (see "Community languages") SHALL be offered when it meets that requirement's threshold. The Simplified Chinese catalog MAY be drafted by machine translation and SHALL be reviewed afterwards by a person who reads Simplified Chinese. Russian (`ru`, shown as Русский) and Polish (`pl`, shown as Polski) SHALL be shipped as community languages; their catalogs MAY be drafted by machine translation, SHALL be listed in the translation guide as machine drafts looking for a reviewer until a speaker has read them, and SHALL be reviewed by a person who reads the language once one signs up. The other shipped catalogs, maintained or community, SHALL be written and reviewed by people; machine translation SHALL NOT be used for them.

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

#### Scenario: Russian and Polish as community languages
- **WHEN** the user opens the Language panel
- **THEN** `Русский` and `Polski` are listed after the maintained languages with the community caption, and picking `Polski` shows Today's headings in Polish with the root element's `lang` set to `pl`

