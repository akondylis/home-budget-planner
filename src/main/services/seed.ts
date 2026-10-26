import { prisma } from '../db/prisma'
import { normalise } from '../../shared/search-normalise'
import type { CategoryType } from '../../shared/ledger'
import type { AppLanguage } from './settings'

// Starting categories and merchant rules, written once into an empty database in
// the app language of that moment. After that they are the household's own data.

type Name = Record<AppLanguage, string>

interface SeedGroup {
  type: CategoryType
  name: Name
  categories: { key: string; name: Name }[]
}

export const SEED_GROUPS: SeedGroup[] = [
  {
    type: 'INCOME',
    name: { el: 'Έσοδα', en: 'Income' },
    categories: [
      { key: 'salary', name: { el: 'Μισθός', en: 'Salary' } },
      { key: 'benefits', name: { el: 'Επιδόματα', en: 'Benefits' } },
      { key: 'other_income', name: { el: 'Άλλα έσοδα', en: 'Other income' } },
    ],
  },
  {
    type: 'BILL',
    name: { el: 'Λογαριασμοί', en: 'Bills' },
    categories: [
      { key: 'electricity', name: { el: 'Ρεύμα', en: 'Electricity' } },
      { key: 'water', name: { el: 'Νερό', en: 'Water' } },
      { key: 'telecom', name: { el: 'Τηλέφωνο & Internet', en: 'Phone & internet' } },
      { key: 'building', name: { el: 'Κοινόχρηστα', en: 'Building fees' } },
      { key: 'rent', name: { el: 'Ενοίκιο', en: 'Rent' } },
    ],
  },
  {
    type: 'SUBSCRIPTION',
    name: { el: 'Συνδρομές', en: 'Subscriptions' },
    categories: [
      { key: 'streaming', name: { el: 'Streaming', en: 'Streaming' } },
      { key: 'gym', name: { el: 'Γυμναστήριο', en: 'Gym' } },
      { key: 'software', name: { el: 'Λογισμικό', en: 'Software' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Έξοδα', en: 'Spending' },
    categories: [
      { key: 'groceries', name: { el: 'Σούπερ μάρκετ', en: 'Supermarket' } },
      { key: 'fuel', name: { el: 'Καύσιμα', en: 'Fuel' } },
      { key: 'eating_out', name: { el: 'Φαγητό έξω', en: 'Eating out' } },
      { key: 'kids', name: { el: 'Παιδιά', en: 'Kids' } },
      { key: 'health', name: { el: 'Υγεία', en: 'Health' } },
      { key: 'clothing', name: { el: 'Ρούχα', en: 'Clothing' } },
      { key: 'cash_unitemised', name: { el: 'Μετρητά (χωρίς ανάλυση)', en: 'Cash (not itemised)' } },
    ],
  },
  {
    type: 'DEBT',
    name: { el: 'Χρέη', en: 'Debt' },
    categories: [
      { key: 'loan', name: { el: 'Δάνειο', en: 'Loan' } },
      { key: 'card_instalments', name: { el: 'Δόσεις κάρτας', en: 'Card instalments' } },
    ],
  },
  {
    type: 'SAVINGS',
    name: { el: 'Αποταμίευση', en: 'Savings' },
    categories: [
      { key: 'emergency_fund', name: { el: 'Ταμείο έκτακτων', en: 'Emergency fund' } },
      { key: 'holidays', name: { el: 'Διακοπές', en: 'Holidays' } },
    ],
  },
]

interface SeedRule {
  /** As the bank prints it; stored normalised */
  text: string
  category: string
  payee: string
  /** Short names match only at the start, so "AB" does not catch "ΑΒΑΝΤΙ" mid-word */
  match?: 'CONTAINS' | 'STARTS_WITH'
}

export const SEED_RULES: SeedRule[] = [
  { text: 'ΔΕΗ', category: 'electricity', payee: 'ΔΕΗ', match: 'STARTS_WITH' },
  { text: 'ΕΥΔΑΠ', category: 'water', payee: 'ΕΥΔΑΠ' },
  { text: 'COSMOTE', category: 'telecom', payee: 'COSMOTE' },
  { text: 'VODAFONE', category: 'telecom', payee: 'Vodafone' },
  { text: 'NETFLIX', category: 'streaming', payee: 'Netflix' },
  { text: 'SPOTIFY', category: 'streaming', payee: 'Spotify' },
  { text: 'ΒΑΣΙΛΟΠΟΥΛΟΣ', category: 'groceries', payee: 'ΑΒ Βασιλόπουλος' },
  { text: 'ΣΚΛΑΒΕΝΙΤΗΣ', category: 'groceries', payee: 'Σκλαβενίτης' },
  { text: 'ΜΑΣΟΥΤΗΣ', category: 'groceries', payee: 'Μασούτης' },
  { text: 'LIDL', category: 'groceries', payee: 'Lidl' },
  { text: 'AB ', category: 'groceries', payee: 'ΑΒ Βασιλόπουλος', match: 'STARTS_WITH' },
  { text: 'SHELL', category: 'fuel', payee: 'Shell' },
  { text: 'EKO', category: 'fuel', payee: 'ΕΚΟ', match: 'STARTS_WITH' },
  { text: 'BP', category: 'fuel', payee: 'BP', match: 'STARTS_WITH' },
  // ATM withdrawals: the import offers a transfer to Cash first; this is the fallback
  { text: 'ΑΝΑΛΗΨΗ', category: 'cash_unitemised', payee: 'ATM' },
  { text: 'ATM', category: 'cash_unitemised', payee: 'ATM' },
  { text: 'CASH WITHDRAWAL', category: 'cash_unitemised', payee: 'ATM' },
]

/** Writes the starting categories and rules when the database has no categories yet */
export async function seedDefaults(lang: AppLanguage): Promise<boolean> {
  if ((await prisma.category.count()) > 0) return false
  await prisma.$transaction(async tx => {
    const idByKey = new Map<string, string>()
    for (const [groupIndex, group] of SEED_GROUPS.entries()) {
      const parent = await tx.category.create({ data: { name: group.name[lang], type: group.type, sortOrder: groupIndex } })
      for (const [index, c] of group.categories.entries()) {
        const created = await tx.category.create({
          data: { name: c.name[lang], type: group.type, parentId: parent.id, sortOrder: index },
        })
        idByKey.set(c.key, created.id)
      }
    }
    await tx.categoryRule.createMany({
      data: SEED_RULES.map((r, index) => ({
        pattern: normalise(r.text),
        match: r.match ?? 'CONTAINS',
        categoryId: idByKey.get(r.category)!,
        payee: r.payee,
        // Earlier rules win; long specific names come before short prefixes
        priority: SEED_RULES.length - index,
      })),
    })
  })
  return true
}
