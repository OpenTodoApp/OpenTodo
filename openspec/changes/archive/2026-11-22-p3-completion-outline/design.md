# Design

- Use the existing P3 border token, which reads the theme's priority blue. Rows, cards, and compact rows share `PRIORITY_RING`. The task panel already uses the blue border and will show its centre empty at rest.
- Keep each priority mark's existing shape and accessible text. The blue ring adds another cue for people scanning the list.
- The change is visual only. It adds zero fields, settings, controls, shortcuts, rows of chrome, or scroll regions. It needs zero dependencies, extra network requests, or stored values. The first load is 697.6 KiB gzip against the 712 KiB budget, verified with `make bundle-budget`.
