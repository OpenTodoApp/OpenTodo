# Findings

From the interface audit's first full run (2026-10-22) (`make ux-audit`, OpenSpec change `ux-audit-three-widths`): 990 captures at 360, 768, 1280 px, light and dark, en and de; 1644 findings. Reduced motion (M15) on completing a task, opening the panel and the share dialog, and the screens whose layout shifts after load (M12). Score = severity × frequency (design D4); ids are this run's ranking.

## M15

- today: `today` locator.click: Timeout 30000ms exceeded.

## M12

| Id | Score | Rule | Screen | Captures | Element | Where |
| --- | --- | --- | --- | --- | --- | --- |
| F-284 | 6 | M12 layout shift | project | 9 | `page` | 360px light en, 768px light en, 768px dark en |
| F-391 | 6 | M12 layout shift | board | 4 | `page` | 360px light en, 768px light en, 768px dark en |
| F-413 | 6 | M12 layout shift | inbox | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-950 | 4 | M12 layout shift | stats | 9 | `page` | 360px light en, 768px dark en, 360px dark en |
| F-951 | 4 | M12 layout shift | columns | 6 | `page` | 768px light en, 768px dark en, 360px light de |
| F-958 | 4 | M12 layout shift | feed | 4 | `page` | 768px light en, 768px dark en, 768px light de |
| F-965 | 4 | M12 layout shift | plan | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-974 | 4 | M12 layout shift | projects | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-976 | 4 | M12 layout shift | timeline | 4 | `page` | 360px light en, 768px light en, 768px dark en |
| F-1473 | 2 | M12 layout shift | display-today | 8 | `page` | 360px light en, 768px light en, 768px dark en |
| F-1474 | 2 | M12 layout shift | display-today-high-xl | 8 | `page` | 360px light en, 768px light en, 768px dark en |
| F-1475 | 2 | M12 layout shift | settings-notifications | 8 | `page` | 360px light en, 768px light en, 768px dark en |
| F-1476 | 2 | M12 layout shift | settings-integrations | 6 | `page` | 360px light en, 768px light en, 768px dark en |
| F-1477 | 2 | M12 layout shift | settings-data | 5 | `page` | 768px light en, 768px dark en, 768px light de |
| F-1479 | 2 | M12 layout shift | display-project | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-1481 | 2 | M12 layout shift | project-invite-member | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-1490 | 2 | M12 layout shift | projects-archived | 4 | `page` | 360px light en, 360px dark en, 360px light de |
| F-1497 | 2 | M12 layout shift | capture | 2 | `page` | 360px light de, 360px dark de |
