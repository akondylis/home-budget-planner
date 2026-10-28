import { useEffect, useRef, useState } from 'react'
import { isModalOpen } from '../components/ui/Modal'
import { EMPTY_NAV_HISTORY, canStep, record, sameEntry, step, type NavDir, type NavEntry } from '../lib/nav-history'

export interface NavHistoryControls {
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
}

/**
 * Back/forward through the places the user has been. Records by watching `current`
 * (null while there is nothing to record, e.g. onboarding), so no navigation call
 * has to remember to push; `restore` shows an entry again.
 */
export function useNavHistory(
  current: NavEntry | null,
  isValid: (entry: NavEntry) => boolean,
  restore: (entry: NavEntry) => void,
): NavHistoryControls {
  const historyRef = useRef(EMPTY_NAV_HISTORY)
  // The entry Back/Forward is moving to; its arrival is not a new visit
  const restoringRef = useRef<NavEntry | null>(null)
  // Bumped on every change so the buttons re-render their enabled state
  const [, setVersion] = useState(0)
  const currentKey = current ? JSON.stringify(current) : null

  useEffect(() => {
    if (!current) return
    const restoring = restoringRef.current
    restoringRef.current = null
    if (restoring && sameEntry(restoring, current)) return
    historyRef.current = record(historyRef.current, current)
    setVersion(v => v + 1)
    // currentKey stands in for `current`, which is a new object every render
  }, [currentKey])

  function go(dir: NavDir) {
    if (!current || isModalOpen()) return
    const next = step(historyRef.current, dir, isValid)
    if (!next) return
    historyRef.current = next.history
    restoringRef.current = sameEntry(next.entry, current) ? null : next.entry
    restore(next.entry)
    setVersion(v => v + 1)
  }

  const active = current !== null
  return {
    back: () => go(-1),
    forward: () => go(1),
    canBack: active && canStep(historyRef.current, -1, isValid),
    canForward: active && canStep(historyRef.current, 1, isValid),
  }
}
