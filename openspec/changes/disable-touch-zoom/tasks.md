# Tasks

## 1. Setting and viewport

- [ ] 1.1 A device-storage key for "Disable zoom on this device" (default off), with its getter/setter and a change event, beside the other per-device appearance settings. Verify: unit test of default and round-trip.
- [ ] 1.2 A module that writes the `<meta name="viewport">` content from the setting (default, or default + `maximum-scale=1, user-scalable=no`) at startup and on change. Verify: unit test that the string follows the setting both ways.
- [ ] 1.3 The Appearance toggle, off by default, with a one-line note that zoom stays on unless turned off. Verify: interaction test toggles it and the viewport module is called; a story in light and dark.

## 2. Release

- [ ] 2.1 Changelog fragment `changelog.d/Added/disable-touch-zoom.md`. Verify: `make repo-check`.
- [ ] 2.2 Docs: a line in the appearance/phone docs that the setting exists, is per device and off by default. Verify: `make docs-check`.
