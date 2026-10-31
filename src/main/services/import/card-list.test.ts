import { describe, expect, it } from 'vitest'
import { htmlText, isMhtml, mhtmlHtml, normaliseCardAmount, readCardList } from './card-list'
import { readStatement, type StatementAccount } from './read-statement'
import { buildPreview } from './build-preview'
import type { ParsedRow } from './parse-rows'

// Shapes of the issuers' pages (2026-10-31) with made-up rows
const UP_HELLAS = [
  'Up Hellas',
  'My Cards5370 **** **** 1234 VALID THRU',
  '04/29',
  'My Balance32,89€',
  'My Transactions',
  'Search',
  'CORNER MARKET31/10/2026',
  '-97.25€',
  'ACME SOFTWARE Α Ε30/10/2026',
  '+130.00€',
  'CORNER MARKET06/10/2026',
  '-130.00€',
  'Home',
  'Map',
].join('\r\n')

const EDENRED = [
  'Υπόλοιπο κάρτας59.28€Κάτοχος κάρταςJane Doe',
  'Συναλλαγές',
  'Απορριφθείσες',
  'Οκτώβριος 2026BAKERY ONE - MAIN ST 4, TOWN,15344,GRC,GRC',
  '30/10/2026',
  '-15.70 €',
  'Reload',
  '23/10/2026',
  '130.00 €',
  'CAFE TWO XALANDRI,GRC',
  '16/10/2026',
  '-27.24 €',
  'Απορριφθείσα',
  'Σεπτέμβριος 2026',
  'GROCER THREE - ROAD 9, TOWN,15344,GRC',
  '30/09/2026',
  '-73.01 €',
  'Privacy Preference Center',
  'Cookies Details',
].join('\n')

const voucherAccount: StatementAccount = { importProfile: null, importMapping: null, statementPreset: null, kind: 'MEAL_VOUCHER', currency: 'EUR' }
const utf8 = (s: string) => new TextEncoder().encode(s)

describe('meal-card lists', () => {
  it('should read the Up Hellas list: date glued to the merchant, signed amounts, page text skipped', () => {
    expect(readCardList(UP_HELLAS)).toEqual({
      cells: [
        ['Date', 'Description', 'Amount'],
        ['31/10/2026', 'CORNER MARKET', '-97.25'],
        ['30/10/2026', 'ACME SOFTWARE Α Ε', '+130.00'],
        ['06/10/2026', 'CORNER MARKET', '-130.00'],
      ],
      declined: 0,
    })
  })

  it('should read the Edenred list: month headers stripped, a top-up without sign, declined payments left out', () => {
    const { cells, declined } = readCardList(EDENRED)
    expect(cells.slice(1)).toEqual([
      ['30/10/2026', 'BAKERY ONE - MAIN ST 4, TOWN,15344,GRC,GRC', '-15.70'],
      ['23/10/2026', 'Reload', '130.00'],
      ['30/09/2026', 'GROCER THREE - ROAD 9, TOWN,15344,GRC', '-73.01'],
    ])
    expect(declined).toBe(1)
  })

  it('should read rows copied as one tab- or space-separated line each, and keep identical rows', () => {
    const text = 'SHOP\t01/10/2026\t-5.00 €\nSHOP 01/10/2026 -5.00€\nKIOSK 02/10/2026 −1.234,50 €'
    expect(readCardList(text).cells.slice(1)).toEqual([
      ['01/10/2026', 'SHOP', '-5.00'],
      ['01/10/2026', 'SHOP', '-5.00'],
      ['02/10/2026', 'KIOSK', '-1234.50'],
    ])
  })

  it('should find nothing in text without a date and an amount', () => {
    expect(readCardList('My Balance 32,89€\nUpdated 31/10/2026\nHome')).toEqual({ cells: [], declined: 0 })
    expect(normaliseCardAmount('+1.234,50€')).toBe('+1234.50')
  })

  it('should read a saved page (.mhtml, quoted-printable) the way a copy reads', () => {
    const html = '<html><body><ul><li><div class=3D"t">CAF=C3=89 ONE</div><div>01/10/2026</div><div>-4.20 =E2=82=AC</div></li></ul></body></html>'
    const mhtml = [
      'From: <Saved by Blink>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; type="text/html"; boundary="----B"',
      '',
      '------B',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      html.slice(0, 40) + '=\r\n' + html.slice(40),
      '------B--',
    ].join('\r\n')
    expect(isMhtml(mhtml)).toBe(true)
    expect(readCardList(htmlText(mhtmlHtml(mhtml))).cells.slice(1)).toEqual([['01/10/2026', 'CAFÉ ONE', '-4.20']])
  })

  it('should read a meal card statement whatever its issuer, with the declined count', () => {
    const read = readStatement(utf8(EDENRED), voucherAccount)
    expect(read).toMatchObject({ ok: true, profile: 'card-list', source: { format: 'text' }, declined: 1 })
    if (!read.ok) return
    expect(read.rows.map(r => [r.bookedAt, r.amountCents])).toEqual([['2026-10-30', -1570], ['2026-10-23', 13000], ['2026-09-30', -7301]])
    expect(readStatement(utf8('<html><body><div>Nothing here</div></body></html>'), voucherAccount)).toMatchObject({ ok: false, reason: 'NO_ROWS' })
  })
})

describe('meal-card preview', () => {
  const parsed = (description: string, amountCents: number, patch: Partial<ParsedRow> = {}): ParsedRow => ({
    line: 2, bookedAt: '2026-10-21', valueDate: null, amountCents, description, bankReference: null, balanceAfterCents: null, pending: false, ...patch,
  })
  const ctx = {
    fingerprints: new Set<string>(), bankReferences: new Set<string>(), manual: [], rules: [], history: new Map<string, string>(), ownIbans: new Map(),
    transferCandidates: [{ id: 'bank-row', accountId: 'bank', accountName: 'Bank', bookedAt: '2026-10-21', amountCents: -13000, description: 'ACME' }],
    today: '2026-11-01',
  }

  it('should send a top-up to Meal vouchers and never pair it with a bank row', () => {
    const { rows, summary } = buildPreview('card', [parsed('ACME SOFTWARE', 13000), parsed('ΑΝΑΛΗΨΗ ATM', -2000, { line: 3 })], { ...ctx, voucher: { categoryId: 'mv' } }, 2)
    expect(rows[0]).toMatchObject({ status: 'NEW', transferWith: null, suggestion: { categoryId: 'mv', source: { kind: 'voucher' } } })
    expect(rows[1]).toMatchObject({ status: 'NEW', transferHint: null, suggestion: null })
    expect(summary.declined).toBe(2)
  })

  it('should still pair a bank account row, and flag a date after today', () => {
    const { rows } = buildPreview('other', [parsed('ACME', 13000), parsed('SHOP', -500, { line: 3, bookedAt: '2026-12-31' })], ctx)
    expect(rows[0]).toMatchObject({ status: 'TRANSFER_MATCH', futureDate: false })
    expect(rows[1]).toMatchObject({ futureDate: true })
  })
})
