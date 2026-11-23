// A Cache Storage stand-in for the service worker tests: one key-value map per cache
// name, shared by every worker a test starts, as the browser shares it between workers.
const POLICY = 'opentodo-policy'
const ON = '/__refuse-on'
const MODE = '/__refuse'

export function workerCaches() {
  const stores = new Map<string, Map<string, string>>()
  let fails = false
  const failingPuts = new Set<string>()
  const store = (name: string) => {
    let s = stores.get(name)
    if (!s) stores.set(name, (s = new Map()))
    return s
  }
  return {
    caches: {
      open: async (name: string) => {
        if (fails) throw new Error('caches')
        const s = store(name)
        return {
          match: async (key: string) => { const v = s.get(String(key)); return v === undefined ? undefined : new Response(v) },
          put: async (key: string, r: Response) => {
            if (failingPuts.has(String(key))) throw new Error('quota')
            s.set(String(key), await r.text())
          },
        }
      },
    },
    /** Every open fails from now on (or works again). */
    fail(on: boolean) { fails = on },
    /** The remembered mode as stored: '1' once refusal was remembered, else what the report-only key holds. */
    mode(): string | null { const s = store(POLICY); return s.has(ON) ? '1' : (s.get(MODE) ?? null) },
    /** Sets the stored mode as another worker, or a corrupt write, would have left it. */
    setMode(v: string | null) {
      const s = store(POLICY)
      s.delete(ON); s.delete(MODE)
      if (v === '1') s.set(ON, '1')
      else if (v !== null) s.set(MODE, v)
    },
    /** Writes of this key fail from now on, as a full storage would refuse them. */
    failPut(key: string) { failingPuts.add(key) },
    /** Removes one key of the policy cache, as an eviction or a cleanup might. */
    drop(key: string) { store(POLICY).delete(key) },
    reset() { stores.clear(); fails = false; failingPuts.clear() },
  }
}
