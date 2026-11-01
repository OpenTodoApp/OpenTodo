// The theme editor's worker (theme-editor D8): derives drafts and finds fixes off
// the main thread. One request in, one answer out, tagged with the request's number.
import { compute, type ComputeRequest } from './compute'

self.onmessage = (e: MessageEvent<{ seq: number; req: ComputeRequest }>) => {
  const { seq, req } = e.data
  try {
    self.postMessage({ seq, result: compute(req) })
  } catch (err) {
    self.postMessage({ seq, error: String(err) })
  }
}
