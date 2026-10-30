import { create } from 'zustand'
import { todayDateOnly } from '../../../shared/date-only'
import {
  presetRange,
  type BalanceReport,
  type CategoryDirection,
  type CategoryLevel,
  type CategoryReport,
  type CompareMode,
  type DateRange,
  type MemberReport,
  type PeriodPreset,
  type TrendReport,
} from '../../../shared/reports'

export const REPORT_TABS = ['category', 'trend', 'member', 'balance'] as const
export type ReportTab = (typeof REPORT_TABS)[number]

export type ReportData =
  | { tab: 'category'; report: CategoryReport }
  | { tab: 'trend'; report: TrendReport }
  | { tab: 'member'; report: MemberReport }
  | { tab: 'balance'; report: BalanceReport }

type ReportsStore = {
  // Per session: the period, tab and toggles stay while the app is open
  preset: PeriodPreset
  /** The custom from–to; kept when switching to a preset and back */
  custom: DateRange
  compare: CompareMode
  tab: ReportTab
  direction: CategoryDirection
  level: CategoryLevel
  data: ReportData | null
  error: unknown
  setPreset: (preset: PeriodPreset) => void
  setCustom: (range: DateRange) => void
  setCompare: (compare: CompareMode) => void
  setTab: (tab: ReportTab) => void
  setDirection: (direction: CategoryDirection) => void
  setLevel: (level: CategoryLevel) => void
  load: () => Promise<void>
}

/** The days the period bar stands for now */
export function activeRange(s: Pick<ReportsStore, 'preset' | 'custom'>, today = todayDateOnly()): DateRange {
  return s.preset === 'CUSTOM' ? s.custom : presetRange(s.preset, today)
}

// Answers can arrive out of order when the period changes quickly; only the latest counts
let requestSeq = 0

export const useReportsStore = create<ReportsStore>()((set, get) => ({
  preset: 'THIS_YEAR',
  custom: presetRange('THIS_MONTH', todayDateOnly()),
  compare: 'LAST_YEAR',
  tab: 'category',
  direction: 'OUT',
  level: 'CATEGORY',
  data: null,
  error: null,
  setPreset: preset => { set({ preset }); void get().load() },
  setCustom: custom => { set({ custom }); void get().load() },
  setCompare: compare => { set({ compare }); void get().load() },
  setTab: tab => { set({ tab }); void get().load() },
  setDirection: direction => { set({ direction }); void get().load() },
  setLevel: level => { set({ level }); void get().load() },
  load: async () => {
    const seq = ++requestSeq
    const s = get()
    const range = activeRange(s)
    try {
      let data: ReportData
      switch (s.tab) {
        case 'category':
          data = { tab: 'category', report: await window.api.reportCategories({ range, compare: s.compare, direction: s.direction, level: s.level }) }
          break
        case 'trend':
          data = { tab: 'trend', report: await window.api.reportTrend({ range }) }
          break
        case 'member':
          data = { tab: 'member', report: await window.api.reportMembers({ range, compare: s.compare }) }
          break
        case 'balance':
          data = { tab: 'balance', report: await window.api.reportBalances({ range }) }
          break
      }
      if (seq === requestSeq) set({ data, error: null })
    } catch (error) {
      if (seq === requestSeq) set({ error })
    }
  },
}))
