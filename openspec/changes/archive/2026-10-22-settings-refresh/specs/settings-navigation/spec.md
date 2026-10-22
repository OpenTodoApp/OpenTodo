## ADDED Requirements

### Requirement: Card icons
A Settings card MAY carry one icon from the app's icon set before its title, drawn in the muted text colour at the size of the title's cap height and hidden from assistive technology; the title alone names the card. Every card of the You, App and Data sections SHALL have one (for example: How you work, a compass; Session, a monitor; Password, a key; Two-factor authentication, a shield; Passkeys, a fingerprint; End-to-end encryption, a lock; Recent activity, a history clock), chosen once in the section table so the same card shows the same icon in Settings search results. A card without an icon SHALL keep its title aligned with the cards that have one.

#### Scenario: Account cards
- **WHEN** the user opens Settings → Account
- **THEN** How you work, Session, Password, Two-factor authentication, Passkeys, End-to-end encryption and Recent activity each show their icon before the title, and a screen reader reads only the titles

#### Scenario: Search shows the same icon
- **WHEN** the user searches Settings for "passkey"
- **THEN** the result for the Passkeys card shows the fingerprint icon it shows on its page

### Requirement: Learn more links
Every "Learn more" link in Settings SHALL show the pointer cursor, SHALL be underlined like other text links with a stronger underline on hover and focus, and SHALL open its guide section in the Help panel beside Settings. It SHALL be reachable with Tab and activated with Enter.

#### Scenario: Pointer over Learn more
- **WHEN** the mouse rests on any card's "Learn more" link
- **THEN** the cursor is the pointer (hand) and the underline thickens

#### Scenario: Keyboard
- **WHEN** the user tabs to "Learn more" in the Session card and presses Enter
- **THEN** the Session section of the guide opens in the Help panel and Settings stays where it was

### Requirement: Card action labels
A Settings card's action buttons SHALL name the action without a trailing ellipsis, also when the action opens a dialog or a further step ("Set up encryption", "Set up two-factor authentication", "Configure"). Menu items keep the platform convention.

#### Scenario: Encryption
- **WHEN** encryption is off and the user opens Settings → Account
- **THEN** the End-to-end encryption card's button reads "Set up encryption"
