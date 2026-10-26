import { z } from 'zod'
import { prisma } from '../db/prisma'
import { CATEGORY_TYPES, type CategoryNode, type CategoryType } from '../../shared/ledger'

const TYPE_ORDER = new Map<CategoryType, number>(CATEGORY_TYPES.map((t, i) => [t, i]))

const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().nullish(),
  type: z.enum(CATEGORY_TYPES).optional(),
  icon: z.string().max(40).nullish(),
})

/** Groups (by type, then sort order) with their active categories */
export async function listCategories(): Promise<CategoryNode[]> {
  const rows = await prisma.category.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const node = (r: (typeof rows)[number]): CategoryNode => ({
    id: r.id,
    name: r.name,
    type: r.type,
    icon: r.icon,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    children: [],
  })
  const groups = rows.filter(r => r.parentId === null).map(node)
  const byId = new Map(groups.map(g => [g.id, g]))
  for (const r of rows) {
    if (r.parentId) byId.get(r.parentId)?.children.push(node(r))
  }
  return groups.sort((a, b) => TYPE_ORDER.get(a.type)! - TYPE_ORDER.get(b.type)! || a.sortOrder - b.sortOrder)
}

/** Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS' */
export async function createCategory(input: unknown): Promise<string> {
  const parsed = categoryInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const { name, parentId, type, icon } = parsed.data
  let resolvedType = type
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } })
    if (!parent || parent.parentId !== null || parent.archivedAt) throw new Error('CATEGORY_NOT_FOUND')
    resolvedType = parent.type
  }
  if (!resolvedType) throw new Error('INVALID_INPUT')
  await assertNameFree(name, parentId ?? null)
  // Same name archived earlier: bring it back, so its old rows and rules follow
  const archived = await prisma.category.findFirst({ where: { parentId: parentId ?? null, name, archivedAt: { not: null } } })
  if (archived) {
    await prisma.category.update({ where: { id: archived.id }, data: { archivedAt: null, type: resolvedType } })
    return archived.id
  }
  const last = await prisma.category.aggregate({ where: { parentId: parentId ?? null }, _max: { sortOrder: true } })
  const created = await prisma.category.create({
    data: { name, parentId: parentId ?? null, type: resolvedType, icon: icon ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  })
  return created.id
}

/**
 * Renames a category or group; a group's new type passes down to its categories.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS'
 */
export async function updateCategory(id: unknown, input: unknown): Promise<void> {
  const parsed = categoryInput.omit({ parentId: true }).safeParse(input)
  if (typeof id !== 'string' || !parsed.success) throw new Error('INVALID_INPUT')
  const current = await prisma.category.findUnique({ where: { id } })
  if (!current) throw new Error('CATEGORY_NOT_FOUND')
  const { name, type, icon } = parsed.data
  if (name !== current.name) await assertNameFree(name, current.parentId)
  const isGroup = current.parentId === null
  const newType = isGroup && type ? type : current.type
  await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { name, type: newType, ...(icon !== undefined ? { icon } : {}) } }),
    ...(isGroup && newType !== current.type
      ? [prisma.category.updateMany({ where: { parentId: id }, data: { type: newType } })]
      : []),
  ])
}

/**
 * Hides a category (a group takes its categories with it). Rows keep their category
 * and still count in totals. Throws: 'CATEGORY_NOT_FOUND'
 */
export async function archiveCategory(id: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.category.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw new Error('CATEGORY_NOT_FOUND')
  const now = new Date()
  await prisma.category.updateMany({ where: { OR: [{ id }, { parentId: id }], archivedAt: null }, data: { archivedAt: now } })
}

// SQLite treats NULL parents as distinct in the unique index, so groups are checked here
async function assertNameFree(name: string, parentId: string | null): Promise<void> {
  const clash = await prisma.category.findFirst({ where: { parentId, name, archivedAt: null }, select: { id: true } })
  if (clash) throw new Error('CATEGORY_EXISTS')
}
