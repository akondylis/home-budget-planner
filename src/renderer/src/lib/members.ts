// Members in the renderer: who is using the app on this PC, and how a member's colour is drawn.

import type { MemberColour, MemberSummary } from '../../../shared/members'

/** Full class names, so Tailwind finds them; the 500 shade reads on surface in light and dark */
export const MEMBER_DOT_CLASS: Record<MemberColour, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
}

export const activeMembers = (members: MemberSummary[]) => members.filter(m => !m.archived)

/**
 * Who is using the app once members are known: the remembered one while still
 * active, else the only parent when there is just one, else nobody (the
 * sidebar then asks).
 */
export function resolveCurrentMember(members: MemberSummary[], currentId: string | null): string | null {
  const active = activeMembers(members)
  if (currentId && active.some(m => m.id === currentId)) return currentId
  return active.length === 1 ? active[0].id : null
}

/** The first letter of a name, for the collapsed sidebar */
export function initialOf(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? '?'
}
