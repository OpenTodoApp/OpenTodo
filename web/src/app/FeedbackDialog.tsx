// "Something isn't working" (OpenSpec `feedback-door`, design D1–D3): one text box, two doors. The
// box starts with the person's words, then a context block they can edit or delete. Nothing is
// fetched: a door opens a new GitHub issue or a mail message, and the person sends it there. Loaded
// lazily by FeedbackHost, so the first load does not carry it.
import { useRef, useState } from 'react'
import { Button, Dialog, Field, Textarea } from '../ui'
import { currentLanguage, t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { useServerVersion } from '../lib/serverVersion'
import { browserName, FEEDBACK_EMAIL, fitDoor, githubUrl, mailtoUrl, startingText, titleFor } from '../lib/feedback'
import { closeFeedback } from '../lib/feedbackRequest'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function FeedbackDialog() {
  const online = useOnline()
  const version = useServerVersion()
  const ref = useRef<HTMLTextAreaElement>(null)
  // The context is read once, when the box opens, so what the person edits does not change under them.
  const [text, setText] = useState(() => startingText({
    version,
    page: location.pathname,
    browser: browserName(navigator.userAgent),
    language: currentLanguage(),
    offline: !online,
  }))
  const [notice, setNotice] = useState<string | null>(null)
  const title = titleFor(text)

  // The door opens in a new tab with no opener; a link too long for the browser opens without the body, and the text is copied (D3).
  const open = async (build: (body: string | null) => string) => {
    const { url, bodyOmitted } = fitDoor(build, text)
    if (bodyOmitted) {
      if (await copyText(text)) {
        setNotice(t('The text is too long for a link. It is copied: paste it into the message.'))
      } else {
        ref.current?.select()
        setNotice(t('The text is too long for a link. It is selected: copy it and paste it into the message.'))
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog title={t("Something isn't working")} onClose={closeFeedback} size="md" testId="feedback-dialog">
      <div className="space-y-4">
        <p className="text-body text-default">{t('Tell us what went wrong. A hello is welcome too.')}</p>
        <Field label={t('Your message')} hideLabel>
          <Textarea ref={ref} rows={9} data-autofocus data-feedback-text value={text}
            onChange={(e) => { setText(e.target.value); setNotice(null) }} />
        </Field>
        {notice && <p role="status" className="text-meta text-muted" data-feedback-notice>{notice}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={closeFeedback}>{t('Cancel')}</Button>
          {FEEDBACK_EMAIL && (
            <Button variant="secondary" icon="mail" onClick={() => open((body) => mailtoUrl(FEEDBACK_EMAIL, title, body))} data-feedback-email>
              {t('Send by email')}
            </Button>
          )}
          <Button variant="primary" icon="messages-square" onClick={() => open((body) => githubUrl(title, body))} data-feedback-github>
            {t('Open on GitHub')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
