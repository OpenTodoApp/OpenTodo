// The enrolment QR code (OpenSpec `mfa-totp`, design D9), drawn as SVG from the
// provisioning URI entirely in the browser so the secret never leaves the device
// in an image request. It is its own module so the encoder (qrcode-generator,
// about 11 KB gzip) loads only when the enrolment wizard opens: the shell imports
// TwoFactorPanel for the enrolment gate, and the wizard renders this lazily.
import { useMemo } from 'react'
import { qrMatrix, qrPath } from '../lib/qr'
import { t } from '../lib/i18n'

export function QrCode({ text, size = 192 }: { text: string; size?: number }) {
  const { n, d } = useMemo(() => {
    const m = qrMatrix(text)
    return { n: m.length, d: qrPath(m) }
  }, [text])
  const quiet = 4
  return (
    <svg
      role="img" aria-label={t('QR code to scan with your authenticator app')} width={size} height={size}
      viewBox={`${-quiet} ${-quiet} ${n + 2 * quiet} ${n + 2 * quiet}`} shapeRendering="crispEdges" className="rounded-control"
    >
      {/* A QR code stays black on white in every theme so authenticator apps can scan it. */}
      <rect x={-quiet} y={-quiet} width={n + 2 * quiet} height={n + 2 * quiet} fill="#fff" /> {/* token-lint-allow */}
      <path d={d} fill="#000" /> {/* token-lint-allow */}
    </svg>
  )
}
