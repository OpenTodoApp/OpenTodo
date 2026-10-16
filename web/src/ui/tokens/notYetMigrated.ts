// Screens the style lint has not reached yet (OpenSpec change ux-overhaul,
// design-system "Token lint covers the screens"). Each list may only shrink: a
// screen leaves it when its raw sizes, radii, shadows and legacy classes (or its
// native title attributes) are gone, and both are empty when the change is done.
// Seeded on 2026-10-15 from the files as they were; emptied the same day by task 8.8. Never add a file.

/** Files with raw text sizes, pixel sizes, raw radii, raw shadows or legacy component classes. */
export const STYLE_NOT_YET_MIGRATED: readonly string[] = []
export const STYLE_NOT_YET_MIGRATED_MAX = 0

/** Files with a native `title` attribute on an HTML element (the Tooltip primitive replaces it). */
export const TITLE_NOT_YET_MIGRATED: readonly string[] = []
export const TITLE_NOT_YET_MIGRATED_MAX = 0
