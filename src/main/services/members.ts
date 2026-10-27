import { z } from 'zod'
import { prisma } from '../db/prisma'
import { normalise } from '../../shared/search-normalise'
import { MEMBER_COLOURS, type MemberColour, type MemberSummary } from '../../shared/members'

const memberInput = z.object({
  name: z.string().trim().min(1).max(40),
  colour: z.enum(MEMBER_COLOURS),
})

/** Throws: 'INVALID_INPUT' */
function parseMemberInput(input: unknown) {
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

/** Another active member already has this name (ignoring case and accents). Throws: 'MEMBER_NAME_TAKEN' */
async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const active = await prisma.member.findMany({ where: { archivedAt: null }, select: { id: true, name: true } })
  const key = normalise(name)
  if (active.some(m => m.id !== exceptId && normalise(m.name) === key)) throw new Error('MEMBER_NAME_TAKEN')
}

/**
 * A member id given with a row. An archived member may still be the one who
 * entered it (allowArchived), but not the one it is for.
 * Throws: 'MEMBER_NOT_FOUND'
 */
export async function assertMember(id: string, opts: { allowArchived?: boolean } = {}): Promise<void> {
  const member = await prisma.member.findUnique({ where: { id }, select: { archivedAt: true } })
  if (!member || (member.archivedAt && !opts.allowArchived)) throw new Error('MEMBER_NOT_FOUND')
}

/** Active members by sort order (archived ones too when asked), each with its row and account counts */
export async function listMembers(opts: { includeArchived?: boolean } = {}): Promise<MemberSummary[]> {
  const [members, counts, held] = await Promise.all([
    prisma.member.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.transaction.groupBy({ by: ['memberId'], where: { memberId: { not: null } }, _count: { _all: true } }),
    prisma.account.groupBy({ by: ['holderMemberId'], where: { holderMemberId: { not: null }, archivedAt: null }, _count: { _all: true } }),
  ])
  const countBy = new Map(counts.map(c => [c.memberId, c._count._all]))
  const heldBy = new Map(held.map(h => [h.holderMemberId, h._count._all]))
  return members.map(m => ({
    id: m.id,
    name: m.name,
    colour: m.colour as MemberColour,
    archived: m.archivedAt !== null,
    transactionCount: countBy.get(m.id) ?? 0,
    accountCount: heldBy.get(m.id) ?? 0,
  }))
}

/** Throws: 'INVALID_INPUT', 'MEMBER_NAME_TAKEN' */
export async function createMember(input: unknown): Promise<string> {
  const data = parseMemberInput(input)
  await assertNameFree(data.name)
  const last = await prisma.member.aggregate({ _max: { sortOrder: true } })
  const member = await prisma.member.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  return member.id
}

/** Throws: 'INVALID_INPUT', 'MEMBER_NOT_FOUND', 'MEMBER_NAME_TAKEN' */
export async function updateMember(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = parseMemberInput(input)
  const found = await prisma.member.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('MEMBER_NOT_FOUND')
  await assertNameFree(data.name, id)
  await prisma.member.update({ where: { id }, data })
}

/**
 * Hides the member from pickers; rows keep their name. Restoring checks the name is still free.
 * Throws: 'MEMBER_NOT_FOUND', 'MEMBER_NAME_TAKEN'
 */
export async function archiveMember(id: unknown, archived = true): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.member.findUnique({ where: { id }, select: { name: true } })
  if (!found) throw new Error('MEMBER_NOT_FOUND')
  if (!archived) await assertNameFree(found.name, id)
  await prisma.member.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
}
