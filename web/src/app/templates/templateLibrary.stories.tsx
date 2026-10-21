import type { Meta, StoryObj } from '@storybook/react-vite'
import library from '../../generated/templates.json'
import type { Library } from '../../lib/templateLibrary'
import { seedInbox, withClock, withSeed } from '../stories/fixtures'
import { LibraryDetail, LibraryList } from './TemplateLibrary'

// The template library inside "From a template…" (OpenSpec change template-library, design
// D8): the cards by category with the search first, and a template's detail with its
// preview before anything is created.
const meta: Meta = { title: 'Screens/Template library' }
export default meta

const templates = (library as Library).templates
const frame = (children: React.ReactNode) => <div className="max-w-lg p-4">{children}</div>
/** The detail scrolls inside the dialog, with Create kept in view at the bottom; this frame is that scroller. */
const scroller = (children: React.ReactNode) => <div className="h-dvh max-w-lg overflow-y-auto bg-surface px-4 pt-4">{children}</div>
const noop = () => {}

/** Every template of the release, grouped by category. */
export const Library_: StoryObj = { name: 'Library', decorators: [withClock], render: () => frame(<LibraryList templates={templates} query="" onQuery={noop} onOpen={noop} onUpload={noop} />) }

/** "pack" matches the tasks and labels of two templates. */
export const Search: StoryObj = { decorators: [withClock], render: () => frame(<LibraryList templates={templates} query="pack" onQuery={noop} onOpen={noop} onUpload={noop} />) }

/** Nothing matches: the way out is a file. */
export const NoMatch: StoryObj = { decorators: [withClock], render: () => frame(<LibraryList templates={templates} query="xylophone" onQuery={noop} onOpen={noop} onUpload={noop} />) }

/** Trip planning: description, steps, the preview with offsets, start day and parent. */
export const Detail: StoryObj = {
  ...withSeed(seedInbox),
  render: () => scroller(
    <LibraryDetail tpl={templates.find((x) => x.slug === 'trip-planning')!} projects={[]} startDay="2026-10-14" onStartDay={noop} parentId={null} onParent={noop}
      busy={false} onBack={noop} onCreate={noop} />,
  ),
}

/** A board template with four sections and subtasks. */
export const DetailBoard: StoryObj = {
  ...withSeed(seedInbox),
  render: () => scroller(
    <LibraryDetail tpl={templates.find((x) => x.slug === 'moving-house')!} projects={[]} startDay="2026-10-14" onStartDay={noop} parentId={null} onParent={noop}
      busy={false} onBack={noop} onCreate={noop} />,
  ),
}
