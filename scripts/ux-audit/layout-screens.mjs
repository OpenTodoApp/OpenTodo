// The layout check's screens and overlay openers (scripts/e2e-layout.mjs), shared
// with the interface audit tour (OpenSpec change ux-audit-three-widths D2): the
// inventory (scripts/ux-audit/screens.json) names screens and overlays from here by
// their `name` and OVERLAYS key, and its test reads both lists from this file.
import { TINY_PNG } from './seed.mjs'
import { settled } from './measure.mjs'

// Whether an overlay closes: waits for it to leave instead of a fixed pause, so a
// loaded runner (four browsers at once in CI) does not report a slow re-render as
// an overlay that stays open.
export const closes = (overlay) => overlay.waitFor({ state: 'hidden', timeout: 2000 }).then(() => true, () => false)

// `overlays` names openers from OVERLAYS below; each runs on the screen it is listed for.
export function screens(ids, base) {
  const row = (title) => (p) => p.locator('[data-task-id]').filter({ hasText: title }).first().waitFor()
  const heading = (name) => (p) => p.getByRole('heading', { name, level: 1 }).first().waitFor()
  return [
    { name: 'sign-in', path: '/', anon: true, ready: (p) => p.getByRole('button', { name: 'Sign in', exact: true }).waitFor() },
    // Project invite link (project-invite-links): a visitor's choice, and the creator, who is a member already.
    { name: 'project-invite', path: `/invite/p/${ids.projectInvite}`, anon: true, ready: (p) => p.getByRole('button', { name: /sign in to join/ }).waitFor() },
    { name: 'public-list', path: `/public/${ids.publicLink}`, anon: true, ready: (p) => p.locator('[data-public-task]').first().waitFor() },
    { name: 'task-page', path: `/t/${ids.pageSecret}/paint-the-fence`, anon: true, ready: (p) => p.locator('[data-page-send]').waitFor() },
    { name: 'project-invite-member', path: `/invite/p/${ids.projectInvite}`, ready: heading(/already a member/) },
    { name: 'inbox', path: '/inbox', ready: row('Undated inbox task'), overlays: ['notifications', 'command-palette', 'help', 'spotlight', 'sidebar', 'sidebar-view-menu', 'task-detail', 'label-picker', 'bulk-actions-menu', 'bulk-review', 'bulk-toast', 'reminder-toast', 'assistant', 'assistant-review', 'template-dialog', 'template-detail'] },
    { name: 'today', path: '/today', ready: row('Renew passport') },
    // Display mode (display-mode 3.4, 5.1): no shell, large type; high contrast and the largest size included.
    { name: 'display-today', path: '/display/today', ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-today-high-xl', path: '/display/today?contrast=high&size=xl', ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-upcoming', path: '/display/upcoming?eink=1', ready: (p) => p.locator('[data-screen="display"] [data-display-columns]').waitFor() },
    { name: 'display-project', path: `/display/project/${ids.home}?size=xl`, ready: (p) => p.locator('[data-screen="display"] [data-display-row]').first().waitFor() },
    { name: 'display-view', path: `/display/view/${ids.view}?contrast=high`, ready: (p) => p.locator('[data-screen="display"] h1').waitFor() },
    { name: 'public-display', path: `/public/${ids.publicLink}?display=1&eink=1`, anon: true, ready: (p) => p.locator('[data-screen="public/display"] [data-display-row]').first().waitFor() },
    { name: 'triage', path: '/triage', ready: (p) => p.locator('[data-triage-card]').waitFor(), overlays: ['schedule-sheet'] },
    { name: 'upcoming', path: '/upcoming', ready: heading('Upcoming') },
    { name: 'assigned', path: '/assigned', ready: row('Pick paint colours') },
    { name: 'day', path: '/day', ready: (p) => p.locator('[data-now-line], main').first().waitFor() },
    { name: 'week', path: '/week', ready: (p) => p.locator('main').first().waitFor() },
    { name: 'month', path: '/month', ready: (p) => p.locator('[data-month-grid]').waitFor() },
    // The Plan (planner-view 4.2): seven columns per row from 640 px, the agenda below it.
    { name: 'plan', path: '/plan', ready: (p) => p.locator('[data-plan-grid], [data-plan-agenda]').first().waitFor() },
    // The Statistics dashboard (stats-dashboard 5.1): tiles and panels; the heatmap and
    // the dot grid scroll sideways inside their figures, never the page.
    { name: 'stats', path: '/stats', ready: (p) => p.locator('[data-testid="stats-panels"]').waitFor() },
    { name: 'completed', path: '/completed', ready: row('Submit expense report') },
    { name: 'filter', path: '/views/new', ready: (p) => p.getByLabel('Filter query').waitFor() },
    { name: 'ask', path: '/ask', ready: heading('Assistant') },
    { name: 'trash', path: '/trash', ready: (p) => p.getByText('Old shopping list').first().waitFor() },
    { name: 'updates', path: '/updates', ready: heading('Updates') },
    // The old address still opens Updates (ux-overhaul vocabulary).
    { name: 'activity-redirect', path: '/activity', ready: heading('Updates') },
    { name: 'project', path: `/project/${ids.home}`, ready: row('Pick paint colours'), overlays: ['project-menu', 'project-move-picker', 'section-menu', 'share', 'share-invite-link', 'mention-picker', 'assignee-picker', 'help-panel', 'project-picker', 'parent-picker', 'section-picker', 'when-popover', 'inline-editor', 'zone-control', 'location-editor', 'task-history', 'blocked-by-picker', 'duplicate-project', 'save-template'] },
    { name: 'board', path: `/project/${ids.home}`, ready: row('Pick paint colours'), layout: 'Board' },
    { name: 'timeline', path: `/project/${ids.home}`, ready: row('Pick paint colours'), layout: 'Timeline' },
    // Custom fields (custom-fields): five columns at 768 px; below it the layout is not offered.
    { name: 'columns', path: `/project/${ids.work}`, widths: [768, 1280], overlays: ['fields-dialog'], ready: async (p) => {
      await row('Plan the team offsite')(p)
      const toggle = p.locator('[data-columns-toggle]')
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
      await p.getByRole('table', { name: 'Tasks and fields' }).waitFor()
    } },
    { name: 'saved-view', path: `/views/${ids.view}`, ready: heading(/Deep work/), overlays: ['view-header-menu'] },
    { name: 'dashboard', path: `/views/${ids.dashboard}`, ready: heading(/Weekly review/) },
    { name: 'label', path: `/label/${ids.label}`, ready: row('Renew passport') },
    { name: 'labels', path: '/labels', ready: heading('Labels'), overlays: ['label-menu', 'label-edit', 'label-merge-picker', 'confirm-dialog', 'new-label'] },
    { name: 'views', path: '/views', ready: heading('Views'), overlays: ['view-menu', 'rename-view', 'new-dashboard'] },
    // All projects (sidebar-favourites D6): the tree, the find field, and the archived projects opened from Settings → Data.
    { name: 'projects', path: '/projects', ready: heading('Projects') },
    { name: 'locations', path: '/locations', ready: heading('Locations'), overlays: ['new-location'] },
    { name: 'projects-archived', path: '/projects#archived', ready: (p) => p.getByText('No archived projects').first().waitFor() },
    // Settings (settings-navigation): the overview and every section, each overlay on
    // the section that holds its control (the owner sees all of them).
    // From 1024 px /settings opens the first section (settings-navigation), so the page title reads Account there.
    { name: 'settings', path: '/settings', ready: (p) => p.getByRole('heading', { name: /^(Settings|Account)$/, level: 1 }).first().waitFor(), overlays: ['notifications'] },
    ...[
      ['account', 'Account'], ['appearance', 'Appearance'],
      ['general', 'General'], ['notifications', 'Notifications'], ['capture', 'Capture', ['voice-consent']],
      ['integrations', 'Integrations'], ['data', 'Data'],
      ['people', 'People', ['delete-user']], ['server', 'Server'],
    ].map(([id, title, overlays]) => ({ name: `settings-${id}`, path: `/settings/${id}`, ready: heading(title), ...(overlays ? { overlays } : {}) })),
    // A legacy address opens its section in place (settings-navigation "Legacy settings addresses").
    { name: 'settings-legacy', path: '/settings/security', ready: heading('Account') },
    { name: 'import', path: '/settings/import', ready: heading(/Import/) },
    // The capture screen with shared files (attachments D9): the service worker's
    // hand-over store is filled in the page, then /share?inbox=<id> opens. Chromium
    // only: WebKit's throwaway contexts are private sessions, which cannot store
    // Blobs in IndexedDB (and Safari has no share target to receive files anyway).
    { name: 'share-files', path: '/inbox', engines: ['chromium'], ready: async (p) => {
      await p.locator('[data-task-id]').first().waitFor()
      const id = await p.evaluate(async (png) => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('opentodo-share', 1)
          r.onupgradeneeded = () => r.result.createObjectStore('inbox', { keyPath: 'id' })
          r.onsuccess = () => resolve(r.result)
          r.onerror = () => reject(r.error)
        })
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
        const entry = { id: crypto.randomUUID(), createdAt: Date.now(), title: 'Receipt from the hardware store', text: '', url: '', files: [
          { name: 'IMG_20261015_143012_receipt_with_a_long_camera_name.png', type: 'image/png', blob: new Blob([bytes], { type: 'image/png' }) },
          { name: 'warranty.pdf', type: 'application/pdf', blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) },
        ] }
        await new Promise((resolve, reject) => {
          const tx = db.transaction('inbox', 'readwrite')
          tx.objectStore('inbox').put(entry)
          tx.oncomplete = resolve
          tx.onerror = () => reject(tx.error)
        })
        return entry.id
      }, TINY_PNG)
      await p.goto(`${base}/share?inbox=${id}`)
      await p.locator('[data-shared-file]').first().waitFor()
    } },
    // In-app Help (user-documentation): also checked offline.
    { name: 'help', path: '/help', ready: heading('Help'), offline: '/help/keyboard' },
    { name: 'help-guide', path: '/help/sections-and-boards', ready: heading('Sections and boards') },
  ]
}

