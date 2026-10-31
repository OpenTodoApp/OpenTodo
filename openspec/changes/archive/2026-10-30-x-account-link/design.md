# Design

## D1. One constant, beside the Discord invite
`X_URL = 'https://x.com/opentodoapp'` lives in `web/src/app/WelcomeDialog.tsx` with `ISSUES_URL`, `REPO_URL` and `DISCORD_URL`, the one place the client keeps the project's addresses. The About row and any later use import it.

## D2. The About row
A `SettingRow` with id `about-news`, between Community and Source code, copy `rowCopy('about', 'news')`: label "News and updates" (3 words), description "Releases and what is being built, on X." (41 characters, within the 90 of the settings copy rule). Its control is the existing `ExternalLink` with the label "Follow on X" and `testId="x"`, so it opens in a new tab with `rel="noopener noreferrer"` and loads nothing into the app, like every other About link. The settings index entry carries the keywords `x twitter news updates follow social`, so the row is found under "twitter" too, the name many people still type.

## D3. Data model, interface budget, size
No data, no op, no setting: a static link. The About section is a settings page, outside the list budgets of docs/interface-guide.md; the row adds one line to a page that already scrolls. No new icon (the row reuses `external-link`), no dependency; the bundle grows by the text of three messages in six languages. No effect on the image or on memory.

## D4. Documentation
`docs/feedback-and-support.md` gets a "Follow the news" section after "Talk to other people", and its Settings → About paragraph names the X row; the summary in its front matter and in `docs/README.md` stays as it is, since "where to talk to other people" already covers following the project. The README's line about questions and Discord gains the X account.
