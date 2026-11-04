## MODIFIED Requirements

### Requirement: Message language
A message SHALL be written in the first language of the `Accept-Language` header of the request that caused it that the server supports (`en`, `de`, `fr`, `es`, `it`, `pt`, `zh`), else in English. Subject and body SHALL be translated together; the link and the server origin are not translated. For a verification message the language SHALL be the one captured at registration, so a resend uses the same language. The language is chosen while handling that request and is not an operation.

#### Scenario: German browser
- **WHEN** a visitor whose browser sends `Accept-Language: de-CH, fr;q=0.8` requests a password reset
- **THEN** subject and body are in German and the link is unchanged

#### Scenario: Unsupported language
- **WHEN** the header is `ja` or absent
- **THEN** the message is in English

#### Scenario: Invitation language follows the creator
- **WHEN** an admin whose browser sends `Accept-Language: it` sends an invitation
- **THEN** the invitee receives an Italian message

#### Scenario: Simplified Chinese browser
- **WHEN** a visitor whose browser sends `Accept-Language: zh-CN` requests a password reset
- **THEN** subject and body are in Simplified Chinese and the link is unchanged

#### Scenario: Traditional Chinese browser
- **WHEN** the header is `zh-TW` or `zh-Hant`
- **THEN** the message is in English
