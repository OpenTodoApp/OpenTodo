// A "?" after a field's label (OpenSpec change habits-polish, design D4): a short
// explanation in the Tooltip on hover and on keyboard focus, which is also the
// button's accessible name. A tap (where the Tooltip does not open) shows the
// text under the label instead.
import { useState } from 'react'
import { IconButton } from './Button'
import { coarsePointer } from './Tooltip'

export function FieldHint({ text }: { text: string }) {
  const [shown, setShown] = useState(false)
  return (
    <>
      <IconButton icon="circle-help" label={text} size="sm" className="-my-1 text-faint" data-field-hint
        onClick={() => { if (coarsePointer()) setShown((v) => !v) }} />
      {shown && <span className="basis-full text-meta text-muted" data-field-hint-text>{text}</span>}
    </>
  )
}
