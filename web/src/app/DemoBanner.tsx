// The demo banner (OpenSpec changes demo-mode, demo-sandboxes and lean-chrome D2): one
// line above the shell at every width, "Demo: private sandbox, deleted after {idle} h
// of inactivity. Don't store anything personal." with the idle lifetime from the
// device's demo record (the server's status, remembered offline). Below 640 px the
// second sentence is left to Details and the rest is cut with an ellipsis, never
// wrapped. Learn more opens the guide's demo section in the Help panel over the
// current screen; Details shows the full text (a tooltip with a fine pointer, a
// dialog on touch, or on activation); Dismiss hides it for this browser session on
// this device. While the sandbox's write budget is used up, the write-limit notice
// takes the line's place, dismissed or not.
import { useState } from 'react'
import { demoBannerLead, demoDetailsText, DEMO_NOTHING_PERSONAL, dismissBanner, useBannerDismissed, useDemo } from '../lib/demo'
import { openHelp } from '../lib/helpRequest'
import { t } from '../lib/i18n'
import { Dialog, IconButton, Tooltip, useFinePointer } from '../ui'

export function DemoBanner({ notice }: { notice?: string }) {
  const info = useDemo()
  const dismissed = useBannerDismissed()
  const fine = useFinePointer()
  const [details, setDetails] = useState(false)
  if (dismissed && !notice) return null
  const full = notice ?? demoDetailsText(info)
  const detailsButton = (
    <IconButton size="sm" icon="circle-help" label={t('Details')} tooltip={false} className="shrink-0" onClick={() => setDetails(true)} data-demo-details />
  )
  return (
    <div role="status" data-testid="demo-banner" data-demo-limited={notice ? '' : undefined}
      className={`flex min-h-0 items-center gap-1 whitespace-nowrap border-b py-0.5 pl-3 pr-1 text-meta sm:pl-4 sm:text-body ${notice ? 'border-warning bg-warning-soft text-on-warning-soft' : 'border-info bg-info-soft text-on-info-soft'}`}>
      {notice ? (
        <p className="min-w-0 flex-1 truncate font-medium" data-testid="demo-limit">{notice}</p>
      ) : (
        <>
          <p className="min-w-0 flex-1 truncate" data-demo-line>
            {demoBannerLead(info)}<span className="hidden sm:inline"> {t(DEMO_NOTHING_PERSONAL)}</span>
          </p>
          <button type="button" className="shrink-0 px-1 font-medium underline" data-demo-learn-more
            onClick={(e) => openHelp('demo', e.currentTarget)}>{t('Learn more')}</button>
        </>
      )}
      {fine ? <Tooltip label={full}>{detailsButton}</Tooltip> : detailsButton}
      {!notice && <IconButton size="sm" icon="x" label={t('Dismiss')} className="shrink-0" onClick={dismissBanner} data-demo-dismiss />}
      {details && (
        <Dialog title={t('About this demo')} onClose={() => setDetails(false)} testId="demo-details">
          <p className="whitespace-normal text-body">{full}</p>
        </Dialog>
      )}
    </div>
  )
}
