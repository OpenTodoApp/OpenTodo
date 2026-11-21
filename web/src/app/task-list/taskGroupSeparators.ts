/** A section's task groups can span rendering blocks. Mark their starts in list order. */
export function mapTaskGroups<T, R>(rows: readonly T[], startsGroup: (row: T) => boolean, render: (row: T, separator: boolean) => R): R[] {
  let seenGroup = false
  return rows.map((row) => {
    const starts = startsGroup(row)
    const rendered = render(row, starts && seenGroup)
    if (starts && rendered != null) seenGroup = true
    return rendered
  })
}
