## MODIFIED Requirements

### Requirement: Sidebar surface tint
From 768 px with a fine pointer the sidebar's background SHALL be the sidebar surface token, which is the plain canvas in every accent theme and colour scheme (the accent tint of sidebar-v2 is retired: Precision keeps colour for state), so the sidebar reads as part of the window around the inset content surface. The sticky group headers SHALL use the same token so scrolling never shows a seam. The sidebar SHALL never be translucent over content, and the high-contrast override SHALL keep the sidebar surface the plain canvas. The phone drawer and the sheets SHALL keep their surface colour.

#### Scenario: Tint follows the theme
- **WHEN** the user switches the accent theme from emerald to blue and the colour scheme from light to dark
- **THEN** the sidebar surface becomes the dark canvas with no accent mixed in, the sticky headers match it, and nothing in the sidebar's background follows the accent

#### Scenario: No seam while scrolling
- **WHEN** the user scrolls a sidebar with forty projects
- **THEN** the sticky Projects header shows the sidebar surface colour, and no band of a different colour appears above the rows

#### Scenario: High contrast
- **WHEN** the user turns on high contrast
- **THEN** the sidebar is the plain canvas, as it is without high contrast, and every sidebar pair meets the high-contrast minimums

#### Scenario: Phone keeps the surface
- **WHEN** the window is 390 px wide and the drawer opens
- **THEN** the drawer has the surface colour, not the sidebar tint
