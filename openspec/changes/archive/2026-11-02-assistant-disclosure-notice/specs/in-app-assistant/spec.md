# Spec Delta

## ADDED Requirements

### Requirement: Notice of the completed disclosure
A user whose consent still counts but names a disclosure older than the first complete one (version 4) SHALL be told once, without being asked to consent again and without pausing the assistant or routines' AI steps, that the list of what the assistant may read and send is now complete. The app SHALL show the notice in the assistant's panel and, when the consent covers routines' AI steps, on the Routines page, with Review the list (the full list in the reader's language), Turn off the assistant (withdraws consent) and Got it. Got it SHALL record the seen disclosure version on the server through `POST /api/v1/me/assistant/disclosure-seen`, so the notice is not shown again on any device; `GET /api/v1/me/assistant` SHALL return `disclosure_notice`. The same SHALL hold for the on-device consent of an encrypted account. A user who consented at version 4 or later SHALL never see the notice. Offline, the notice stays visible with its actions disabled and nothing is queued; Got it from two devices converges on the same recorded version.

#### Scenario: Older consent sees the notice
- **WHEN** a user who accepted disclosure version 2 opens the assistant
- **THEN** `disclosure_notice` is true, the notice is shown above the conversation, and the composer stays enabled

#### Scenario: Got it hides it everywhere
- **WHEN** the user presses Got it on one device
- **THEN** `seen_version` becomes 4, `disclosure_notice` is false, and another device does not show the notice after its next status refresh

#### Scenario: Current consent never sees it
- **WHEN** a user who accepted disclosure version 4 opens the assistant
- **THEN** `disclosure_notice` is false

#### Scenario: Turn off from the notice
- **WHEN** the user presses Turn off the assistant in the notice
- **THEN** the consent is withdrawn and the assistant shows the disclosure before the next message

#### Scenario: On-device consent
- **WHEN** an encrypted user whose on-device consent names version 3 opens the assistant on a device set up for that provider
- **THEN** the notice is shown with the on-device list, and Got it records the seen version

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials sends `POST /api/v1/me/assistant/disclosure-seen`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid request
- **WHEN** a signed-in user without a consent on record sends `POST /api/v1/me/assistant/disclosure-seen`
- **THEN** the response is 409 `consent_required` and nothing is stored
