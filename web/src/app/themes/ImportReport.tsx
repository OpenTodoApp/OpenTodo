// The VS Code import report (OpenSpec change theme-editor, design D12): before the
// editor opens, what was mapped (with its VS Code key), what was derived, the
// colours that fail contrast (Fix contrast now is preselected), the keys ignored,
// a file named by `include` that was not read, and the advice to check the
// theme's licence before sharing it.
import { useState } from 'react'
import { t } from '../../lib/i18n'
import type { ContrastFailure } from '../../lib/theme/check'
import type { VsCodeReport } from '../../lib/theme/vscode'
import { Button, Checkbox, Dialog, LazyContrastBadge as ContrastBadge, Notice } from '../../ui'
import { tokenName } from './tokenNames'

export interface ImportReportProps {
  report: VsCodeReport
  /** The failing pairs of the mapped theme; null while they are measured. */
  failures: readonly ContrastFailure[] | null
  onCancel: () => void
  onOpen: (fixContrast: boolean) => void | Promise<void>
}

const targetName = (target: string) => (target === 'bar' ? t('Browser bar') : tokenName(target))

export function ImportReport({ report, failures, onCancel, onOpen }: ImportReportProps) {
  const [fix, setFix] = useState(true)
  const failing = failures?.length ?? 0
  return (
    <Dialog title={t('Import {name}', { name: report.name })} onClose={onCancel} size="md" testId="vscode-report">
      <div className="flex flex-col gap-4" data-vscode-report>
        <p className="text-body text-default">
          {report.kind === 'dark' ? t('A dark theme.') : t('A light theme.')}{' '}
          {t('{mapped, plural, one {# colour was taken from the file} other {# colours were taken from the file}}; {derived, plural, one {# follows} other {# follow}} from them.', { mapped: report.mapped.length, derived: report.derived.length })}
        </p>
        {report.highContrast && <Notice>{t('This is a high-contrast theme. OpenTodo\'s own high-contrast setting, under Appearance, may suit you better.')}</Notice>}
        {report.include && <Notice tone="warning">{t('The file includes {file}, which was not read: the importer reads one file and never fetches another.', { file: report.include })}</Notice>}
        <section aria-labelledby="vscode-mapped" className="flex flex-col gap-1">
          <h3 id="vscode-mapped" className="text-meta font-semibold text-muted">{t('Taken from the file')}</h3>
          <ul className="flex max-h-56 flex-col overflow-y-auto rounded-card border border-default" data-vscode-mapped>
            {report.mapped.map((m) => (
              <li key={`${m.target}/${m.key}`} className="flex items-center gap-2 px-3 py-1.5 text-meta" data-vscode-target={m.target}>
                <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-chip border border-default" style={{ backgroundColor: m.value }} />
                <span className="min-w-0 flex-1 text-default">{targetName(m.target)}</span>
                <code className="truncate font-mono text-muted">{m.key}</code>
              </li>
            ))}
          </ul>
        </section>
        <details className="text-meta">
          <summary className="cursor-pointer text-muted">{t('{n, plural, one {# colour derived} other {# colours derived}}', { n: report.derived.length })}</summary>
          <p className="mt-1 text-default">{report.derived.map(tokenName).join(', ')}</p>
        </details>
        <section aria-labelledby="vscode-contrast" className="flex flex-col gap-1">
          <h3 id="vscode-contrast" className="text-meta font-semibold text-muted">{t('Contrast')}</h3>
          {failures === null ? <p className="text-meta text-muted" role="status">{t('Measuring…')}</p> : failing === 0
            ? <p className="text-meta text-muted">{t('Every pair reaches AA')}</p>
            : (
              <>
                <ul className="flex flex-col gap-0.5" data-vscode-failing>
                  {failures.slice(0, 8).map((f) => (
                    <li key={`${f.fg}/${f.bg}`} className="flex items-center gap-2 text-meta text-default">
                      <span className="min-w-0 flex-1">{t('{fg} on {bg}', { fg: tokenName(f.fg), bg: tokenName(f.bg) })}</span>
                      <ContrastBadge ratio={f.ratio} min={f.min} />
                    </li>
                  ))}
                  {failing > 8 && <li className="text-meta text-muted">{t('and {n} more', { n: failing - 8 })}</li>}
                </ul>
                <Checkbox label={t('Fix contrast now')} description={t('Keeps each colour\'s hue and moves only its lightness until the pair reads.')}
                  checked={fix} onChange={(e) => setFix(e.target.checked)} data-vscode-fix />
              </>
            )}
        </section>
        {report.ignored.length > 0 && (
          <details className="text-meta">
            <summary className="cursor-pointer text-muted">{t('{n, plural, one {# key ignored} other {# keys ignored}}', { n: report.ignored.length })}</summary>
            <p className="mt-1 break-words font-mono text-muted" data-vscode-ignored>{report.ignored.join(', ')}</p>
          </details>
        )}
        <p className="text-meta text-muted" role="note">{t('The licence is set to unknown. Check the theme\'s licence before you share this file.')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={() => onOpen(fix && failing > 0)} data-vscode-open>{t('Open in the editor')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
