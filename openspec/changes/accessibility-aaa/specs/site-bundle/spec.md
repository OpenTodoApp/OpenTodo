# Spec Delta

## ADDED Requirements

### Requirement: Tokens include the high-contrast presentation
The bundle's tokens stylesheet SHALL include, after the light and dark blocks, the high-contrast override blocks of the web app for light and dark, selected by `data-contrast="high"` on an ancestor, so that a site built from the bundle can offer the same high-contrast presentation as the app and honour the system's request for more contrast. The blocks SHALL be taken from the app's stylesheet at bundle time, never written by hand, and the bundle test SHALL fail when they are missing.

#### Scenario: Bundle carries the override
- **WHEN** the site bundle is built from a release
- **THEN** its tokens stylesheet defines the `--ot-*` tokens for light, dark and both high-contrast blocks, and a page with `data-contrast="high"` on its root resolves pure white or black surfaces from it

#### Scenario: Override block missing
- **WHEN** the app's stylesheet no longer has a high-contrast block under the expected selector
- **THEN** the bundle build fails naming the block
