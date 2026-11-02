// The host for confirmations asked from code with no menu of its own (the
// keyboard's Delete on a big selection): renders the spec when set, like a menu's
// confirm step does. Mounted once by the Shell.
import { Confirmation } from '../menus/ActionMenu'
import { clearBulkConfirm, useBulkConfirm } from './BulkActions'

export function BulkConfirmHost() {
  const spec = useBulkConfirm()
  if (!spec) return null
  return <Confirmation spec={spec} onClose={clearBulkConfirm} />
}