// An opener returns { overlay, trigger?, kind } or null when it does not apply here.
// kind: 'dialog' (close button + Escape + tap outside unless destructive), 'popover'
// (Escape + tap outside, close button on phones), 'panel' (detail panel / drawer:
// close button + Escape), 'toast' (inside the viewport only).
export const overlayLoc = (p) => p.locator('[data-overlay]').last()
// The project's Share and layout choice: page controls from 768 px, project menu items on a phone (phone-v2 D1).
async function openShare(p) {
  const button = p.locator('[data-project-share]')
  if (await button.isVisible().catch(() => false)) { await button.click(); return button }
  const menu = p.getByRole('button', { name: 'Project menu' }).first()
  await menu.click()
  await p.getByRole('menuitem', { name: /^(Share project|Members)/ }).click()
  return menu
}
export async function chooseLayout(p, name) {
  const group = p.getByRole('group', { name: 'Project layout' })
  if (await group.isVisible().catch(() => false)) return group.getByRole('button', { name }).click()
  await p.getByRole('button', { name: 'Project menu' }).first().click()
  await p.getByRole('menuitemcheckbox', { name }).or(p.getByRole('menuitem', { name })).first().click()
}
async function openSidebar(p) {
  const burger = p.getByRole('button', { name: 'Open menu' })
  if (await burger.isVisible()) { await burger.click(); await p.waitForTimeout(350) }
}
// Serialises assistant turns across parallel viewports (see 'assistant-review').
let assistantTurnLock = Promise.resolve()

