---
title: Accessibility statement
summary: WCAG 2.2 level AAA where it keeps the look, the exceptions made on purpose with the way to the criterion, what is checked on every change, and how to report a problem.
audience: user
section: Reference
specs: [design-system, appearance-preferences]
order: 75
---
# Accessibility statement

OpenTodo aims for **WCAG 2.2 level AAA** in light and dark, for every accent theme, with a keyboard, a pointer or a screen reader. It does so on one rule: **the look comes first**. Where a level-AAA criterion can be met without changing how the app looks, it is met by default. Where meeting it would change the look (the accent colour, the three text tones, the density of rows), the default keeps its look, the criterion stays one switch away, and the case is listed below. Nothing is left unmet without an entry here.

This page is kept in step with the register the checks read (`web/src/ui/a11y/exceptions.json` in the repository): a check fails when one lists an exception the other does not.

## What you get by default

- Every text tone except the faint one reaches at least 7:1 against every surface it is used on, in light and in dark.
- Every control shows the same focus ring, at least 2 px wide and never hidden under the phone's bar, the add button or a message.
- Every pointer target offers at least 44 × 44 px to tap, whatever its visible size, in the comfortable density.
- This guide and the Help pages use a line height of at least 1.5, a space of 2 em between paragraphs (WCAG technique C21), at most 80 characters per line, and nothing is justified. Notes and comments keep the same line height and measure; their paragraph spacing is listed below.
- A page inside a hierarchy shows the path to it under its title. Links say where they go in their own words. Every settings section has a heading.
- Nothing has a time limit: a message that goes away on its own only offers what you can still do elsewhere (undo from Trash, Completed or a task's history). Nothing flashes. Your session is not ended for inactivity; it lasts 90 days from sign-in unless the server owner sets a different lifetime.
- Signing in never needs you to remember or transcribe: a passkey is offered wherever a password or a code is asked, and every password and code field accepts pasted text and lets a password manager fill it.
- Every abbreviation and uncommon term the app shows is explained in the [glossary](glossary.md).
- Motion follows your system's reduced-motion setting, and can be turned off entirely (below).

## Exceptions, on purpose

Each entry names the criterion, where it applies, the measured value in the default look, why the look wins, and how to reach the criterion anyway. The route for every contrast entry is the same: **Settings → Appearance → Contrast → High**, or leave Contrast on **Auto** and turn on your system's increase-contrast setting. The high-contrast presentation draws every surface pure white or black, every text at 7:1 or better, and replaces tints with outlines.

<!-- exception: faint-tone -->
### The faint text tone (1.4.6 Contrast, Enhanced)

Timestamps, hints and counts use the faint tone, the third step of the text scale. It measures 5.3:1 on the canvas in light and 6.0:1 on a card in dark. At 7:1 it would be the same lightness as the muted tone, and the three steps that give a row its hierarchy (title, metadata, hint) would collapse into two. Route: high contrast.

<!-- exception: accent-label -->
### The label of a primary button (1.4.6 Contrast, Enhanced)

The white label on a primary button and on the current item measures 5.5:1 on emerald (5.2:1 on orange). Reaching 7:1 would need an accent a quarter darker than the brand's emerald, and than every other accent you can choose. Route: high contrast, which draws the button black on white or white on black.

<!-- exception: accent-text -->
### Links and the current item (1.4.6 Contrast, Enhanced)

Links, the current navigation item and accent icons are drawn in the accent colour: 5.3:1 on the canvas with emerald in light, 5.0:1 with orange. A 7:1 version would be a different, darker colour next to the buttons, so links would no longer match the accent you chose. Route: high contrast, which draws them in the text colour with an underline or an outline.

<!-- exception: status-text -->
### Error, warning, success and information text (1.4.6 Contrast, Enhanced)

An overdue date, an error line or a completed check uses its status colour: 5.5:1 for an error on the canvas in light, 5.3:1 for success. The status colours carry their meaning by hue; at 7:1 they turn into four shades of near-black. Route: high contrast, which keeps each hue but takes it to 7:1.

<!-- exception: tinted-surfaces -->
### The muted tone on a selected row and in the sidebar (1.4.6 Contrast, Enhanced)

The muted tone reaches 7:1 on every plain surface. On the accent tint of a selected row it measures 6.8:1 in light and 6.6:1 in dark. Taking it further would push the tone to where it no longer differs from the default text. Route: high contrast, which replaces the tint with an outline.

<!-- exception: dense-rows -->
### Rows closer than 44 px with a mouse (2.5.5 Target Size, Enhanced)

Sidebar rows sit 36 px apart and group headers 24 px, so a 44 px hit area would reach into the neighbour, which is itself a target. Making them 44 px tall with a mouse would make the sidebar a fifth taller. Route: on a touch screen every row and control is at least 44 px tall; with a mouse every control still has the invisible area wherever no neighbour claims it.

<!-- exception: notes-rhythm -->
### Paragraph spacing in notes and comments (1.4.8 Visual Presentation)

A task's notes, a project's notes and comments keep paragraphs 8 px apart, so a note reads as one block in the panel rather than as a document. Route: the high-contrast presentation spaces their paragraphs 2 em apart, as the Help pages do by default.

<!-- exception: compact-density -->
### Controls in the compact density (2.5.5 Target Size, Enhanced)

In the compact density rows sit 36 px apart by your choice, so a 44 px hit area for every control would overlap the rows above and below. Route: the comfortable density, the default, where every control has at least 44 × 44 px.

## Presentations you can choose

Under **Settings → Appearance**:

- **Contrast**: **Auto** (the default) follows your system's increase-contrast setting; **High** applies the high-contrast presentation everywhere, on every device signed in to your account.
- **Motion**: **System** (the default) follows your system's reduced-motion setting; **None** turns every transition and animation off.

Both are synced like the mode and theme and work offline. Browser zoom to 200 % reflows the app without sideways scrolling.

## How it is checked

On every change, before it can be merged:

- the colour tokens are measured in light, dark and every accent theme: text must reach 7:1, or be listed above at no less than 4.5:1;
- every component and every core screen is audited in light and dark with the WCAG 2.2 A, AA and AAA rules, and an enhanced-contrast finding passes only when it matches an entry above;
- keyboard focus is moved through every control of the core screens: each must show the ring, fully visible and not under any bar or message;
- every control of the core screens is tapped 22 px from its centre in four directions in the comfortable density;
- this guide is audited with the same rules.

## What this statement does not cover

- The public website, which has its own statement.
- Content you or other people write: a note's colours, an image's text, a pasted table.
- The native Android app beyond what the web app brings it.
- A row while it is being dragged: for the moment of the drag it is lifted at 90 % opacity, which takes its text just under 7:1; the text is there to read before and after.

## Report a problem

Tell us where you got stuck and what you use (screen reader, keyboard only, zoom, high contrast): see [Feedback and support](feedback-and-support.md). Reviewed on 2026-10-22.
