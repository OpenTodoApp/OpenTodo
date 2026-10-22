# Findings

From the interface audit's first full run (2026-10-22) (`make ux-audit`, OpenSpec change `ux-audit-three-widths`): 990 captures at 360, 768, 1280 px, light and dark, en and de; 1644 findings. The 80 highest-ranked rule findings this change takes. Score = severity × frequency (design D4); ids are this run's ranking.

| Id | Score | Rule | Screen | Captures | Element | Where |
| --- | --- | --- | --- | --- | --- | --- |
| F-004 | 9 | M10 truncation | inbox | 12 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-005 | 9 | M10 truncation | inbox | 8 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-006 | 9 | M10 truncation | inbox | 8 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-007 | 9 | M10 truncation | inbox | 8 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-008 | 9 | M10 truncation | inbox | 8 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-009 | 9 | M10 truncation | project | 8 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-010 | 9 | M10 truncation | project | 8 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-011 | 9 | M10 truncation | today | 8 | `<div.user-text.text-body> "Get three quotes for the kitchen"` | 360px light en, 768px light en, 768px dark en |
| F-012 | 9 | M10 truncation | today | 8 | `<div.user-text.text-body> "Inbox task with a deliberately long titl"` | 360px light en, 768px light en, 768px dark en |
| F-013 | 9 | M10 truncation | today | 8 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-014 | 9 | M10 truncation | today | 8 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-015 | 9 | M10 truncation | today | 8 | `<span.hidden.max-w-48> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-016 | 9 | M10 truncation | upcoming | 8 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-017 | 9 | M10 truncation | upcoming | 8 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-018 | 9 | M10 truncation | add-menu | 6 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 360px light en, 768px light en, 768px dark en |
| F-019 | 9 | M10 truncation | add-menu | 6 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px light en, 768px light en, 768px dark en |
| F-020 | 9 | M10 truncation | add-menu | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-021 | 9 | M10 truncation | bulk-actions | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-022 | 9 | M7 target size | bulk-actions | 6 | `<input.h-4.w-4> "Select Paint the fence along the garden "` | 360px light en, 768px light en, 768px dark en |
| F-023 | 9 | M7 target size | bulk-actions | 6 | `<input.h-4.w-4> "Select Buy primer"` | 360px light en, 768px light en, 768px dark en |
| F-024 | 9 | M7 target size | bulk-actions | 6 | `<input.h-4.w-4> "Select Sand the boards"` | 360px light en, 768px light en, 768px dark en |
| F-025 | 9 | M7 target size | bulk-actions | 6 | `<input.h-4.w-4> "Select Undated inbox task with a long ti"` | 360px light en, 768px light en, 768px dark en |
| F-026 | 9 | M7 target size | bulk-actions | 6 | `<input.h-4.w-4> "Select Read https://example.com/a/very/l"` | 360px light en, 768px light en, 768px dark en |
| F-027 | 9 | M10 truncation | command-palette | 6 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 360px light en, 768px light en, 768px dark en |
| F-028 | 9 | M10 truncation | command-palette | 6 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px light en, 768px light en, 768px dark en |
| F-029 | 9 | M10 truncation | command-palette | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-030 | 9 | M10 truncation | label-picker | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-031 | 9 | M10 truncation | notifications | 6 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 360px light en, 768px light en, 768px dark en |
| F-032 | 9 | M10 truncation | notifications | 6 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px light en, 768px light en, 768px dark en |
| F-033 | 9 | M10 truncation | notifications | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-034 | 9 | M10 truncation | notifications | 6 | `<span.block.truncate> "“@Ada can you check https://example.com/"` | 360px light en, 768px light en, 768px dark en |
| F-035 | 9 | M10 truncation | panel-comments | 6 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-036 | 9 | M10 truncation | panel-comments | 6 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-037 | 9 | M10 truncation | panel-comments | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-038 | 9 | M10 truncation | quick-add | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-039 | 9 | M10 truncation | task-panel | 6 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-040 | 9 | M10 truncation | task-panel | 6 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-041 | 9 | M10 truncation | task-panel | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-042 | 9 | M10 truncation | undo-toast | 6 | `<div.user-text.text-body> "Read https://example.com/a/very/long/pat"` | 360px light en, 768px light en, 768px dark en |
| F-043 | 9 | M7 target size | undo-toast | 6 | `<input.h-4.w-4> "Select Paint the fence along the garden "` | 360px light en, 768px light en, 768px dark en |
| F-044 | 9 | M7 target size | undo-toast | 6 | `<input.h-4.w-4> "Select Buy primer"` | 360px light en, 768px light en, 768px dark en |
| F-045 | 9 | M7 target size | undo-toast | 6 | `<input.h-4.w-4> "Select Sand the boards"` | 360px light en, 768px light en, 768px dark en |
| F-046 | 9 | M7 target size | undo-toast | 6 | `<input.h-4.w-4> "Select Undated inbox task with a long ti"` | 360px light en, 768px light en, 768px dark en |
| F-047 | 9 | M7 target size | undo-toast | 6 | `<input.h-4.w-4> "Select Read https://example.com/a/very/l"` | 360px light en, 768px light en, 768px dark en |
| F-048 | 9 | M10 truncation | add-menu | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-049 | 9 | M10 truncation | add-menu | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-050 | 9 | M10 truncation | board | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-051 | 9 | M10 truncation | board | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-052 | 9 | M10 truncation | bulk-actions | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-053 | 9 | M10 truncation | bulk-actions | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-054 | 9 | M10 truncation | bulk-actions | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-055 | 9 | M10 truncation | bulk-actions | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-056 | 9 | M10 truncation | command-palette | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-057 | 9 | M10 truncation | command-palette | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-058 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Paint the fence along the garden path be"` | 1280px light en, 1280px dark en, 1280px light de |
| F-059 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Buy primer"` | 1280px light en, 1280px dark en, 1280px light de |
| F-060 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Sand the boards"` | 1280px light en, 1280px dark en, 1280px light de |
| F-061 | 9 | M7 target size | inbox | 4 | `<button.flex.min-w-0> "Read https://example.com/a/very/long/pat"` | 1280px light en, 1280px dark en, 1280px light de |
| F-062 | 9 | M10 truncation | label-picker | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-063 | 9 | M10 truncation | label-picker | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-064 | 9 | M10 truncation | label-picker | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-065 | 9 | M10 truncation | label-picker | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-066 | 9 | M10 truncation | notifications | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-067 | 9 | M10 truncation | notifications | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-068 | 9 | M10 truncation | panel-comments | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-069 | 9 | M10 truncation | panel-comments | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-070 | 9 | M10 truncation | project | 4 | `<h1.min-w-0.flex-1> "Home renovation with a rather long proje"` | 360px light en, 360px dark en, 360px light de |
| F-071 | 9 | M10 truncation | project | 4 | `<div.user-text.text-body> "Get three quotes for the kitchen"` | 360px light en, 360px dark en, 360px light de |
| F-072 | 9 | M10 truncation | project | 4 | `<button.user-text.min-w-0> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 768px light de |
| F-073 | 9 | M10 truncation | quick-add | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
| F-074 | 9 | M10 truncation | quick-add | 4 | `<div.user-text.text-body> "Undated inbox task with a long title tha"` | 360px light en, 768px light en, 768px dark en |
| F-075 | 9 | M10 truncation | quick-add | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-076 | 9 | M10 truncation | quick-add | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-077 | 9 | M7 target size | quick-add | 4 | `<li.flex.cursor-pointer> "errand"` | 360px light en, 768px light en, 768px dark en |
| F-078 | 9 | M10 truncation | task | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-079 | 9 | M10 truncation | task | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-080 | 9 | M10 truncation | task-panel | 4 | `<span.min-w-0.flex-1> "Deep work and everything else that matte"` | 768px light en, 768px dark en, 1280px light en |
| F-081 | 9 | M10 truncation | task-panel | 4 | `<span.min-w-0.flex-1> "Home renovation with a rather long proje"` | 768px light en, 768px dark en, 1280px light en |
| F-082 | 9 | M10 truncation | today | 4 | `<span.truncate> "Home renovation with a rather long proje"` | 360px light en, 360px dark en, 360px light de |
| F-083 | 9 | M10 truncation | undo-toast | 4 | `<div.user-text.text-body> "Paint the fence along the garden path be"` | 360px light en, 768px light en, 768px dark en |
