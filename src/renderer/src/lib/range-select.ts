/** Keys from anchor to target (inclusive, in list order); null when the anchor is not in the list */
export function rangeKeys<K>(order: readonly K[], anchor: K | null, target: K): K[] | null {
  if (anchor === null) return null
  const from = order.indexOf(anchor)
  const to = order.indexOf(target)
  if (from < 0 || to < 0) return null
  return order.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/** Shift+click must not highlight the text between the two clicks */
export function keepTextUnselected(e: { shiftKey: boolean; preventDefault: () => void }) {
  if (e.shiftKey) e.preventDefault()
}
