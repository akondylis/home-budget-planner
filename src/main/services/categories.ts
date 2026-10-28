import { z } from 'zod'
import { prisma } from '../db/prisma'
import { CATEGORY_TYPES, type CategoryNode, type CategoryType, type ManagedCategoryNode, type MergeResult } from '../../shared/ledger'

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

/** The Categories page: every group and category, archived ones too, with their row and rule counts */
export async function listCategoriesForManage(): Promise<ManagedCategoryNode[]> {
  const [rows, txCounts, ruleCounts] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.transaction.groupBy({ by: ['categoryId'], where: { categoryId: { not: null } }, _count: { _all: true } }),
    prisma.categoryRule.groupBy({ by: ['categoryId'], _count: { _all: true } }),
  ])
  const txById = new Map(txCounts.map(c => [c.categoryId, c._count._all]))
  const rulesById = new Map(ruleCounts.map(c => [c.categoryId, c._count._all]))
  const node = (r: (typeof rows)[number]): ManagedCategoryNode => ({
    id: r.id,
    name: r.name,
    type: r.type,
    icon: r.icon,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    archived: r.archivedAt !== null,
    transactionCount: txById.get(r.id) ?? 0,
    ruleCount: rulesById.get(r.id) ?? 0,
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
  if (name !== current.name) {
    await assertNameFree(name, current.parentId)
    await clearArchivedNamesake(name, current.parentId)
  }
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
 * and still count in totals. Restoring a category brings back its group; restoring a
 * group brings back the categories archived with it.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS'
 */
export async function archiveCategory(id: unknown, archived: unknown = true): Promise<void> {
  if (typeof id !== 'string' || typeof archived !== 'boolean') throw new Error('INVALID_INPUT')
  const found = await prisma.category.findUnique({ where: { id }, include: { parent: true } })
  if (!found) throw new Error('CATEGORY_NOT_FOUND')
  if (archived) {
    const now = new Date()
    await prisma.category.updateMany({ where: { OR: [{ id }, { parentId: id }], archivedAt: null }, data: { archivedAt: now } })
    return
  }
  if (!found.archivedAt) return
  const parent = found.parent
  await assertNameFree(found.name, found.parentId)
  if (parent?.archivedAt) await assertNameFree(parent.name, null)
  await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { archivedAt: null } }),
    ...(parent?.archivedAt ? [prisma.category.update({ where: { id: parent.id }, data: { archivedAt: null } })] : []),
    // A group's categories archived in the same step come back with it
    ...(found.parentId === null
      ? [prisma.category.updateMany({ where: { parentId: id, archivedAt: found.archivedAt }, data: { archivedAt: null } })]
      : []),
  ])
}

/**
 * Puts a category in another group; it takes that group's type.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_EXISTS'
 */
export async function moveCategory(id: unknown, parentId: unknown): Promise<void> {
  if (typeof id !== 'string' || typeof parentId !== 'string' || id === parentId) throw new Error('INVALID_INPUT')
  const [current, group] = await Promise.all([
    prisma.category.findUnique({ where: { id } }),
    prisma.category.findUnique({ where: { id: parentId } }),
  ])
  if (!current || !group || group.archivedAt || group.parentId !== null) throw new Error('CATEGORY_NOT_FOUND')
  // Groups stay top level
  if (current.parentId === null) throw new Error('INVALID_INPUT')
  if (current.parentId === parentId) return
  await assertNameFree(current.name, parentId)
  await clearArchivedNamesake(current.name, parentId)
  const last = await prisma.category.aggregate({ where: { parentId }, _max: { sortOrder: true } })
  await prisma.category.update({
    where: { id },
    data: { parentId, type: group.type, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  })
}

/**
 * Saves the order of a group's categories, or of the groups (parentId null).
 * Throws: 'INVALID_INPUT'
 */
export async function reorderCategories(parentId: unknown, orderedIds: unknown): Promise<void> {
  const ids = z.array(z.string()).min(1).safeParse(orderedIds)
  if ((parentId !== null && typeof parentId !== 'string') || !ids.success) throw new Error('INVALID_INPUT')
  const siblings = await prisma.category.count({ where: { id: { in: ids.data }, parentId } })
  if (siblings !== ids.data.length || new Set(ids.data).size !== ids.data.length) throw new Error('INVALID_INPUT')
  await prisma.$transaction(ids.data.map((id, sortOrder) => prisma.category.update({ where: { id }, data: { sortOrder } })))
}

/**
 * Moves every row and rule of one category into another and archives the empty one.
 * A rule the target already has (same pattern, account and match) is dropped.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND'
 */
export async function mergeCategory(sourceId: unknown, targetId: unknown): Promise<MergeResult> {
  if (typeof sourceId !== 'string' || typeof targetId !== 'string' || sourceId === targetId) throw new Error('INVALID_INPUT')
  const [source, target] = await Promise.all([
    prisma.category.findUnique({ where: { id: sourceId } }),
    prisma.category.findUnique({ where: { id: targetId } }),
  ])
  if (!source || !target || target.archivedAt) throw new Error('CATEGORY_NOT_FOUND')
  // Rows live in categories, never in a group
  if (source.parentId === null || target.parentId === null) throw new Error('INVALID_INPUT')

  return prisma.$transaction(async tx => {
    const { count: transactions } = await tx.transaction.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } })
    const [moving, kept] = await Promise.all([
      tx.categoryRule.findMany({ where: { categoryId: sourceId } }),
      tx.categoryRule.findMany({ where: { categoryId: targetId }, select: { pattern: true, accountId: true, match: true } }),
    ])
    const ruleKey = (r: { pattern: string; accountId: string | null; match: string }) => `${r.match}|${r.accountId ?? ''}|${r.pattern}`
    const taken = new Set(kept.map(ruleKey))
    const duplicates = moving.filter(r => taken.has(ruleKey(r))).map(r => r.id)
    if (duplicates.length) await tx.categoryRule.deleteMany({ where: { id: { in: duplicates } } })
    const { count: rules } = await tx.categoryRule.updateMany({ where: { categoryId: sourceId }, data: { categoryId: targetId } })
    if (!source.archivedAt) await tx.category.update({ where: { id: sourceId }, data: { archivedAt: new Date() } })
    return { transactions, rules }
  })
}

/**
 * Removes a category no row uses (its rules go with it), or an empty group.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'CATEGORY_IN_USE'
 */
export async function deleteCategory(id: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const found = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, children: true } } },
  })
  if (!found) throw new Error('CATEGORY_NOT_FOUND')
  if (found._count.transactions > 0 || found._count.children > 0) throw new Error('CATEGORY_IN_USE')
  await prisma.category.delete({ where: { id } })
}

// SQLite treats NULL parents as distinct in the unique index, so groups are checked here
async function assertNameFree(name: string, parentId: string | null): Promise<void> {
  const clash = await prisma.category.findFirst({ where: { parentId, name, archivedAt: null }, select: { id: true } })
  if (clash) throw new Error('CATEGORY_EXISTS')
}

// The unique index covers archived rows too: an archived namesake nothing uses is removed
// so the name can be taken; one that still holds rows blocks it
async function clearArchivedNamesake(name: string, parentId: string | null): Promise<void> {
  const twin = await prisma.category.findFirst({
    where: { parentId, name, archivedAt: { not: null } },
    include: { _count: { select: { transactions: true, children: true } } },
  })
  if (!twin) return
  if (twin._count.transactions > 0 || twin._count.children > 0) throw new Error('CATEGORY_EXISTS')
  await prisma.category.delete({ where: { id: twin.id } })
}
