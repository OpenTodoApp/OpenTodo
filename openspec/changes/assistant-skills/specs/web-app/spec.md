# Spec Delta

## ADDED Requirements

### Requirement: Ask screen
The app SHALL offer an Ask screen, reachable from the sidebar and with the keyboard sequence `g` then `k`, showing the Ask composer and the full skill list. When the assistant is not available to the user, the screen SHALL explain why (not enabled on this server, or not available for encrypted accounts) and SHALL NOT appear in the sidebar for members.

#### Scenario: Keyboard
- **WHEN** a user with the assistant available presses `g` then `k`
- **THEN** the Ask screen opens with focus in the composer

#### Scenario: Encrypted account
- **WHEN** a user whose account uses end-to-end encryption opens the Ask screen by its address
- **THEN** it explains that the assistant cannot read encrypted tasks and shows no composer
