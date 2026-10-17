// Grouping helpers (OpenSpec change large-list-performance): append to the group's
// array in place, so grouping n items is linear. Copying the group on every insert
// (`[...(m.get(k) ?? []), item]`) is quadratic in the size of the largest group.

/** Add `item` to the list under `key`, creating the list on first use. */
export function appendTo<K, V>(map: Map<K, V[]>, key: K, item: V): void {
  const list = map.get(key)
  if (list) list.push(item)
  else map.set(key, [item])
}

/** Items bucketed by `keyOf`, each bucket in input order; buckets in first-seen order. */
export function groupBy<K, V>(items: Iterable<V>, keyOf: (item: V) => K): Map<K, V[]> {
  const out = new Map<K, V[]>()
  for (const item of items) appendTo(out, keyOf(item), item)
  return out
}
