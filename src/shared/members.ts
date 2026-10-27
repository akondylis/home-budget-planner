// Members: the parents of the household (children are not tracked). Shared by
// main (services) and the renderer (window.api types).

/** Palette keys a member can wear; the renderer maps each to theme classes */
export const MEMBER_COLOURS = ['blue', 'purple', 'orange', 'green', 'amber'] as const
export type MemberColour = (typeof MEMBER_COLOURS)[number]

/** Log filter value for rows that belong to no one parent */
export const HOUSEHOLD = 'household'

export interface MemberSummary {
  id: string
  name: string
  colour: MemberColour
  archived: boolean
  /** Rows marked as for this member */
  transactionCount: number
  /** Active accounts this member holds */
  accountCount: number
}

export interface MemberInput {
  name: string
  colour: MemberColour
}

/** The first colour no active member wears yet (the first one when all are taken) */
export function nextFreeColour(members: Pick<MemberSummary, 'colour' | 'archived'>[]): MemberColour {
  const used = new Set(members.filter(m => !m.archived).map(m => m.colour))
  return MEMBER_COLOURS.find(c => !used.has(c)) ?? MEMBER_COLOURS[0]
}
