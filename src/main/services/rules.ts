// Merchant → category rules. The import preview suggests categories from them
// (import/apply-rules.ts); the user teaches new ones with "Always put X in Y?".

import { z } from 'zod'
import { prisma } from '../db/prisma'
import { normalise } from '../../shared/search-normalise'
import { payeeKey } from '../../shared/payee-key'
import type { RuleSummary } from '../../shared/statement-import'
import { ruleMatches } from './import/apply-rules'

/** Rules the user makes beat the seeded merchant list */
const LEARNED_PRIORITY = 1000

const MATCHES = ['CONTAINS', 'STARTS_WITH', 'EXACT'] as const

const ruleInput = z.object({
  pattern: z.string().trim().min(1).max(80),
  categoryId: z.string(),
  payee: z.string().trim().max(120).nullish(),
  accountId: z.string().nullish(),
  match: z.enum(MATCHES).default('CONTAINS'),
  applyToUncategorised: z.boolean().default(false),
})

const ruleUpdate = z.object({
  pattern: z.string().trim().min(1).max(80).optional(),
  categoryId: z.string().optional(),
  payee: z.string().trim().max(120).nullish(),
  match: z.enum(MATCHES).optional(),
  priority: z.number().int().optional(),
})

/** Every rule, the strongest first */
export async function listRules(): Promise<RuleSummary[]> {
  const rules = await prisma.categoryRule.findMany({
    where: { category: { archivedAt: null } },
    orderBy: [{ priority: 'desc' }, { pattern: 'asc' }],
    include: { category: { select: { name: true } } },
  })
  return rules.map(r => ({
    id: r.id,
    pattern: r.pattern,
    match: r.match,
    accountId: r.accountId,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    payee: r.payee,
    priority: r.priority,
    hitCount: r.hitCount,
  }))
}

async function assertCategory(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  // Rows are sorted into categories, never into a group
  if (!category || category.archivedAt || category.parentId === null) throw new Error('CATEGORY_NOT_FOUND')
}

/** The pattern as stored: folded like payeeKey(), so "ΒΑΣΙΛΟΠΟΥΛΟΣ" and "vasilopoulos" are one rule */
function storedPattern(text: string): string {
  const pattern = payeeKey(text) || normalise(text)
  if (!pattern) throw new Error('INVALID_INPUT')
  return pattern
}

/**
 * Saves a rule; the same pattern for the same account updates the rule it already has.
 * With `applyToUncategorised`, rows still waiting for a category that match it are sorted too.
 * Throws: 'INVALID_INPUT', 'CATEGORY_NOT_FOUND', 'ACCOUNT_NOT_FOUND'
 */
export async function createRule(input: unknown): Promise<{ id: string; appliedCount: number }> {
  const parsed = ruleInput.safeParse(input)
  if (!parsed.success) throw new Error('INVALID_INPUT')
  const { categoryId, payee, match, applyToUncategorised } = parsed.data
  const accountId = parsed.data.accountId ?? null
  const pattern = storedPattern(parsed.data.pattern)
  await assertCategory(categoryId)
  if (accountId && !(await prisma.account.findUnique({ where: { id: accountId } }))) throw new Error('ACCOUNT_NOT_FOUND')

  return prisma.$transaction(async tx => {
    const existing = await tx.categoryRule.findFirst({ where: { pattern, accountId, match } })
    const data = { categoryId, payee: payee || null, priority: LEARNED_PRIORITY }
    const { id } = existing
      ? await tx.categoryRule.update({ where: { id: existing.id }, data })
      : await tx.categoryRule.create({ data: { ...data, pattern, accountId, match } })
    if (!applyToUncategorised) return { id, appliedCount: 0 }

    const waiting = await tx.transaction.findMany({
      where: { categoryId: null, transferId: null, ...(accountId ? { accountId } : {}) },
      select: { id: true, description: true, payee: true },
    })
    const rule = { pattern, match }
    const matching = waiting.filter(r => ruleMatches(rule, payeeKey(r.description || r.payee || '')))
    if (matching.length) {
      await tx.transaction.updateMany({ where: { id: { in: matching.map(r => r.id) } }, data: { categoryId } })
      // Keep the payee the user typed; fill it only where there was none
      if (payee) await tx.transaction.updateMany({ where: { id: { in: matching.map(r => r.id) }, payee: null }, data: { payee } })
    }
    return { id, appliedCount: matching.length }
  })
}

/** Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND', 'CATEGORY_NOT_FOUND' */
export async function updateRule(id: unknown, input: unknown): Promise<void> {
  const parsed = ruleUpdate.safeParse(input)
  if (typeof id !== 'string' || !parsed.success) throw new Error('INVALID_INPUT')
  if (!(await prisma.categoryRule.findUnique({ where: { id } }))) throw new Error('RULE_NOT_FOUND')
  const { pattern, categoryId, payee, match, priority } = parsed.data
  if (categoryId) await assertCategory(categoryId)
  await prisma.categoryRule.update({
    where: { id },
    data: {
      ...(pattern !== undefined ? { pattern: storedPattern(pattern) } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(payee !== undefined ? { payee: payee || null } : {}),
      ...(match !== undefined ? { match } : {}),
      ...(priority !== undefined ? { priority } : {}),
    },
  })
}

/** Rows keep their categories; only future suggestions change. Throws: 'INVALID_INPUT', 'RULE_NOT_FOUND' */
export async function deleteRule(id: unknown): Promise<void> {
  if (typeof id !== 'string') throw new Error('INVALID_INPUT')
  const { count } = await prisma.categoryRule.deleteMany({ where: { id } })
  if (count === 0) throw new Error('RULE_NOT_FOUND')
}
