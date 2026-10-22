// The instance's mark and name (OpenSpec change instance-branding): the owner's
// logo and name when set, else the app's own mark and wordmark. Screens that
// showed the brand (sign-in, invitations, the sidebar rail, share capture) use
// these so a branded server reads as the owner's everywhere the app named itself.
import { BrandMark, type BrandSize, BrandWordmark } from '../ui'
import { instanceName, logoUrl, useBranding } from '../lib/branding'
import { t } from '../lib/i18n'

/** The logo at a size, or the app's mark. The rendered 32 px logo serves up to 32 px, the 192 px one above. */
export function InstanceMark({ size = 24, className }: { size?: BrandSize; className?: string }) {
  const b = useBranding()
  const src = logoUrl(size > 32 ? 192 : 32, b)
  if (!src) return <BrandMark size={size} className={className} />
  return <img src={src} width={size} height={size} alt="" aria-hidden className={`shrink-0 rounded-control${className ? ` ${className}` : ''}`} data-instance-logo />
}

/** The instance name as a wordmark, or the app's. */
export function InstanceWordmark({ className }: { className?: string }) {
  const b = useBranding()
  if (!b.name) return <BrandWordmark className={className} />
  return <span className={`font-semibold text-strong user-text${className ? ` ${className}` : ''}`} data-instance-name>{b.name}</span>
}

/** The instance name as text (for labels and tooltips). */
export function useInstanceName(): string {
  return instanceName(useBranding())
}

/** The sign-in footer: the licence line, with "Powered by OpenTodo" on a branded instance. */
export function PoweredBy({ version }: { version: string }) {
  const b = useBranding()
  const branded = !!b.name || b.logoVersion > 0
  return (
    <p className="mt-6 text-center text-meta text-faint" data-powered-by={branded || undefined}>
      {branded
        ? t('Powered by OpenTodo {version} · AGPL-3.0 · no tracking, no telemetry', { version })
        : t('OpenTodo {version} · AGPL-3.0 · no tracking, no telemetry', { version })}
    </p>
  )
}
