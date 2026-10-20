// New board on Filters → Boards (OpenSpec change rule-boards, design D8): a choice
// between an empty board and the built-in board templates, each with one line,
// then the name. A template's filters and board are written in one batch.
import { useState } from 'react'
import { BOARD_TEMPLATES, type BoardTemplate } from '../lib/boardTemplates'
import { createBoardFromTemplate, createView } from '../lib/views'
import { Button, Dialog } from '../ui'
import { NamePrompt } from './NamePrompt'
import { t } from '../lib/i18n'

const EMPTY = 'empty'

export function NewBoardDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [choice, setChoice] = useState<string>(EMPTY)
  const [naming, setNaming] = useState<BoardTemplate | null | undefined>(undefined)
  if (naming !== undefined) {
    return (
      <NamePrompt title={naming ? t(naming.title) : t('New board')} label={t('Board name')} confirm={t('Create')} initial={naming ? t(naming.name) : ''}
        hint={naming ? t(naming.description) : t('Add up to six saved filters as panels.')}
        onCancel={onCancel}
        onSubmit={async (name) => onCreated(naming ? await createBoardFromTemplate(naming, name) : await createView({ name, kind: 'dashboard' }))} />
    )
  }
  const options = [
    { id: EMPTY, title: t('Empty board'), description: t('Add up to six saved filters as panels.') },
    ...BOARD_TEMPLATES.map((b) => ({ id: b.id, title: t(b.title), description: t(b.description) })),
  ]
  return (
    <Dialog title={t('New board')} onClose={onCancel} testId="new-board">
      <form onSubmit={(e) => { e.preventDefault(); setNaming(BOARD_TEMPLATES.find((b) => b.id === choice) ?? null) }}>
        <fieldset className="space-y-1">
          <legend className="sr-only">{t('Start from')}</legend>
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-control p-2 hover:bg-sunken dark:hover:bg-raised" data-board-choice={o.id}>
              <input type="radio" name="board-template" className="mt-1" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} />
              <span className="min-w-0">
                <span className="block text-body font-medium">{o.title}</span>
                <span className="block text-meta text-muted">{o.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary">{t('Next')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
