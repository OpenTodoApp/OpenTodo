## ADDED Requirements

### Requirement: Brand assets outside the app
Every file that shows the OpenTodo mark outside the running app SHALL be generated from the brand source by the brand script and recorded in its stamp, never made by hand: the deploy catalogues' icons and logos in every format a store asks for (including a JPEG logo and a wide logo of about 250 × 100 for the Home Assistant add-on), the AI assistant plugin's icon, and the brand kit's store images, including a 1024 × 500 Google Play feature graphic without an alpha channel. A test SHALL fail on an image named as an icon or a logo under the web app's public folder, the extension, the Obsidian plugin, the native shells, the deploy templates or the README screenshots that the script does not write. The docs pages' social image SHALL be the brand kit's default social card, a file the same site bundle ships.

#### Scenario: A hand-made logo is added to a deploy template
- **WHEN** someone adds `deploy/example/logo.png` without adding it to the brand script
- **THEN** the brand test fails and names the file

#### Scenario: The Home Assistant add-on's images
- **WHEN** the brand script runs
- **THEN** the add-on's `icon.png` is the colour icon at 128 × 128 and its `logo.png` is the lockup on the slate rounded rectangle at 250 × 100

#### Scenario: A docs page is shared
- **WHEN** a docs page from the site bundle is shared as a link
- **THEN** its `og:image` names `/brand/kit/png/og-default-1200x630.png`, which the same bundle ships in `brand/kit/png/`