async function tickTwo(p) {
  await p.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await p.keyboard.press('j')
  await p.keyboard.press('x')
  await p.keyboard.press('Shift+ArrowDown')
  await p.locator('[data-selection-bar]').waitFor()
}

/**
 * Opens a task panel property's editor (task-panel-facets): its part on a facet line
 * when shown, else Add › `label`. Returns the editor's popover and, when the part was
 * there, the part as its trigger.
 */
async function openProperty(p, field, label) {
  const panel = p.locator('[data-detail-for]')
  await panel.waitFor()
  // The lines settle after the panel's live queries (sections, parent) resolve.
  await panel.locator('[data-facets], [data-facts]').first().waitFor()
  const part = panel.locator(`[data-part="${field}"]`).first()
  // A phone's stacked facts keep the unset ones behind More properties (precision-phone D4).
  const more = panel.locator('[data-facts-more]')
  if (await part.count() === 0 && await more.count() > 0) { await more.scrollIntoViewIfNeeded(); await more.click() }
  const shown = await part.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)
  if (shown) {
    await part.scrollIntoViewIfNeeded()
    await part.click()
  } else {
    const add = panel.getByRole('button', { name: 'Add a property' })
    await add.scrollIntoViewIfNeeded()
    await add.click()
    await p.getByRole('menuitem', { name: label }).click()
  }
  const editor = p.locator('[data-overlay]').filter({ has: p.locator('[data-facet-editor]') }).last()
  await editor.waitFor()
  return { editor, trigger: shown ? part : undefined }
}

