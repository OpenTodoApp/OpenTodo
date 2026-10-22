# Findings

From the interface audit's final run on main after phone-v2 (2026-10-22) (`make ux-audit`, OpenSpec change `ux-audit-three-widths`): 980 captures at 360, 768, 1280 px, light and dark, en and de; 1347 findings. Reduced motion (M15) on completing a task, opening the panel and the share dialog, and the screens whose layout shifts after load (M12). Score = severity × frequency (design D4); ids are this run's ranking.

## M15

None: no element moves or scales under reduced motion at those three moments.

## M12

| Id | Score | Rule | Screen | Captures | Element | Where |
| --- | --- | --- | --- | --- | --- | --- |
| F-196 | 6 | M12 layout shift | project | 10 | `page` | 360px dark en, 360px light en, 768px light en |
| F-209 | 6 | M12 layout shift | board | 4 | `page` | 360px dark en, 360px light en, 768px light en |
| F-224 | 6 | M12 layout shift | inbox | 4 | `page` | 360px dark en, 360px light en, 360px light de |
| F-717 | 4 | M12 layout shift | stats | 10 | `page` | 360px dark en, 360px light en, 768px light en |
| F-721 | 4 | M12 layout shift | feed | 5 | `page` | 360px light en, 768px light en, 768px dark en |
| F-722 | 4 | M12 layout shift | columns | 4 | `page` | 768px light en, 768px dark en, 768px light de |
| F-731 | 4 | M12 layout shift | plan | 4 | `page` | 360px dark en, 360px light en, 360px light de |
| F-740 | 4 | M12 layout shift | projects | 4 | `page` | 360px dark en, 360px light en, 360px light de |
| F-745 | 4 | M12 layout shift | timeline | 4 | `page` | 360px dark en, 360px light en, 768px light en |
| F-1167 | 2 | M12 layout shift | display-today | 8 | `page` | 360px dark en, 360px light en, 768px light en |
| F-1168 | 2 | M12 layout shift | display-today-high-xl | 8 | `page` | 360px dark en, 360px light en, 768px light en |
| F-1169 | 2 | M12 layout shift | settings-integrations | 8 | `page` | 360px dark en, 360px light en, 768px light en |
| F-1170 | 2 | M12 layout shift | settings-notifications | 8 | `page` | 360px dark en, 360px light en, 768px light en |
| F-1171 | 2 | M12 layout shift | projects-archived | 6 | `page` | 360px dark en, 360px light en, 768px dark en |
| F-1172 | 2 | M12 layout shift | settings-data | 6 | `page` | 768px light en, 768px dark en, 768px light de |
| F-1174 | 2 | M12 layout shift | display-project | 4 | `page` | 360px dark en, 360px light en, 360px light de |
| F-1178 | 2 | M12 layout shift | project-invite-member | 4 | `page` | 360px dark en, 360px light en, 360px light de |
| F-1193 | 2 | M12 layout shift | capture | 2 | `page` | 360px light de, 360px dark de |
