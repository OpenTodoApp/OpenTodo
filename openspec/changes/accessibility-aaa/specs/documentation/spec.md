# Spec Delta

## MODIFIED Requirements

### Requirement: Accessible documentation
The docs website and the in-app Help SHALL meet WCAG 2.2 AAA under the rule of OpenSpec `accessibility` (met by default where it keeps the look, otherwise a register entry with a route): landmarks, one top heading and no skipped levels, section headings, skip link, visible and unobscured focus, 7:1 contrast for text in light and dark except registered pairs, link text that states its purpose on its own, a location trail on every page below the top level, header cells in tables, reduced motion respected, line height 1.5 and a measure of at most 80 characters in prose, 200% zoom and 360 px width without horizontal scroll, abbreviations linked to the glossary on first use on a page, and search results announced to screen readers. The user guide SHALL contain an accessibility statement page and a glossary page (OpenSpec `accessibility`). CI SHALL check the automated part of this with the AAA rule set, passing an enhanced-contrast finding only for a registered pair.

#### Scenario: Screen reader search
- **WHEN** a screen reader user searches the docs
- **THEN** the number of results is announced and each result is reachable with Tab and opens with Enter

#### Scenario: Automated check
- **WHEN** a change introduces an image without alt text or an unregistered contrast failure on a docs page or the Help view
- **THEN** the CI accessibility check fails

#### Scenario: Abbreviation on a page
- **WHEN** a docs page uses "CalDAV" for the first time
- **THEN** that first use links to the glossary entry, and the docs check fails for a listed abbreviation used on a page without the link

#### Scenario: Location trail
- **WHEN** a person opens a page inside the self-hosting section of the user guide
- **THEN** the page shows the path to it from the guide's start, each step a link
