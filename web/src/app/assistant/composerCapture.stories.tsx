import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import type { PreparedPhoto } from '../../lib/assistantImages'
import { MESSAGES } from '../../lib/voice/dictation'
import { ComposerFrame, Icon } from '../../ui'
import { Composer } from './AssistantComposer'
import { CaptureStrip, MicButton } from './ComposerCapture'

// The assistant composer while capturing (OpenSpec change voice-ramble): listening to
// a ramble, a speech-service piece that failed, and photos above the field at phone
// (360 px) and desktop width. Rendered without a server or a microphone.
const meta: Meta = { title: 'Screens/Assistant capture' }
export default meta

const noop = () => {}
const skills = [{ id: 'capture', name: 'Turn this into tasks', description: 'Speak, paste or photograph a list; get the tasks to review.', example: 'Turn this into tasks', result: 'changes' as const }]
const skill = skills[0]

/** A small "photo": a whiteboard drawn as an SVG data URL. */
const board = (hue: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="#f4f4f5"/><rect x="12" y="20" width="70" height="6" fill="${hue}"/><rect x="12" y="40" width="56" height="6" fill="${hue}"/><rect x="12" y="60" width="80" height="6" fill="${hue}"/></svg>`)}`
const photo = (id: string, hue: string): PreparedPhoto => ({ id, mediaType: 'image/jpeg', data: '', bytes: 1, width: 1568, height: 1176, preview: board(hue) })
const photos = [photo('a', '#2563eb'), photo('b', '#16a34a'), photo('c', '#dc2626')]

function Width({ px, children }: { px?: number; children: ReactNode }) {
  return <div className="bg-surface p-3" style={px ? { width: px, maxWidth: '100%' } : { width: '100%', maxWidth: '28rem' }}>{children}</div>
}

/** The tray as it is while listening: Skills, the pressed microphone and Add photo. */
function Listening({ message }: { message: string | null }) {
  return (
    <ComposerFrame data-assistant-frame
      above={<CaptureStrip listening={!message} elapsedMs={84_000} onStop={noop} message={message} onDismissMessage={noop} note={null} photos={[]} onRemove={noop} error={null} />}
      tools={<>
        <span className="ui-btn ui-btn--secondary ui-btn--sm touch-target gap-1 px-2 text-meta"><Icon name="sparkles" size="sm" /><span>Skills</span></span>
        <MicButton listening={!message} onToggle={noop} />
        <span className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2" aria-hidden="true"><Icon name="image" size="sm" /></span>
      </>}
      send={{ label: 'Send', onSend: noop, disabled: false, shortcut: 'Enter' }}>
      <label className="block">
        <span className="sr-only">Message to the assistant</span>
        <textarea className="ui-input max-h-40 min-h-11 resize-none" rows={2} readOnly
          value="buy printer paper, call Marta about the invoice on Friday, and the garden project needs a quote from the roofer, high priority" />
      </label>
    </ComposerFrame>
  )
}

/** Listening: the transcript in the field, "Listening 1:24 / 5:00" with Stop. */
export const ListeningToARamble: StoryObj = { render: () => <Width><Listening message={null} /></Width> }

/** The third piece failed at the speech service: the text so far stays, listening stopped. */
export const FailedPiece: StoryObj = { render: () => <Width><Listening message={MESSAGES.service} /></Width> }

const withPhotos = (n: number) => (
  <Composer draft="" onDraft={noop} onSend={noop} onStop={noop} streaming={false} connected disabled={false} skills={skills} skill={skill} onSkill={noop}
    photos={photos.slice(0, n)} onPhotos={noop} photoProvider="Google Gemini" voice />
)

/** Three photos of notes above the field on a phone (360 px). */
export const PhotosPhone: StoryObj = { render: () => <Width px={360}>{withPhotos(3)}</Width> }

/** The same at desktop width. */
export const PhotosDesktop: StoryObj = { render: () => <div className="w-full max-w-[46rem] bg-surface p-3">{withPhotos(3)}</div> }

/** The first photo on this device waits for the note naming the provider. */
export const FirstPhotoNote: StoryObj = {
  render: () => (
    <Width px={360}>
      <ComposerFrame data-assistant-frame send={{ label: 'Send', onSend: noop, disabled: true, shortcut: 'Enter' }}
        above={<CaptureStrip listening={false} elapsedMs={0} onStop={noop} message={null} onDismissMessage={noop} photos={[]} onRemove={noop} error={null}
          note={{ provider: 'Google Gemini', onContinue: noop, onCancel: noop }} />}>
        <label className="block"><span className="sr-only">Message to the assistant</span><textarea className="ui-input min-h-11 resize-none" rows={1} readOnly value="" /></label>
      </ComposerFrame>
    </Width>
  ),
}
