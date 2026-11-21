# iPad and Android tablets in the shells: pointer, keyboard and windows

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

The iPad app runs at every orientation without `UIRequiresFullScreen` (`project.yml:39,71`), so it already multitasks, but the shell has no `UIKeyCommand`, no pointer interaction and no scene handling, and the only iPad check turns haptics off (`Bridge.swift:48`). On Android the activity declares no `resizeableActivity` and nothing for foldables (`AndroidManifest.xml:50-56`).

## What Changes

- iPad: hardware keyboard shortcuts reach the page (the web view gets key events; system shortcuts such as Cmd+Tab are left alone), and holding Cmd shows the system shortcut overlay listing the app's main shortcuts as `UIKeyCommand`s that forward to the page.
- iPad: a trackpad or mouse pointer is reported as a fine pointer to the page, so hover looks and `pointer-fine:` rules apply.
- iPad and Android: the app works in split view, Stage Manager and freeform windows at any size and re-measures on resize (with `tablet-layouts`); Android declares `resizeableActivity="true"` and handles fold posture changes without restarting.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Multiple windows of the app at once (one scene).
- Apple Pencil features.

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `native-shells`: tablet pointer, keyboard and window behaviour.
