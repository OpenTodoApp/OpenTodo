# Spec Delta

## MODIFIED Requirements

### Requirement: Ask composer
When the assistant is available to the user, the Ask screen SHALL show a composer with a text field, a Skills menu and up to three example cards, and the Today view SHALL offer an "Ask" action in its page header that opens the assistant panel; no composer or cards SHALL be rendered inside Today's list. Sending from the composer, choosing a skill or choosing a card SHALL open the assistant panel with that text or skill filled in. When the assistant is not available, no composer, card or hint SHALL be shown to anyone in task views; the owner finds the assistant under Settings → Integrations.

#### Scenario: Start from Today
- **WHEN** a user with the assistant available activates Ask in Today's page header, types "what is overdue in Work?" and presses Enter
- **THEN** the assistant panel opens and sends that message as a turn

#### Scenario: Assistant off for a member
- **WHEN** the owner has not enabled the assistant and a member opens Today
- **THEN** no composer and no assistant hint are shown

#### Scenario: Owner dismisses the hint
- **WHEN** the owner has not enabled the assistant and opens Today
- **THEN** there is no hint above the list to dismiss, and the Integrations section offers the assistant setup
