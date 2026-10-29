import { prisma } from '../db/prisma'
import type { Prisma } from '../../../prisma/generated/client/client'
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
      { key: 'meal_vouchers', name: { el: 'Κουπόνια σίτισης', en: 'Meal vouchers' } },
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
  // Spending is split by area so the picker and the budget stay easy to scan
  {
    type: 'EXPENSE',
    name: { el: 'Διατροφή', en: 'Food' },
    categories: [
      { key: 'groceries', name: { el: 'Σούπερ μάρκετ', en: 'Supermarket' } },
      { key: 'butcher_fish', name: { el: 'Κρεοπωλείο & ιχθυοπωλείο', en: 'Butcher & fishmonger' } },
      { key: 'eating_out', name: { el: 'Φαγητό έξω', en: 'Eating out' } },
      { key: 'delivery', name: { el: 'Delivery', en: 'Delivery' } },
      { key: 'coffee', name: { el: 'Καφές', en: 'Coffee' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Σπίτι', en: 'Home' },
    categories: [
      { key: 'household_supplies', name: { el: 'Είδη σπιτιού', en: 'Household supplies' } },
      { key: 'home_maintenance', name: { el: 'Γενική συντήρηση', en: 'Home maintenance' } },
      { key: 'home_services', name: { el: 'Υπηρεσίες σπιτιού', en: 'Home services' } },
      { key: 'garden', name: { el: 'Κήπος', en: 'Garden' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Μετακινήσεις', en: 'Transport' },
    categories: [
      { key: 'fuel', name: { el: 'Καύσιμα', en: 'Fuel' } },
      { key: 'car_repairs', name: { el: 'Επισκευές & σέρβις', en: 'Repairs & service' } },
      { key: 'tolls', name: { el: 'Διόδια', en: 'Tolls' } },
      { key: 'tickets', name: { el: 'Εισιτήρια', en: 'Tickets' } },
      { key: 'transport_other', name: { el: 'Λοιπά μεταφορικά', en: 'Other transport' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Υγεία', en: 'Health' },
    categories: [
      { key: 'doctors', name: { el: 'Γιατροί', en: 'Doctors' } },
      { key: 'medical_tests', name: { el: 'Ιατρικές εξετάσεις', en: 'Medical tests' } },
      { key: 'pharmacy', name: { el: 'Φαρμακείο', en: 'Pharmacy' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Προσωπική φροντίδα', en: 'Personal care' },
    categories: [
      { key: 'hairdresser', name: { el: 'Κομμωτήριο', en: 'Hairdresser' } },
      { key: 'nails', name: { el: 'Νύχια', en: 'Nails' } },
      { key: 'massage', name: { el: 'Μασάζ', en: 'Massage' } },
      { key: 'clothing', name: { el: 'Ρούχα & ψώνια', en: 'Clothing & shopping' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Ψυχαγωγία', en: 'Leisure' },
    categories: [
      { key: 'cinema', name: { el: 'Σινεμά', en: 'Cinema' } },
      { key: 'concerts', name: { el: 'Συναυλίες', en: 'Concerts' } },
      { key: 'sports_events', name: { el: 'Αθλητικά γεγονότα', en: 'Sports events' } },
      { key: 'dates', name: { el: 'Ραντεβού', en: 'Dates' } },
      { key: 'hobbies', name: { el: 'Χόμπι', en: 'Hobbies' } },
      { key: 'chess', name: { el: 'Σκάκι', en: 'Chess' } },
    ],
  },
  {
    type: 'EXPENSE',
    name: { el: 'Οικογένεια & λοιπά', en: 'Family & other' },
    categories: [
      { key: 'kids', name: { el: 'Παιδιά', en: 'Kids' } },
      { key: 'pets', name: { el: 'Κατοικίδια', en: 'Pets' } },
      { key: 'education', name: { el: 'Εκπαίδευση', en: 'Education' } },
      { key: 'gifts', name: { el: 'Δώρα', en: 'Gifts' } },
      { key: 'christmas_gifts', name: { el: 'Χριστουγεννιάτικα δώρα', en: 'Christmas gifts' } },
      { key: 'charity', name: { el: 'Φιλανθρωπία', en: 'Charity' } },
      { key: 'cash_unitemised', name: { el: 'Μετρητά (χωρίς ανάλυση)', en: 'Cash (not itemised)' } },
      { key: 'other_spending', name: { el: 'Λοιπά έξοδα', en: 'Other spending' } },
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

/** Where a meal-voucher card's monthly top-up is booked */
export const VOUCHER_CATEGORY = SEED_GROUPS[0].categories.find(c => c.key === 'meal_vouchers')!.name

/**
 * Makes sure an income category for meal-voucher top-ups exists (in either
 * language), for databases seeded before it was a starter category. Adds it
 * to the first income group, or brings back an archived one of that name.
 */
export async function ensureVoucherCategory(tx: Prisma.TransactionClient, lang: AppLanguage): Promise<void> {
  const names = Object.values(VOUCHER_CATEGORY)
  const found = await tx.category.findFirst({ where: { type: 'INCOME', parentId: { not: null }, name: { in: names } }, orderBy: { archivedAt: 'asc' } })
  if (found) {
    if (found.archivedAt) await tx.category.update({ where: { id: found.id }, data: { archivedAt: null } })
    return
  }
  let group = await tx.category.findFirst({ where: { type: 'INCOME', parentId: null, archivedAt: null }, orderBy: { sortOrder: 'asc' } })
  if (!group) {
    const last = await tx.category.aggregate({ where: { parentId: null }, _max: { sortOrder: true } })
    group = await tx.category.create({ data: { name: SEED_GROUPS[0].name[lang], type: 'INCOME', sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  }
  const last = await tx.category.aggregate({ where: { parentId: group.id }, _max: { sortOrder: true } })
  await tx.category.create({ data: { name: VOUCHER_CATEGORY[lang], type: 'INCOME', parentId: group.id, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
}
