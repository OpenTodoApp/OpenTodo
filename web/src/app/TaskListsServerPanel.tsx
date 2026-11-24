// Settings → Server → Task lists (OpenSpec change click-default, design D2): what a
// click on a task does for accounts that have not chosen. The value comes from
// auth/status; a change needs a connection, like every server setting.
import { api } from '../lib/api'
import { ROW_CLICK_LABEL, ROW_CLICK_MODES, setServerRowClick, useServerRowClick, type RowClickMode } from '../lib/rowClickPref'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { Select, SettingRow, SettingsSection } from '../ui'
import { act } from './actionError'

export function TaskListsServerPanel() {
  const value = useServerRowClick()
  const save = (next: RowClickMode) => act(api.putRowClickDefault(next).then((r) => setServerRowClick(r.default)))
  return (
    <SettingsSection {...cardCopy('task-lists-server')} id="task-lists">
      <SettingRow {...rowCopy('task-lists-server', 'click')} htmlFor="row-click-default-select" control={
        <Select id="row-click-default-select" className="sm:w-64" value={value} onChange={(e) => save(e.target.value as RowClickMode)}>
          {ROW_CLICK_MODES.map((m) => <option key={m} value={m}>{ROW_CLICK_LABEL[m]}</option>)}
        </Select>
      } />
    </SettingsSection>
  )
}
