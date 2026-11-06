## MODIFIED Requirements

### Requirement: Brand assets in the bundle
The bundle SHALL include a `brand/` folder with the mark's source SVG, the mono and colour variants, the wordmark as SVG and the 512 px raster icon of that version, copied from the app's one brand source at build time, so the website and the documentation draw the same mark as the app. The folder SHALL also hold `kit/`: every file of the repository's brand kit (its README, SVGs and PNGs) byte for byte, so the website can offer the logo files of that version for download. The folder is an addition to the bundle layout and SHALL be listed in the bundle's documented paths; its files SHALL carry the project's licence note.

#### Scenario: Website draws the mark
- **WHEN** the website builds against the pinned bundle
- **THEN** it reads `brand/mark-mono.svg` for its header and `brand/icon-512.png` for its social cards, and the files are byte-identical to the app's generated assets of that version

#### Scenario: Stale copy fails the build
- **WHEN** the brand source changes and the bundle script is run
- **THEN** the bundle test compares `brand/` against the app's generated files and fails naming the file when one differs

#### Scenario: Press kit downloads
- **WHEN** the website builds against a bundle of a version that has the brand kit
- **THEN** `brand/kit/` holds the same files as the repository's `brand/` folder of that version, byte for byte, and no other file
