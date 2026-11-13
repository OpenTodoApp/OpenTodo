## MODIFIED Requirements

### Requirement: Notification content and privacy
A message SHALL name the task and the person who acted only when all of these hold:

- the channel's "include task titles" switch is on;
- the account has no end-to-end encryption;
- the value is not ciphertext.

Otherwise it SHALL say only what happened:

| Event | Message |
|---|---|
| reminder | "A reminder is due" |
| assigned | "A task was assigned to you" |
| mentioned | "You were mentioned" |
| unblocked | "A task you're assigned to is ready to start" |
| page reply | "A guest replied on a task page" |
| page completion | "A guest completed a task page" |

A mention's excerpt follows the same rule.

Every message SHALL carry a link into the app made of the server's address and the task's id.

Messages SHALL be written in the language the user's app used when the channel was last saved when that language is maintained (OpenSpec `localization` "Shipped languages and their catalogs"), and in English otherwise. That language is server state on the channel, outside the op log: changing it needs a connection, and the app shows the last loaded channel while offline.

#### Scenario: Titles off
- **WHEN** a reminder for "Call the plumber" fires on a channel with titles off
- **THEN** the message reads "A reminder is due" and carries a link to the task, and no request contains "Call the plumber"

#### Scenario: Encrypted account
- **WHEN** an account with end-to-end encryption has a channel with titles on and a task is assigned to it
- **THEN** the message reads "A task was assigned to you" with no title and no name, and the editor shows the titles switch off and disabled with the reason

#### Scenario: German
- **WHEN** a channel was saved from the app in German and a reminder fires with titles off
- **THEN** the message reads "Eine Erinnerung ist fällig"

#### Scenario: Dutch
- **WHEN** a channel was saved from the app in Dutch and a reminder fires with titles off
- **THEN** the message is the Dutch text for "A reminder is due", never the English one

#### Scenario: Simplified Chinese
- **WHEN** a channel was saved from the app in Simplified Chinese and a reminder fires with titles off
- **THEN** the message is that language's text for "A reminder is due", it is not the English sentence, and no request contains the task title

#### Scenario: Offline
- **WHEN** the device is offline and the user edits a channel's language
- **THEN** the edit is not saved and the server keeps the language it had