export const OVERLAYS = {
  async notifications(p, ctx) {
    // The bell lives in the sidebar footer (app-shell "No desktop top bar"): the drawer below 768 px.
    if (ctx.width < 768) await openSidebar(p)
    const trigger = p.locator('[data-notifications]')
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Notifications' }), trigger, kind: 'popover' }
  },
  // Search and commands (search-and-command-palette 1.3), from the header button.
  async 'command-palette'(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
    const trigger = p.locator('[data-palette-button]')
    await trigger.click()
    const overlay = p.getByRole('dialog', { name: 'Search and commands' })
    await overlay.getByRole('option').first().waitFor()
    return { overlay, trigger, kind: 'dialog' }
  },
  async spotlight(p) {
    // The sequence spotlight (shortcut-spotlight): `g` and a pause, from the list with nothing focused.
    await p.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await p.keyboard.press('g')
    const overlay = p.locator('[data-spotlight]')
    await overlay.waitFor({ state: 'visible', timeout: 3000 })
    return { overlay, kind: 'popover' }
  },
  async help(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
    // Keyboard shortcuts is in the account menu at the bottom of the sidebar (quiet-sidebar D5).
    const trigger = p.locator('[data-account-menu]')
    const reopen = async () => { await trigger.click(); await p.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click() }
    await reopen()
    return { overlay: p.getByRole('dialog', { name: 'Keyboard shortcuts' }), trigger, kind: 'dialog', reopen }
  },
  async sidebar(p, ctx) {
    if (ctx.width >= 768) return null
    await openSidebar(p)
    // The whole tree open (ux-feedback-2 D6): five levels under Work with guide lines at the capped indentation.
    const aside = p.locator('aside[data-sidebar]')
    await aside.getByRole('button', { name: 'Add or fold projects' }).click()
    await p.getByRole('menuitem', { name: 'Expand all' }).click()
    await aside.locator('[data-guide-line]').first().waitFor()
    return { overlay: aside, kind: 'drawer' }
  },
  async 'sidebar-view-menu'(p) {
    await openSidebar(p)
    const trigger = p.locator('aside[data-sidebar]').getByRole('button', { name: /^Menu for view/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover', after: async () => p.keyboard.press('Escape') }
  },
  async 'task-detail'(p) {
    // Enter on the row's open control: from 768 px with a fine pointer a click on the
    // title edits it in place instead (inline-task-editing), so the audit tour's 1280 px
    // pass opens the panel the keyboard way, as every width does here.
    await p.locator('[data-task-id]').filter({ hasText: /Renew passport|Undated inbox task/ }).first().locator('[data-row-open]').press('Enter')
    // The task opens as its page (task-full-page), which scrolls like any page: its head
    // (checkbox, title, notes) is checked in place, not as an overlay that must fit.
    return { overlay: p.locator('[data-task-page] [data-task-content]'), kind: 'inline' }
  },
  // Process the Inbox's scheduling sheet (inbox-means-unplaced): a bottom sheet on phones.
  async 'schedule-sheet'(p) {
    await p.locator('[data-triage-card]').focus()
    await p.keyboard.press('s')
    return { overlay: p.getByRole('dialog', { name: 'Schedule' }), kind: 'dialog' }
  },
  async 'label-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: /Renew passport|Undated inbox task/ }).first().locator('[data-row-open]').press('Enter')
    // The task's page opens; Esc returns to the list with it selected (task-full-page).
    await p.locator('[data-task-page]').waitFor()
    await p.keyboard.press('Escape')
    await p.locator('[data-task-id][aria-current]').first().waitFor()
    await p.keyboard.press('L')
    return { overlay: p.getByRole('dialog', { name: 'Labels for task' }), kind: 'dialog' }
  },
  // Bulk actions (bulk-edit 6.2): two rows ticked from the keyboard.
  async 'bulk-actions-menu'(p) {
    await tickTwo(p)
    const trigger = p.getByRole('button', { name: /^Actions for 2 tasks/ })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'bulk-review'(p) {
    await tickTwo(p)
    await p.getByRole('button', { name: /^Actions for 2 tasks/ }).click()
    await p.getByRole('menuitem', { name: 'Move to project' }).click()
    await p.locator('[data-picker-step] [role="option"]').filter({ hasNotText: 'Inbox' }).first().click()
    const overlay = p.getByRole('dialog', { name: /^Move 2 tasks to/ })
    await overlay.locator('[data-assistant-apply]').waitFor()
    return { overlay, kind: 'dialog' }
  },
  async 'bulk-toast'(p) {
    await tickTwo(p)
    // Priority 4 is the seeded default: the toast shows without changing the data.
    await p.keyboard.press('4')
    const overlay = p.locator('[data-bulk-toast]')
    await overlay.waitFor()
    return { overlay, kind: 'toast' }
  },
  async 'reminder-toast'(p) {
    const toast = p.getByRole('alertdialog', { name: /Reminder/ }).first()
    await toast.waitFor({ timeout: 60000 })
    return { overlay: toast, kind: 'toast' }
  },
  async 'project-menu'(p) {
    const trigger = p.getByRole('button', { name: 'Project menu' }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  // Project templates: the project menu's dialogs and the sidebar's From a template.
  ...Object.fromEntries([['duplicate-project', 'Duplicate…'], ['save-template', 'Save as template…']].map(([name, item]) => [name, async (p) => {
    await p.getByRole('button', { name: 'Project menu' }).first().click()
    await p.getByRole('menuitem', { name: item }).click()
    return { overlay: p.locator(`[data-testid="${name}"]`), kind: 'dialog' }
  }])),
  // Custom fields (custom-fields): the project menu's Fields… dialog.
  async 'fields-dialog'(p) {
    await p.getByRole('button', { name: 'Project menu' }).first().click()
    await p.getByRole('menuitem', { name: 'Fields…' }).click()
    return { overlay: p.locator('[data-testid="fields-dialog"]'), kind: 'dialog' }
  },
  async 'template-dialog'(p) {
    await openSidebar(p)
    await p.locator('aside[data-sidebar]').getByRole('button', { name: 'Add or fold projects' }).click()
    await p.getByRole('menuitem', { name: 'From a template…' }).click()
    return { overlay: p.locator('[data-testid="template-dialog"]'), kind: 'dialog' }
  },
  // The library's detail (template-library): description, steps, the preview, start day and Create.
  // Escape steps back to the library first, then closes.
  async 'template-detail'(p) {
    await openSidebar(p)
    await p.locator('aside[data-sidebar]').getByRole('button', { name: 'Add or fold projects' }).click()
    await p.getByRole('menuitem', { name: 'From a template…' }).click()
    await p.locator('[data-template-card="moving-house"]').click()
    await p.locator('[data-template-detail]').waitFor()
    return { overlay: p.locator('[data-testid="template-dialog"]'), kind: 'dialog', escapes: 2 }
  },
  async 'section-menu'(p) {
    const trigger = p.getByRole('button', { name: 'Section menu for Planning' })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async share(p) {
    const trigger = await openShare(p)
    return { overlay: p.getByRole('dialog', { name: /^Share/ }), trigger, kind: 'dialog', reopen: () => openShare(p) }
  },
  // The share dialog with the "Invite with a link" form open (project-invite-links).
  async 'share-invite-link'(p) {
    const trigger = await openShare(p)
    const dialog = p.getByRole('dialog', { name: /^Share/ })
    await settled(dialog)
    await dialog.getByRole('button', { name: 'Create a link…' }).click()
    await dialog.getByRole('button', { name: 'Create link' }).waitFor()
    return { overlay: dialog, trigger, kind: 'dialog', reopen: () => openShare(p) }
  },
  // Blocked by (task-dependencies, ux-overhaul chips): the chip when set, else Add › Blocked by.
  async 'blocked-by-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Pick paint colours' }).first().locator('[data-row-open]').press('Enter')
    const { editor, trigger } = await openProperty(p, 'blocked-by', 'Blocked by')
    await editor.getByRole('combobox').first().waitFor()
    return { overlay: editor, trigger, kind: 'popover' }
  },
  async 'mention-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    const comments = p.locator('[data-detail-for]').getByRole('tab', { name: /^Comments/ })
    await comments.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await comments.click()
    // The composer rests as one line until clicked (task-panel-facets D4).
    const resting = p.locator('[data-detail-for] [data-composer-resting]')
    // Focus, not click: the reminder toast can cover the bottom of the panel on a phone.
    if (await resting.count()) await resting.focus()
    const box = p.locator('[data-detail-for]').getByLabel('Write a comment')
    // The composer sits at the end of the Comments tab, where the reminder toast can
    // cover it on a phone; focus it as a keyboard user would.
    await box.focus()
    await box.pressSequentially('@B')
    return { overlay: p.getByRole('listbox', { name: 'Mention a member' }), kind: 'combobox', after: async () => { await box.fill(''); await p.keyboard.press('Escape'); await p.keyboard.press('Escape') } }
  },
  // Task panel (task-panel-facets): a property's picker opens in a popover anchored to its
  // part; a property without a value has no part yet and is reached through Add.
  ...Object.fromEntries([['project', 'Project'], ['parent', 'Parent task'], ['section', 'Section']].map(([field, label]) => [`${field}-picker`, async (p) => {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    const { editor, trigger } = await openProperty(p, field, label)
    await editor.getByRole('combobox').first().waitFor()
    return { overlay: editor, trigger, kind: 'popover' }
  }])),
  // A row edited in place (inline-task-editing): a mouse click on the title, from 768 px.
  async 'inline-editor'(p, ctx) {
    if (ctx.width < 768) return null
    await p.locator('[data-task-id]').filter({ hasText: 'Pick paint colours' }).first().locator('[data-row-title]').click()
    const editor = p.locator('[data-inline-editor]').first()
    // A touch screen opens the panel instead (coarse pointer): nothing inline to check there.
    if (!(await editor.waitFor({ timeout: 3000 }).then(() => true, () => false))) { await p.keyboard.press('Escape'); return null }
    return { overlay: editor, kind: 'inline', after: async () => p.keyboard.press('Escape') }
  },
  // The When popover, one segment at a time (task-panel-facets D3).
  async 'when-popover'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    const { editor, trigger } = await openProperty(p, 'due', 'Do on')
    return { overlay: editor, trigger, kind: 'popover' }
  },
  // A task's location editor (task-locations "Setting a location"): search, coordinates,
  // "Use my location" and the saved locations; no map until "Pick on the map".
  async 'location-editor'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    const { editor, trigger } = await openProperty(p, 'location', 'Location')
    await editor.locator('[data-location-editor]').waitFor()
    return { overlay: editor, trigger, kind: 'popover' }
  },
  // The Locations page's new-location form (task-locations "Locations page").
  async 'new-location'(p) {
    const trigger = p.locator('[data-places-page]').getByRole('button', { name: 'New location' }).first()
    await trigger.click()
    const form = p.locator('[data-new-place]')
    await form.waitFor()
    return { overlay: form, kind: 'inline', after: async () => { await form.getByRole('button', { name: 'Cancel' }).click() } }
  },
  async 'zone-control'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    // The zone lives inside the Do on segment of the When popover (task-panel-facets D3).
    await openProperty(p, 'due', 'Do on')
    const trigger = p.locator('[data-facet-editor]').getByRole('button', { name: /^Time zone:/ }).first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'Time zone' }), trigger, kind: 'popover' }
  },
  async 'task-history'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Get three quotes' }).first().locator('[data-row-open]').press('Enter')
    const panel = p.locator('[data-detail-for]')
    const tab = panel.getByRole('tab', { name: 'History' })
    await tab.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await tab.click()
    const versions = panel.getByRole('list', { name: 'Versions' })
    await versions.waitFor({ timeout: 10000 })
    const first = versions.getByRole('button', { expanded: false }).first()
    await first.focus()
    await p.keyboard.press('Enter')
    // The first change of the expanded version (values and its Restore action) is the
    // part to check; a whole version can be taller than a phone screen.
    const change = panel.locator('[aria-label^="Changes:"] > li').first()
    await change.waitFor()
    await change.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    return { overlay: change, kind: 'inline', after: async () => panel.getByRole('tab', { name: /^Comments/ }).click() }
  },
  async 'assignee-picker'(p) {
    await p.locator('[data-task-id]').filter({ hasText: 'Pick paint colours' }).first().locator('[data-row-open]').press('Enter')
    // The task's page opens; Esc returns to the list with it selected (task-full-page).
    await p.locator('[data-task-page]').waitFor()
    await p.keyboard.press('Escape')
    await p.locator('[data-task-id][aria-current]').first().waitFor()
    await p.keyboard.press('A')
    return { overlay: p.getByRole('dialog', { name: 'Assign task' }), kind: 'dialog' }
  },
  async 'view-header-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: /^Menu for view/ }).first()
    if (!(await trigger.isVisible())) return null
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'label-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  // labels-and-menus: the edit panel, the merge picker step and a destructive confirmation.
  async 'label-edit'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Edit…' }).click()
    return { overlay: p.getByRole('dialog', { name: 'Edit label errand' }), kind: 'popover', after: async () => p.keyboard.press('Escape') }
  },
  async 'label-merge-picker'(p) {
    const trigger = p.locator('main').getByRole('button', { name: 'Menu for label errand' })
    await trigger.click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Merge into…' }).click()
    await p.locator('[data-picker-step]').waitFor()
    // The first Escape goes back to the items, the second closes (spec: picker steps).
    return { overlay: overlayLoc(p), trigger, kind: 'popover', escapes: 2 }
  },
  async 'confirm-dialog'(p) {
    await p.locator('main').getByRole('button', { name: 'Menu for label errand' }).click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Delete label…' }).click()
    return { overlay: p.getByRole('alertdialog', { name: /Delete label/ }), kind: 'dialog', after: async () => p.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click() }
  },
  async 'project-move-picker'(p) {
    await p.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await p.keyboard.press('m')
    await p.locator('[data-picker-step]').waitFor()
    return { overlay: overlayLoc(p), kind: 'popover', escapes: 2 }
  },
  async 'new-label'(p) {
    await p.locator('main').getByRole('button', { name: 'New label' }).first().click()
    return { overlay: p.locator('main form').first(), kind: 'inline', after: async () => p.keyboard.press('Escape') }
  },
  async 'view-menu'(p) {
    const trigger = p.locator('main').getByRole('button', { name: /^Menu for view/ }).first()
    await trigger.click()
    return { overlay: overlayLoc(p), trigger, kind: 'popover' }
  },
  async 'rename-view'(p) {
    await p.locator('main').getByRole('button', { name: /^Menu for view/ }).first().click()
    await overlayLoc(p).getByRole('menuitem', { name: 'Rename' }).click()
    return { overlay: p.getByRole('dialog', { name: 'Rename view' }), kind: 'dialog' }
  },
  async 'new-dashboard'(p) {
    const trigger = p.getByRole('button', { name: 'New board' })
    await trigger.click()
    return { overlay: p.getByRole('dialog', { name: 'New board' }), trigger, kind: 'dialog' }
  },
  async 'voice-consent'(p) {
    const box = p.getByRole('switch', { name: /Dictate tasks into quick add/ })
    if (!(await box.count()) || await box.isDisabled()) return null
    if (await box.isChecked()) return null
    await box.scrollIntoViewIfNeeded()
    await box.click()
    const d = p.getByRole('dialog', { name: 'Turn on voice capture?' })
    await p.waitForTimeout(300)
    if (!(await d.isVisible())) return null
    return { overlay: d, kind: 'dialog' }
  },
  // Contextual help over the share dialog (user-documentation 4.2): the panel opens on
  // top, and closing it leaves the dialog with the typed email in place.
  async 'help-panel'(p) {
    await openShare(p)
    const dialog = p.getByRole('dialog', { name: /^Share/ })
    await dialog.waitFor()
    const email = dialog.getByRole('textbox').first()
    await email.fill('chen@example.com')
    const trigger = dialog.locator('[data-help-screen="share-dialog"]')
    await trigger.click()
    const overlay = p.locator('[data-help-panel]')
    return {
      overlay, trigger, kind: 'dialog',
      after: async () => {
        if (await overlay.isVisible()) await p.keyboard.press('Escape')
        if (!(await dialog.isVisible())) throw new Error('closing help also closed the share dialog')
        const v = await email.inputValue()
        if (v !== 'chen@example.com') throw new Error(`the typed email was lost when help opened (now "${v}")`)
        await p.keyboard.press('Escape')
      },
    }
  },
  // In-app assistant (in-app-assistant): the panel from the header button, and
  // a proposal to review after a scripted answer.
  async assistant(p, ctx) {
    if (ctx.width < 768) await openSidebar(p)
    const trigger = p.locator('[data-assistant-launcher]')
    await trigger.click()
    return { overlay: p.locator('[data-assistant-panel]'), trigger, kind: 'dialog' }
  },
  // Viewports run in parallel as the same user and the server allows one turn
  // per user at a time (409 turn_in_progress), so turns take a shared lock
  // until the answer has finished streaming.
  async 'assistant-review'(p) {
    let release
    const prev = assistantTurnLock
    assistantTurnLock = new Promise((r) => { release = r })
    await prev
    try {
      await p.keyboard.press('Shift+I')
      const panel = p.locator('[data-assistant-panel]')
      await panel.waitFor()
      await panel.locator('[data-assistant-composer]').fill('Move everything overdue to Friday')
      await p.keyboard.press('Enter')
      await panel.locator('[data-assistant-review]').waitFor({ timeout: 20000 })
      await panel.locator('[aria-busy="true"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
      return { overlay: panel, kind: 'dialog', after: async () => { if (await panel.isVisible()) await p.keyboard.press('Escape') } }
    } finally {
      release()
    }
  },
  async 'delete-user'(p) {
    const del = p.getByRole('button', { name: 'Delete', exact: true }).first()
    if (!(await del.count())) return null
    await del.scrollIntoViewIfNeeded()
    await del.click()
    return { overlay: p.getByRole('dialog', { name: /^Delete bob@example.com/ }), kind: 'dialog', destructive: true }
  },
}

