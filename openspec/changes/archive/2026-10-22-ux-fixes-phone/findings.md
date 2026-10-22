# Findings

From the interface audit's final run on main after phone-v2 (2026-10-22) (`make ux-audit`, OpenSpec change `ux-audit-three-widths`): 980 captures at 360, 768, 1280 px, light and dark, en and de; 1347 findings. The 80 highest-ranked rule findings this change takes. Score = severity × frequency (design D4); ids are this run's ranking.

| Id | Score | Rule | Screen | Captures | Element | Where |
| --- | --- | --- | --- | --- | --- | --- |
| F-001 | 9 | M10 truncation | today | 8 | `<span.hidden.max-w-48> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-002 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en, 1280px light de |
| F-003 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en, 1280px light de |
| F-004 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Sand the boards"` | 1280px light en, 1280px dark en, 1280px light de |
| F-005 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Read https://example.com/a/very/long/pat"` | 1280px light en, 1280px dark en, 1280px light de |
| F-006 | 9 | M10 truncation | project | 4 | `<h1.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px dark en, 360px light en, 360px light de |
| F-007 | 9 | M7 target size | quick-add | 4 | `<li.flex.cursor-pointer> "errand"` | 360px dark en, 360px light en, 768px light en |
| F-008 | 9 | M10 truncation | add-menu | 2 | `<p.truncate.text-meta> "3 planned tasks without a project"` | 360px dark en, 360px light en |
| F-009 | 9 | M7 target size | add-menu | 2 | `<button.rounded-chip.px-1.5> "All projects"` | 1280px light en, 1280px dark en |
| F-010 | 9 | M7 target size | add-menu | 2 | `<button.rounded-chip.px-1.5> "Find in the sidebar"` | 1280px light en, 1280px dark en |
| F-011 | 9 | M7 target size | add-menu | 2 | `<button.rounded-chip.px-1.5> "Add or fold projects"` | 1280px light en, 1280px dark en |
| F-012 | 9 | M7 target size | add-menu | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-013 | 9 | M7 target size | add-menu | 2 | `<button.flex.h-5> "Collapse subtasks"` | 1280px light en, 1280px dark en |
| F-014 | 9 | M7 target size | add-menu | 2 | `<button.group/check.touch-target> "Complete Paint the fence along the garde"` | 1280px light en, 1280px dark en |
| F-015 | 9 | M7 target size | add-menu | 2 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en |
| F-016 | 9 | M7 target size | add-menu | 2 | `<button.group/check.touch-target> "Complete Buy primer"` | 1280px light en, 1280px dark en |
| F-017 | 9 | M7 target size | add-menu | 2 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en |
| F-018 | 9 | M7 target size | add-menu | 2 | `<button.group/check.touch-target> "Complete Sand the boards"` | 1280px light en, 1280px dark en |
| F-019 | 9 | M7 target size | add-menu | 2 | `<button.flex.min-w-0> "Sand the boards"` | 1280px light en, 1280px dark en |
| F-020 | 9 | M7 target size | add-menu | 2 | `<button.group/check.touch-target> "Complete Undated inbox task with a long "` | 1280px light en, 1280px dark en |
| F-021 | 9 | M7 target size | add-menu | 2 | `<button.group/check.touch-target> "Complete Read https://example.com/a/very"` | 1280px light en, 1280px dark en |
| F-022 | 9 | M7 target size | add-menu | 2 | `<button.flex.min-w-0> "Read https://example.com/a/very/long/pat"` | 1280px light en, 1280px dark en |
| F-023 | 9 | M10 truncation | board | 2 | `<h1.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px dark en, 360px light en |
| F-024 | 9 | M7 target size | board | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-025 | 9 | M7 target size | board | 2 | `<button.flex.items-center> "Members: Ada Lovelace (owner), Bob Okafo"` | 1280px light en, 1280px dark en |
| F-026 | 9 | M7 target size | board | 2 | `<button.inline-flex.items-center> "Public: 1 active link. Open the public l"` | 1280px light en, 1280px dark en |
| F-027 | 9 | M7 target size | board | 2 | `<button.group/check.touch-target> "Complete Pick paint colours"` | 1280px light en, 1280px dark en |
| F-028 | 9 | M7 target size | board | 2 | `<button.group/check.touch-target> "Complete Get three quotes for the kitche"` | 1280px light en, 1280px dark en |
| F-029 | 9 | M7 target size | board | 2 | `<button.group/check.touch-target> "Complete Book the kitchen fitters"` | 1280px light en, 1280px dark en |
| F-030 | 9 | M7 target size | board | 2 | `<button.group/check.touch-target> "Complete Call the plumber"` | 1280px light en, 1280px dark en |
| F-031 | 9 | M8 focus ring | board | 2 | `<div.hidden.w-1> "Resize sidebar"` | 1280px light en, 1280px dark en |
| F-032 | 9 | M10 truncation | bulk-actions | 2 | `<p.truncate.text-meta> "3 planned tasks without a project"` | 360px dark en, 360px light en |
| F-033 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-034 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.h-5> "Collapse subtasks"` | 1280px light en, 1280px dark en |
| F-035 | 9 | M7 target size | bulk-actions | 2 | `<input.h-4.w-4> "Select Paint the fence along the garden "` | 1280px light en, 1280px dark en |
| F-036 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en |
| F-037 | 9 | M7 target size | bulk-actions | 2 | `<input.h-4.w-4> "Select Buy primer"` | 1280px light en, 1280px dark en |
| F-038 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en |
| F-039 | 9 | M7 target size | bulk-actions | 2 | `<input.h-4.w-4> "Select Sand the boards"` | 1280px light en, 1280px dark en |
| F-040 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.min-w-0> "Sand the boards"` | 1280px light en, 1280px dark en |
| F-041 | 9 | M7 target size | bulk-actions | 2 | `<input.h-4.w-4> "Select Undated inbox task with a long ti"` | 1280px light en, 1280px dark en |
| F-042 | 9 | M7 target size | bulk-actions | 2 | `<input.h-4.w-4> "Select Read https://example.com/a/very/l"` | 1280px light en, 1280px dark en |
| F-043 | 9 | M7 target size | bulk-actions | 2 | `<button.flex.min-w-0> "Read https://example.com/a/very/long/pat"` | 1280px light en, 1280px dark en |
| F-044 | 9 | M10 truncation | command-palette | 2 | `<p.truncate.text-meta> "3 planned tasks without a project"` | 360px dark en, 360px light en |
| F-045 | 9 | M7 target size | command-palette | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-046 | 9 | M7 target size | command-palette | 2 | `<button.flex.h-5> "Collapse subtasks"` | 1280px light en, 1280px dark en |
| F-047 | 9 | M7 target size | command-palette | 2 | `<button.group/check.touch-target> "Complete Paint the fence along the garde"` | 1280px light en, 1280px dark en |
| F-048 | 9 | M7 target size | command-palette | 2 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en |
| F-049 | 9 | M7 target size | command-palette | 2 | `<button.group/check.touch-target> "Complete Buy primer"` | 1280px light en, 1280px dark en |
| F-050 | 9 | M7 target size | command-palette | 2 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en |
| F-051 | 9 | M7 target size | command-palette | 2 | `<button.group/check.touch-target> "Complete Sand the boards"` | 1280px light en, 1280px dark en |
| F-052 | 9 | M7 target size | command-palette | 2 | `<button.flex.min-w-0> "Sand the boards"` | 1280px light en, 1280px dark en |
| F-053 | 9 | M7 target size | command-palette | 2 | `<button.group/check.touch-target> "Complete Undated inbox task with a long "` | 1280px light en, 1280px dark en |
| F-054 | 9 | M7 target size | command-palette | 2 | `<button.group/check.touch-target> "Complete Read https://example.com/a/very"` | 1280px light en, 1280px dark en |
| F-055 | 9 | M7 target size | command-palette | 2 | `<button.flex.min-w-0> "Read https://example.com/a/very/long/pat"` | 1280px light en, 1280px dark en |
| F-056 | 9 | M10 truncation | inbox | 2 | `<p.truncate.text-meta> "3 planned tasks without a project"` | 360px dark en, 360px light en |
| F-057 | 9 | M10 truncation | inbox | 2 | `<p.truncate.text-meta> "3 geplante Aufgaben ohne Projekt"` | 360px light de, 360px dark de |
| F-058 | 9 | M7 target size | inbox | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-059 | 9 | M7 target size | inbox | 2 | `<button.flex.h-5> "Collapse subtasks"` | 1280px light en, 1280px dark en |
| F-060 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Complete Paint the fence along the garde"` | 1280px light en, 1280px dark en |
| F-061 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Complete Buy primer"` | 1280px light en, 1280px dark en |
| F-062 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Complete Sand the boards"` | 1280px light en, 1280px dark en |
| F-063 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Complete Undated inbox task with a long "` | 1280px light en, 1280px dark en |
| F-064 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Complete Read https://example.com/a/very"` | 1280px light en, 1280px dark en |
| F-065 | 9 | M7 target size | inbox | 2 | `<button.flex.h-5> "Work ausklappen"` | 1280px light de, 1280px dark de |
| F-066 | 9 | M7 target size | inbox | 2 | `<button.flex.h-5> "Unteraufgaben einklappen"` | 1280px light de, 1280px dark de |
| F-067 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Paint the fence along the garden path be"` | 1280px light de, 1280px dark de |
| F-068 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Buy primer erledigen"` | 1280px light de, 1280px dark de |
| F-069 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Sand the boards erledigen"` | 1280px light de, 1280px dark de |
| F-070 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Undated inbox task with a long title tha"` | 1280px light de, 1280px dark de |
| F-071 | 9 | M7 target size | inbox | 2 | `<button.group/check.touch-target> "Read https://example.com/a/very/long/pat"` | 1280px light de, 1280px dark de |
| F-072 | 9 | M8 focus ring | inbox | 2 | `<div.hidden.w-1> "Resize sidebar"` | 1280px light en, 1280px dark en |
| F-073 | 9 | M10 truncation | label-picker | 2 | `<p.truncate.text-meta> "3 planned tasks without a project"` | 360px dark en, 360px light en |
| F-074 | 9 | M7 target size | label-picker | 2 | `<button.flex.h-5> "Expand Work"` | 1280px light en, 1280px dark en |
| F-075 | 9 | M7 target size | label-picker | 2 | `<button.flex.h-5> "Collapse subtasks"` | 1280px light en, 1280px dark en |
| F-076 | 9 | M7 target size | label-picker | 2 | `<button.group/check.touch-target> "Complete Paint the fence along the garde"` | 1280px light en, 1280px dark en |
| F-077 | 9 | M7 target size | label-picker | 2 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en |
| F-078 | 9 | M7 target size | label-picker | 2 | `<button.group/check.touch-target> "Complete Buy primer"` | 1280px light en, 1280px dark en |
| F-079 | 9 | M7 target size | label-picker | 2 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en |
| F-080 | 9 | M7 target size | label-picker | 2 | `<button.group/check.touch-target> "Complete Sand the boards"` | 1280px light en, 1280px dark en |

## Added by screen-stories-rare (2026-10-22)

The focus pass on the new display stories found `<li.display-row>` focused without a ring (now in `scripts/ux-audit/focus-exempt.json`). The cause is likely shared by most of the focus exemptions: under Tailwind 4, `outline-none` sets `--tw-outline-style: none`, and a later `focus-visible:outline-2` (or `-3`) only sets the width, so no outline is drawn. Adding `focus-visible:outline-solid` where `outline-none` and `focus-visible:outline-N` meet (index.css `.display-row`, `ListRow`, `Chips`, `AskComposer`, `CalendarView`, `review/charts.tsx`, `LoopHome`) should let several exemption lines go at once.

Confirmed and fixed in this change (design D3): `focus-visible:outline-solid` is added in all 18 places, `.display-row` included, and the style lint `cancelledRings` fails on the combination. `focus-exempt.json` is empty, `li.display-row` included.
