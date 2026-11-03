// @vitest-environment happy-dom
// migration-everywhere "Switching from another app": the picker lists the
// matrix's apps in place (no dialog), choosing one reports it, and the chosen
// app's export steps and full guide are shown; offline it is disabled.
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { SwitchFromPicker } from './SwitchFromPicker'
import { SWITCH_APPS, exportSteps, type SwitchApp } from '../../lib/switchApps'
import { DEFAULT_OPTIONS, ImportView, type ImportViewProps } from '../ImportScreen'

const steps = async (app: SwitchApp) => `<ol><li>Open ${app.name} settings.</li></ol>`
const noop = () => {}

describe('SwitchFromPicker', () => {
  it('lists every app in place and reports the one chosen with the keyboard', async () => {
    const onChange = vi.fn()
    const { unmount } = await render(<SwitchFromPicker value={null} onChange={onChange} disabled={false} encrypted={false} loadSteps={steps} />)
    const input = document.querySelector<HTMLInputElement>('[data-switch-from] input[role="combobox"]')!
    await act(async () => { input.focus() })
    await waitFor(() => !!document.querySelector('[data-switch-from-list]'), 'the list')
    expect(document.querySelectorAll('[data-switch-from-list] [role="option"]').length).toBe(SWITCH_APPS.length)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await type(input, 'vik')
    await key(input, 'Enter')
    await waitFor(() => onChange.mock.calls.length > 0, 'the pick')
    expect(onChange.mock.calls[0][0].format).toBe('vikunja-export')
    await unmount()
  })

  it('shows the chosen app, its steps and the full guide link; clear resets it', async () => {
    const onChange = vi.fn()
    const { unmount } = await render(<SwitchFromPicker value="vikunja" onChange={onChange} disabled={false} encrypted loadSteps={steps} />)
    expect(document.querySelector('[data-switch-from-chosen]')?.textContent).toContain('Vikunja')
    const toggle = [...document.querySelectorAll('[data-switch-from-steps] button')].find((b) => b.textContent === 'Show steps')
    if (toggle) await click(toggle) // collapsed on a narrow window
    await waitFor(() => !!document.querySelector('[data-switch-from-steps] li'), 'the steps')
    expect(document.querySelector('[data-switch-from-steps]')?.textContent).toContain('Open Vikunja settings.')
    expect(document.querySelector<HTMLAnchorElement>('[data-switch-from-steps] a')?.getAttribute('href')).toBe('/help/switch%2Fvikunja')
    expect(document.querySelector('[data-switch-from-e2ee]')).not.toBeNull()
    await click(document.querySelector('[aria-label="Clear the app"]')!)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await unmount()
  })

  it('is disabled offline', async () => {
    const { unmount } = await render(<SwitchFromPicker value={null} onChange={noop} disabled encrypted={false} loadSteps={steps} />)
    expect(document.querySelector<HTMLInputElement>('[data-switch-from] input')?.disabled).toBe(true)
    await unmount()
  })
})

describe('exportSteps', () => {
  it('takes the Export from section of a guide', () => {
    const html = '<h1 id="x">X</h1><p>intro</p><h2 id="export-from-x">Export from X<a class="anchor" href="#export-from-x">#</a></h2>\n<ol><li>a</li></ol>\n<h2 id="import-into-opentodo">Import</h2><p>no</p>'
    expect(exportSteps(html)).toBe('<ol><li>a</li></ol>')
    expect(exportSteps('<h2 id="other">x</h2>')).toBe('')
  })
})

describe('ImportView with a chosen format that does not fit', () => {
  it('names the detected format and offers to read the file that way', async () => {
    const onFormat = vi.fn()
    const props: ImportViewProps = {
      offline: false, fileName: 'backup.zip', format: 'notion-csv', options: { ...DEFAULT_OPTIONS, targetProject: '' },
      projects: [], workspaces: [], workspace: '', onWorkspace: noop, zones: [], busy: false, error: null, job: null, jobs: [],
      preview: { format: 'notion-csv', detected: 'todoist-backup', options: {}, truncated: false, rows: [],
        totals: { rows: 0, create: 0, update: 0, skip: 0, error: 0, possibleDuplicates: 0, warnings: 0, newProjects: 0, newLabels: 0, entities: 0, written: 0, ops: 0 } },
      onPickFile: noop, onFormat, onOption: noop, onPreview: noop, switchFrom: 'notion', onSwitchFrom: noop, encrypted: false, onColumn: noop, onStart: noop, onUndo: noop,
    }
    const { unmount } = await render(<ImportView {...props} />)
    const note = document.querySelector('[data-import-detected]')!
    expect(note.textContent).toContain('Todoist backup (ZIP)')
    await click(note.querySelector('button')!)
    expect(onFormat).toHaveBeenCalledWith('todoist-backup')
    await unmount()
  })
})
