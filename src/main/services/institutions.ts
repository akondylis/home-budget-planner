import { z } from 'zod'
import { prisma } from '../db/prisma'
import { normalise } from '../../shared/search-normalise'
import { INSTITUTION_KINDS, institutionKindFor, type AccountKind, type InstitutionSummary } from '../../shared/ledger'

const institutionInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(INSTITUTION_KINDS),
})

/** Throws: 'INVALID_INPUT' */
function parseInstitutionInput(input: unknown) {
  const parsed = institutionInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  return parsed.data
}

/** Another bank, archived ones included, already has this name (ignoring case and accents). Throws: 'INSTITUTION_NAME_TAKEN' */
async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const all = await prisma.institution.findMany({ select: { id: true, name: true } })
  const key = normalise(name)
  if (all.some(i => i.id !== exceptId && normalise(i.name) === key)) throw new Error('INSTITUTION_NAME_TAKEN')
}

/**
 * The bank given with an account: it exists, fits the account's kind and is active,
 * unless it is the one already stored (an archived bank stays on its old accounts).
 * Throws: 'INSTITUTION_NOT_FOUND', 'INVALID_INPUT' (wrong kind)
 */
export async function assertInstitution(id: string | null, accountKind: AccountKind, storedId: string | null = null): Promise<void> {
  if (id === null) return
  const found = await prisma.institution.findUnique({ where: { id }, select: { kind: true, archivedAt: true } })
  if (!found || (found.archivedAt && id !== storedId)) throw new Error('INSTITUTION_NOT_FOUND')
  if (found.kind !== institutionKindFor(accountKind)) throw new Error('INVALID_INPUT')
}

/** Banks in the user's order (archived ones too when asked), each with its active account count */
export async function listInstitutions(opts: { includeArchived?: boolean } = {}): Promise<InstitutionSummary[]> {
  const [institutions, counts] = await Promise.all([
    prisma.institution.findMany({
      where: opts.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.account.groupBy({ by: ['institutionId'], where: { institutionId: { not: null }, archivedAt: null }, _count: { _all: true } }),
  ])
  const countBy = new Map(counts.map(c => [c.institutionId, c._count._all]))
  return institutions.map(i => ({
    id: i.id,
    name: i.name,
    kind: i.kind,
    statementPreset: i.statementPreset,
    archived: i.archivedAt !== null,
    accountCount: countBy.get(i.id) ?? 0,
  }))
}

/** Added at the end of the list. Throws: 'INVALID_INPUT', 'INSTITUTION_NAME_TAKEN' */
export async function createInstitution(input: unknown): Promise<string> {
  const data = parseInstitutionInput(input)
  await assertNameFree(data.name)
  const last = await prisma.institution.aggregate({ _max: { sortOrder: true } })
  const institution = await prisma.institution.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  return institution.id
}

/**
 * Renames it, or changes its kind while no account of the other kind uses it.
 * Throws: 'INVALID_INPUT', 'INSTITUTION_NOT_FOUND', 'INSTITUTION_NAME_TAKEN', 'INSTITUTION_IN_USE'
 */
export async function updateInstitution(id: unknown, input: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const data = parseInstitutionInput(input)
  const found = await prisma.institution.findUnique({ where: { id }, select: { kind: true } })
  if (!found) throw new Error('INSTITUTION_NOT_FOUND')
  await assertNameFree(data.name, id)
  if (data.kind !== found.kind) {
    const accounts = await prisma.account.findMany({ where: { institutionId: id }, select: { kind: true } })
    if (accounts.some(a => institutionKindFor(a.kind) !== data.kind)) throw new Error('INSTITUTION_IN_USE')
  }
  await prisma.institution.update({ where: { id }, data })
}

/** Hides it from pickers; its accounts keep it. Throws: 'INVALID_INPUT', 'INSTITUTION_NOT_FOUND' */
export async function archiveInstitution(id: unknown, archived = true): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.institution.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('INSTITUTION_NOT_FOUND')
  await prisma.institution.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } })
}

/**
 * One place up or down among the active banks (the order of groups and pickers).
 * At either end it stays. Throws: 'INVALID_INPUT', 'INSTITUTION_NOT_FOUND'
 */
export async function moveInstitution(id: unknown, direction: unknown): Promise<void> {
  if (typeof id !== 'string' || (direction !== 'up' && direction !== 'down')) throw new Error('INVALID_INPUT')
  const active = await prisma.institution.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  const from = active.findIndex(i => i.id === id)
  if (from === -1) throw new Error('INSTITUTION_NOT_FOUND')
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= active.length) return
  const order = active.map(i => i.id)
  ;[order[from], order[to]] = [order[to], order[from]]
  // Renumbered from 0, so ties left by older rows or archived ones never block a move
  await prisma.$transaction(order.map((rowId, sortOrder) => prisma.institution.update({ where: { id: rowId }, data: { sortOrder } })))
}
