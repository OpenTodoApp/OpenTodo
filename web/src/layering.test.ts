// The web app's layers (OpenSpec change web-layering): src/ui never imports src/app,
// and screens read local data through src/lib, never IndexedDB. The rules live in
// eslint.config.js (run by `npm run lint` and `make check`); this test pins what
// they refuse and allow, so loosening one fails here too.
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname })

async function rules(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => m.ruleId ?? m.message)
}

describe('web layering', () => {
  it('refuses src/app imports inside src/ui', async () => {
    expect(await rules('src/ui/Fake.tsx', "import { Menu } from '../app/overlay'\nexport const x = Menu\n")).toEqual(['no-restricted-imports'])
    expect(await rules('src/ui/patterns/Fake.tsx', "import { openHelp } from '../../app/help/store'\nexport const x = openHelp\n")).toEqual(['no-restricted-imports'])
    expect(await rules('src/ui/Fake.tsx', "import { t } from '../lib/i18n'\nexport const x = t\n")).toEqual([])
  })

  it('refuses lib/db and the database object in screens', async () => {
    expect(await rules('src/app/Fake.tsx', "import { db } from '../lib/db'\nexport const x = db\n")).toEqual(['no-restricted-imports'])
    expect(await rules('src/app/sub/Fake.tsx', "import { getMeta } from '../../lib/db'\nexport const x = getMeta\n")).toEqual(['no-restricted-imports'])
    expect(await rules('src/app/Fake.tsx', 'declare const db: { tasks: unknown }\nexport const x = db.tasks\n')).toEqual(['no-restricted-syntax'])
  })

  it('allows the lifecycle calls and tests', async () => {
    expect(await rules('src/app/Fake.tsx', "import { clearLocalData } from '../lib/db'\nexport const x = clearLocalData\n")).toEqual([])
    expect(await rules('src/app/fake.test.tsx', "import { db } from '../lib/db'\nexport const x = db.tasks\n")).toEqual([])
  })

  it('has no exceptions left: the split screens are held to the rule too (web-component-structure)', async () => {
    for (const file of ['src/app/TaskListView.tsx', 'src/app/task-detail/Properties.tsx', 'src/app/CalendarView.tsx', 'src/app/assistant/AssistantPanel.tsx']) {
      expect(await rules(file, "import { db } from '../lib/db'\nexport const x = db.tasks\n")).toContain('no-restricted-imports')
    }
  })
})
