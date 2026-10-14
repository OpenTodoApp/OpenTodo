// Settings → Projects → Archived projects (unarchive-projects), rendered to static markup.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ArchivedProject } from '../lib/archive'
import type { Project } from '../lib/types'
import { ArchivedProjectsList } from './ArchivedProjects'

const project = (id: string, name: string): Project =>
  ({ id, name, color: '#16a34a', position: 0, archived: true, parent_id: null, created_at: 0, deleted_at: null, _clock: {} })

const row = (over: Partial<ArchivedProject> & { project: Project }): ArchivedProject => ({ parentName: null, open: 0, canRestore: true, ...over })

describe('ArchivedProjectsList', () => {
  it('shows an empty state', () => {
    const html = renderToStaticMarkup(<ArchivedProjectsList rows={[]} onRestore={() => {}} />)
    expect(html).toContain('id="archived-projects"')
    expect(html).toContain('No archived projects')
    expect(html).not.toContain('<button')
  })

  it('lists projects with a named Restore button, parent and open count', () => {
    const html = renderToStaticMarkup(<ArchivedProjectsList onRestore={() => {}} rows={[
      row({ project: project('g', 'Garden'), parentName: 'Home', open: 2 }),
      row({ project: project('t', 'Trip 2026'), open: 1 }),
    ]} />)
    expect(html).toContain('<ul')
    expect(html).toContain('aria-label="Restore Garden"')
    expect(html).toContain('aria-label="Restore Trip 2026"')
    expect(html).toContain('In Home · 2 open tasks')
    expect(html).toContain('1 open task<')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('disables Restore when the role cannot archive', () => {
    const html = renderToStaticMarkup(<ArchivedProjectsList onRestore={() => {}} rows={[row({ project: project('c', 'Club'), canRestore: false })]} />)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Restore<\/button>/)
    expect(html).toContain('Only the owner or an admin can restore it')
  })
})
