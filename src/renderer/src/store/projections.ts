import { create } from 'zustand'
import type { Horizon, Projection } from '../../../shared/projection'

type ProjectionsStore = {
  data: Projection | null
  /** Error of the last failed load */
  error: unknown
  load: (months: Horizon) => Promise<void>
}

// Answers can arrive out of order when the horizon changes quickly; only the latest counts
let requestSeq = 0

export const useProjectionsStore = create<ProjectionsStore>()(set => ({
  data: null,
  error: null,
  load: async months => {
    const seq = ++requestSeq
    try {
      const data = await window.api.getProjection(months)
      if (seq === requestSeq) set({ data, error: null })
    } catch (error) {
      if (seq === requestSeq) set({ error })
    }
  },
}))
