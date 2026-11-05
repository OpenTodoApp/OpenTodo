// The enrolment QR, loaded on first use (mfa-enrolment-qr): qrcode-generator is
// about 11 KB gzip of encoder that one wizard screen needs, so it stays out of the
// first load. Screens render it inside Suspense.
import { lazy } from 'react'

export type { QrCodeProps } from './QrCode'
export const LazyQrCode = lazy(() => import('./QrCode').then((m) => ({ default: m.QrCode })))
