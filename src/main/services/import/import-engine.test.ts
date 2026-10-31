import { describe, expect, it } from 'vitest'
import { decodeStatement } from './decode'
import { parseCsv, sniffDelimiter } from './csv'
import { PROFILES, parseSavedMapping, profileFor, resolveColumns, resolveSavedMapping } from './profiles'
import { parseRows, parseStatementAmount, parseStatementDate } from './parse-rows'
import { fingerprintRows, payeeKey } from './fingerprint'
import { classifyRows, daysBetween, refKey } from './dedupe'
import { matchTransfers, transferHint } from './transfer-match'
import { ruleMatches, sortRules, suggestCategory, type RuleLike } from './apply-rules'
import { readStatement } from './read-statement'
import { readXlsx, sheetRows } from './xlsx'
import { deflateRawSync } from 'node:zlib'
import { normalise } from '../../../shared/search-normalise'

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('decodeStatement', () => {
  it('should read UTF-8 with or without a BOM', () => {
    expect(decodeStatement(utf8('Ποσό;1')).text).toBe('Ποσό;1')
    expect(decodeStatement(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Ποσό')]))).toEqual({ text: 'Ποσό', encoding: 'utf-8' })
  })

  it('should fall back to the Greek code page when the bytes are not UTF-8', () => {
    // "Ποσό" in windows-1253
    expect(decodeStatement(new Uint8Array([0xd0, 0xef, 0xf3, 0xfc]))).toEqual({ text: 'Ποσό', encoding: 'windows-1253' })
  })

  it('should read UTF-16 with its BOM', () => {
    const text = 'Ποσό'
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes.set([0xff, 0xfe])
    for (let i = 0; i < text.length; i++) {
      bytes[2 + i * 2] = text.charCodeAt(i) & 0xff
      bytes[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    expect(decodeStatement(bytes)).toEqual({ text, encoding: 'utf-16le' })
  })
})

describe('csv', () => {
  it('should unwrap Excel-style text cells, bare or quoted', () => {
    expect(parseCsv('="0012";"=""ABC""";x')).toEqual([['0012', 'ABC', 'x']])
  })

  it('should sniff ; even when amounts use decimal commas', () => {
    expect(sniffDelimiter('a;b;c\n1,5;2,5;x')).toBe(';')
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(sniffDelimiter('a\tb\tc')).toBe('\t')
  })

  it('should handle quotes, escaped quotes, separators and line breaks inside quotes, and CRLF', () => {
    const text = 'Ημ/νία;Περιγραφή;Ποσό\r\n01/10/2026;"ΑΓΟΡΑ; ""ΑΒ""\nΚΗΦΙΣΙΑ";-12,50\r\n\r\n02/10/2026;ΔΕΗ;-80,00'
    expect(parseCsv(text)).toEqual([
      ['Ημ/νία', 'Περιγραφή', 'Ποσό'],
      ['01/10/2026', 'ΑΓΟΡΑ; "ΑΒ"\nΚΗΦΙΣΙΑ', '-12,50'],
      ['02/10/2026', 'ΔΕΗ', '-80,00'],
    ])
  })

  it('should keep a last line without a line break', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('amounts and dates', () => {
  it('should read Greek and English number styles with the separator given', () => {
    expect(parseStatementAmount('1.234,56', ',')).toBe(123456)
    expect(parseStatementAmount('-12,5', ',')).toBe(-1250)
    expect(parseStatementAmount('1.234', ',')).toBe(123400)
    expect(parseStatementAmount('1,234.56', '.')).toBe(123456)
    expect(parseStatementAmount('12,50-', ',')).toBe(-1250)
    expect(parseStatementAmount('(12,50)', ',')).toBe(-1250)
    expect(parseStatementAmount('€ 12,50', ',')).toBe(1250)
    expect(parseStatementAmount('12,50 EUR', ',')).toBe(1250)
    expect(parseStatementAmount('+5', ',')).toBe(500)
  })

  it('should refuse text that is not an amount', () => {
    for (const bad of ['', 'abc', '1,2,3', '12,505', '-', '1.2.3,4,5']) expect(parseStatementAmount(bad, ',')).toBeNull()
  })

  it('should read statement dates, ignoring a time', () => {
    expect(parseStatementDate('05/03/2026', 'DMY')).toBe('2026-03-05')
    expect(parseStatementDate('05.03.26 14:22:01', 'DMY')).toBe('2026-03-05')
    expect(parseStatementDate('2026-03-05T10:00:00', 'YMD')).toBe('2026-03-05')
    expect(parseStatementDate('05/03', 'DMY')).toBeNull()
    expect(parseStatementDate('31/02/2026', 'DMY')).toBeNull()
  })
})

describe('profiles', () => {
  it('should pick the preset from the bank and kind unless one is saved on the account', () => {
    expect(profileFor({ importProfile: null, statementPreset: 'alpha', kind: 'CREDIT_CARD' }).key).toBe('alpha-card')
    expect(profileFor({ importProfile: null, statementPreset: 'eurobank', kind: 'CURRENT' }).key).toBe('eurobank-account')
    expect(profileFor({ importProfile: 'alpha-account', statementPreset: null, kind: 'CURRENT' }).key).toBe('alpha-account')
    expect(profileFor({ importProfile: null, statementPreset: null, kind: 'CREDIT_CARD' }).options.invertSign).toBe(true)
    expect(profileFor({ importProfile: null, statementPreset: 'piraeus', kind: 'CURRENT' }).key).toBe('piraeus-account')
    // No Piraeus card export seen yet; Revolut cards are on the account's statement
    expect(profileFor({ importProfile: null, statementPreset: 'piraeus', kind: 'CREDIT_CARD' })).toMatchObject({ key: 'generic', options: { invertSign: true } })
    expect(profileFor({ importProfile: null, statementPreset: 'revolut', kind: 'CREDIT_CARD' }).key).toBe('revolut-account')
    expect(profileFor({ importProfile: null, statementPreset: 'toString', kind: 'CURRENT' }).key).toBe('generic')
  })

  it('should find the header below a few lines about the account', () => {
    const rows = parseCsv('Λογαριασμός;GR12 3456\nΠερίοδος;01/10–31/10\nΗμ/νία Συναλλαγής;Ημ/νία Αξίας;Αιτιολογία;Ποσό;Υπόλοιπο\n01/10/2026;01/10/2026;ΔΕΗ;-80,00;920,00')
    expect(resolveColumns(rows, PROFILES.generic)).toMatchObject({
      headerRow: 2,
      columns: { date: 0, valueDate: 1, description: 2, amount: 3, balance: 4 },
      options: { amountMode: 'SIGNED' },
    })
  })

  it('should switch to debit/credit columns or a Χ/Π flag from the headers found', () => {
    const dc = parseCsv('Ημερομηνία;Περιγραφή;Χρέωση;Πίστωση\n01/10/2026;x;1;')
    expect(resolveColumns(dc, PROFILES.generic)?.options.amountMode).toBe('DEBIT_CREDIT_COLUMNS')
    const flag = parseCsv('Ημερομηνία;Περιγραφή;Ποσό;Χ/Π\n01/10/2026;x;1;Χ')
    expect(resolveColumns(flag, PROFILES.generic)?.options.amountMode).toBe('AMOUNT_WITH_DC_FLAG')
  })

  it('should return null when no header names a date, description and amount', () => {
    expect(resolveColumns(parseCsv('foo;bar\n1;2'), PROFILES.generic)).toBeNull()
  })

  it('should never read an Alpha account file as signed when its flag column is not found', () => {
    const rows = parseCsv('Ημερομηνία;Περιγραφή;Ποσό\n01/10/2026;ΔΕΗ;80,00')
    expect(resolveColumns(rows, PROFILES['alpha-account'])).toBeNull()
  })

  it('should apply a saved mapping by header text and reject a malformed one', () => {
    const mapping = { columns: { date: 'When', description: 'What', amount: 'How much' }, dateOrder: 'MDY', decimalSeparator: '.', amountMode: 'SIGNED', invertSign: false, debitFlags: [] }
    expect(parseSavedMapping(mapping)).not.toBeNull()
    expect(parseSavedMapping({ columns: {} })).toBeNull()
    const rows = parseCsv('How much,What,When\n-1.50,Coffee,10/05/2026')
    const resolved = resolveSavedMapping(rows, parseSavedMapping(mapping)!)!
    expect(parseRows(rows, resolved)[0]).toMatchObject({ bookedAt: '2026-10-05', amountCents: -150, description: 'Coffee' })
  })
})

describe('parseRows', () => {
  const resolve = (csv: string, profile = PROFILES.generic) => {
    const rows = parseCsv(csv)
    return parseRows(rows, resolveColumns(rows, profile)!)
  }

  it('should read signed amounts, balances and collapse spaces in the text', () => {
    expect(resolve('Ημερομηνία;Περιγραφή;Ποσό;Υπόλοιπο\n01/10/2026;  POS   LIDL  ;-12,50;987,50')).toEqual([
      { line: 2, bookedAt: '2026-10-01', valueDate: null, amountCents: -1250, description: 'POS LIDL', bankReference: null, balanceAfterCents: 98750 },
    ])
  })

  it('should turn debit/credit columns into one signed amount', () => {
    const rows = resolve('Ημερομηνία;Περιγραφή;Χρέωση;Πίστωση\n01/10/2026;ΔΕΗ;80,00;\n02/10/2026;ΜΙΣΘΟΣ;;1.500,00')
    expect(rows.map(r => r.amountCents)).toEqual([-8000, 150000])
  })

  it('should read the Χ/Π flag as the sign', () => {
    const rows = resolve('Ημερομηνία;Περιγραφή;Ποσό;Χ/Π\n01/10/2026;ΔΕΗ;80,00;Χ\n02/10/2026;ΜΙΣΘΟΣ;1.500,00;Π')
    expect(rows.map(r => r.amountCents)).toEqual([-8000, 150000])
  })

  it('should flip card statements so a purchase is money out', () => {
    const rows = resolve('Ημερομηνία;Περιγραφή;Ποσό\n01/10/2026;NETFLIX;13,99\n05/10/2026;ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ;-300,00', PROFILES['alpha-card'])
    expect(rows.map(r => r.amountCents)).toEqual([-1399, 30000])
  })

  it('should skip lines without a date and flag unreadable ones', () => {
    const rows = resolve('Ημερομηνία;Περιγραφή;Ποσό\n01/10/2026;A;-1,00\n;Σύνολο;-1,00\n32/10/2026;B;-2,00\n03/10/2026;C;abc')
    expect(rows.map(r => [r.line, r.problem])).toEqual([[2, undefined], [4, 'DATE'], [5, 'AMOUNT']])
  })
})

describe('fingerprints', () => {
  const row = (bookedAt: string, amountCents: number, description: string) => ({ bookedAt, amountCents, description })

  it('should number identical rows inside a file, so two coffees stay two', () => {
    const [a, b, c] = fingerprintRows('acc', [row('2026-10-01', -250, 'CAFE'), row('2026-10-01', -250, 'CAFE'), row('2026-10-01', -250, 'cafe')])
    expect(a).not.toBe(b)
    // Case and accents do not make a row different
    expect(c).not.toBe(a)
    expect(fingerprintRows('acc', [row('2026-10-01', -250, 'Café')])[0]).toBe(a)
  })

  it('should give an overlapping file the same fingerprints for the same rows', () => {
    const october = [row('2026-10-30', -250, 'CAFE'), row('2026-10-31', -100, 'BAKERY')]
    const later = [row('2026-10-31', -100, 'BAKERY'), row('2026-11-01', -500, 'LIDL')]
    const first = fingerprintRows('acc', october)
    const second = fingerprintRows('acc', later)
    expect(second[0]).toBe(first[1])
    expect(first).not.toContain(second[1])
  })

  it('should depend on the account', () => {
    expect(fingerprintRows('a', [row('2026-10-01', -1, 'X')])[0]).not.toBe(fingerprintRows('b', [row('2026-10-01', -1, 'X')])[0])
  })

  it('should reduce a description to the merchant for rules', () => {
    expect(payeeKey('POS ΣΚΛΑΒΕΝΙΤΗΣ 1234 ΚΗΦΙΣΙΑ 01/10')).toBe('sklavenitis kifisia')
    expect(payeeKey('ΑΓΟΡΑ AB ΒΑΣΙΛΟΠΟΥΛΟΣ XXXX1234')).toBe('ab vasilopoulos')
    expect(payeeKey('ΠΛΗΡΩΜΗ ΔΕΗ')).toBe('dei')
  })
})

describe('classifyRows', () => {
  const base = { bankReference: null, fingerprint: 'f-new' }
  const existing = (patch = {}) => ({ fingerprints: new Set(['f-old']), bankReferences: new Set([refKey('R1', -1)]), manual: [], ...patch })

  it('should mark a known fingerprint, or bank reference with the same amount, as already imported', () => {
    const result = classifyRows([
      { ...base, bookedAt: '2026-10-01', amountCents: -1, fingerprint: 'f-old' },
      { ...base, bookedAt: '2026-10-01', amountCents: -1, bankReference: 'R1' },
      { ...base, bookedAt: '2026-10-01', amountCents: -1 },
      { ...base, bookedAt: '2026-10-01', amountCents: 5, bankReference: 'R1', fingerprint: 'f5' },
    ], existing())
    expect(result.map(r => r.status)).toEqual(['ALREADY_IMPORTED', 'ALREADY_IMPORTED', 'NEW', 'NEW'])
  })

  it('should keep interest and its tax apart when the bank gives them one reference', () => {
    const rows = [
      { ...base, bookedAt: '2026-07-01', amountCents: -464, bankReference: '202606300991021637' },
      { ...base, bookedAt: '2026-07-01', amountCents: 3092, bankReference: '202606300991021637', fingerprint: 'f2' },
    ]
    expect(classifyRows(rows, existing()).map(r => r.status)).toEqual(['NEW', 'NEW'])
  })

  it('should count a bank reference repeated inside one file once', () => {
    const rows = [{ ...base, bookedAt: '2026-10-01', amountCents: -1, bankReference: 'R9' }, { ...base, bookedAt: '2026-10-01', amountCents: -1, bankReference: 'R9', fingerprint: 'f2' }]
    expect(classifyRows(rows, existing()).map(r => r.status)).toEqual(['NEW', 'ALREADY_IMPORTED'])
  })

  it('should offer the nearest hand-entered twin within 3 days, once', () => {
    const manual = [
      { id: 'far', bookedAt: '2026-10-01', amountCents: -1250, payee: null },
      { id: 'near', bookedAt: '2026-10-03', amountCents: -1250, payee: 'Lidl' },
      { id: 'other', bookedAt: '2026-10-03', amountCents: -999, payee: null },
    ]
    const rows = [
      { ...base, bookedAt: '2026-10-04', amountCents: -1250 },
      { ...base, bookedAt: '2026-10-04', amountCents: -1250, fingerprint: 'f2' },
      { ...base, bookedAt: '2026-10-04', amountCents: -1250, fingerprint: 'f3' },
      { ...base, bookedAt: '2026-10-09', amountCents: -999, fingerprint: 'f4' },
    ]
    const result = classifyRows(rows, existing({ manual }))
    expect(result.map(r => [r.status, r.duplicateOf?.id])).toEqual([
      ['POSSIBLE_DUPLICATE', 'near'], ['POSSIBLE_DUPLICATE', 'far'], ['NEW', undefined], ['NEW', undefined],
    ])
  })

  it('should mark rows that could not be read as invalid', () => {
    expect(classifyRows([{ ...base, bookedAt: null, amountCents: -1, problem: 'DATE' }], existing())[0].status).toBe('INVALID')
  })

  it('should count whole days across month ends', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
  })
})

describe('transfers', () => {
  const candidate = (id: string, accountId: string, bookedAt: string, amountCents: number) => ({ id, accountId, accountName: accountId, bookedAt, amountCents, description: id })

  it('should pair a card payment with the opposite amount in another account within 5 days', () => {
    const rows = [
      { bookedAt: '2026-10-05', amountCents: -30000, eligible: true },
      { bookedAt: '2026-10-05', amountCents: -30000, eligible: true },
      { bookedAt: '2026-10-05', amountCents: -1000, eligible: false },
    ]
    const candidates = [candidate('same-acc', 'bank', '2026-10-05', 30000), candidate('card', 'card', '2026-10-08', 30000), candidate('late', 'card', '2026-10-11', 30000)]
    expect(matchTransfers(rows, 'bank', candidates).map(m => m?.id ?? null)).toEqual(['card', null, null])
  })

  it('should hint at card payments and ATM withdrawals', () => {
    expect(transferHint('ΠΛΗΡΩΜΗ ΚΑΡΤΑΣ VISA')).toBe('CARD_PAYMENT')
    expect(transferHint('ΑΝΑΛΗΨΗ ATM 1234')).toBe('ATM')
    expect(transferHint('PAYMENT THANK YOU')).toBe('CARD_PAYMENT')
    expect(transferHint('ΣΚΛΑΒΕΝΙΤΗΣ')).toBeNull()
  })
})

describe('rules', () => {
  const rule = (id: string, text: string, match: RuleLike['match'], priority: number, accountId: string | null = null): RuleLike =>
    ({ id, pattern: normalise(text), match, accountId, categoryId: `cat-${id}`, payee: id, priority })

  it('should match whole words only', () => {
    expect(ruleMatches(rule('ab', 'AB', 'STARTS_WITH', 1), 'ab vasilopoulos')).toBe(true)
    expect(ruleMatches(rule('ab', 'AB', 'STARTS_WITH', 1), 'abanti')).toBe(false)
    expect(ruleMatches(rule('lidl', 'LIDL', 'CONTAINS', 1), 'pos lidl hellas')).toBe(true)
    expect(ruleMatches(rule('lidl', 'LIDL', 'CONTAINS', 1), 'lidlx')).toBe(false)
    expect(ruleMatches(rule('x', 'NETFLIX', 'EXACT', 1), 'netflix com')).toBe(false)
  })

  it('should use the highest priority, then the account-specific rule', () => {
    const rules = sortRules([rule('low', 'LIDL', 'CONTAINS', 1), rule('mine', 'LIDL', 'CONTAINS', 5, 'acc'), rule('all', 'LIDL', 'CONTAINS', 5)])
    expect(rules.map(r => r.id)).toEqual(['mine', 'all', 'low'])
    expect(suggestCategory('lidl', 'acc', rules, new Map())?.categoryId).toBe('cat-mine')
    expect(suggestCategory('lidl', 'other', rules, new Map())?.categoryId).toBe('cat-all')
  })

  it('should fall back to the category last used for the payee', () => {
    expect(suggestCategory('fournos', 'acc', [], new Map([['fournos', 'bakery']]))).toEqual({ categoryId: 'bakery', payee: null, source: { kind: 'history' } })
    expect(suggestCategory('unknown', 'acc', [], new Map())).toBeNull()
  })
})

// Fixtures in the column layout of the real exports (processed_eurobank_alpha.py)
describe('bank layouts', () => {
  const read = (csv: string, statementPreset: 'alpha' | 'eurobank', kind: 'CURRENT' | 'CREDIT_CARD') =>
    readStatement(utf8(csv), { importProfile: null, importMapping: null, statementPreset, kind })
  const amounts = (result: ReturnType<typeof read>) => (result.ok ? result.rows.map(r => r.amountCents) : result.reason)

  it('should read an Alpha account file by position, with Π as money in, whatever the flag column is called', () => {
    const csv = [
      'Αριθμός λογαριασμού;GR12 3456',
      'Α/Α;Ημερομηνία;Αιτιολογία;Κατάστημα;Κωδικός;Κανάλι;Ποσό;Είδος;Υπόλοιπο',
      '1;01/10/2026;ΔΕΗ ΠΑΓΙΑ;;123;WEB;80,00;Χ;920,00',
      '2;02/10/2026;ΜΙΣΘΟΣ;;124;BRANCH;1.500,00;Π;2.420,00',
    ].join('\n')
    const result = read(csv, 'alpha', 'CURRENT')
    expect(amounts(result)).toEqual([-8000, 150000])
    expect(result).toMatchObject({ profile: 'alpha-account', rows: [{ description: 'ΔΕΗ ΠΑΓΙΑ', balanceAfterCents: 92000 }, {}] })
  })

  it('should read an Alpha card file below its preamble, a purchase as money out', () => {
    const csv = [
      'Κάρτα;**** 1234',
      'Ημ/νία συναλλαγής;Περιγραφή;Πόλη;Χώρα;Ποσό',
      '03/10/2026 14:22;SKLAVENITIS GERAK;ATHINA;GR;45,30',
      '05/10/2026;ΕΠΙΣΤΡΟΦΗ;ATHINA;GR;-10,00',
    ].join('\n')
    expect(amounts(read(csv, 'alpha', 'CREDIT_CARD'))).toEqual([-4530, 1000])
  })

  it('should read Eurobank files with Excel-style text cells and dates with a time', () => {
    const csv = [
      'Ημ/νία;Κάρτα;Στοιχεία;Ποσό',
      '01/10/2026 09:15;="5123";="NETFLIX.COM";-13,99',
      '02/10/2026;="5123";="ΜΙΣΘΟΣ ΟΚΤ";1.234,56',
    ].join('\n')
    const account = read(csv, 'eurobank', 'CURRENT')
    expect(amounts(account)).toEqual([-1399, 123456])
    expect(account).toMatchObject({ profile: 'eurobank-account', rows: [{ bookedAt: '2026-10-01', description: 'NETFLIX.COM' }, {}] })
    expect(amounts(read(csv, 'eurobank', 'CREDIT_CARD'))).toEqual([1399, -123456])
  })

  it('should fall back to the header names when the columns moved', () => {
    expect(amounts(read('Περιγραφή;Ποσό;Ημερομηνία\nLIDL;-12,50;01/10/2026', 'eurobank', 'CURRENT'))).toEqual([-1250])
    expect(amounts(read('Α;Β;Γ;Δ\nx;y;z;w', 'eurobank', 'CURRENT'))).toBe('UNKNOWN_FORMAT')
  })
})

describe('readStatement', () => {
  const account = { importProfile: null, importMapping: null, statementPreset: 'eurobank', kind: 'CURRENT' as const }

  it('should read a whole file end to end', () => {
    const result = readStatement(utf8('Ημερομηνία;Περιγραφή;Ποσό\n01/10/2026;LIDL;-12,50'), account)
    expect(result).toMatchObject({ ok: true, profile: 'eurobank-account', source: { format: 'csv', delimiter: ';' }, rows: [{ amountCents: -1250 }] })
  })

  it('should send an unknown layout to the mapping step with a sample, and an empty file back', () => {
    expect(readStatement(utf8('foo;bar\n1;2'), account)).toMatchObject({ ok: false, reason: 'UNKNOWN_FORMAT', sample: [['foo', 'bar'], ['1', '2']] })
    expect(readStatement(utf8(''), account)).toMatchObject({ ok: false, reason: 'NO_ROWS' })
    expect(readStatement(utf8('Ημερομηνία;Περιγραφή;Ποσό\n'), account)).toMatchObject({ ok: false, reason: 'NO_ROWS' })
  })
})

// ── Excel workbooks ─────────────────────────────────────────────────────────

/** A minimal .xlsx: the given parts, deflated into a zip (CRCs are not checked by the reader) */
function xlsx(parts: Record<string, string>): Uint8Array {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, xml] of Object.entries(parts)) {
    const nameBytes = Buffer.from(name, 'utf8')
    const raw = Buffer.from(xml, 'utf8')
    const data = deflateRawSync(raw)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8)
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(nameBytes.length, 26)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(nameBytes.length, 28); dir.writeUInt32LE(offset, 42)
    local.push(head, nameBytes, data)
    central.push(dir, nameBytes)
    offset += head.length + nameBytes.length + data.length
  }
  const dirBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10)
  end.writeUInt32LE(dirBytes.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...local, dirBytes, end]))
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const workbook = (rows: string, strings: string[], styles = '<cellXfs count="1"><xf numFmtId="0"/></cellXfs>') => xlsx({
  'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="Κινήσεις" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${NS}>${strings.map(t => `<si><t xml:space="preserve">${t}</t></si>`).join('')}</sst>`,
  'xl/styles.xml': `<?xml version="1.0"?><styleSheet ${NS}>${styles}</styleSheet>`,
  'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`,
})

describe('xlsx', () => {
  it('should read shared and inline strings, numbers and date-styled cells, keeping Excel row positions', () => {
    const book = workbook(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
        + '<row r="3"><c r="B3" t="inlineStr"><is><t>A &amp; B</t></is></c><c r="C3" s="1"><v>46295</v></c><c r="D3"><v>-1234.5</v></c><c r="E3"><v>6730172224342</v></c></row>',
      ['Line one_x000D_\nline two'],
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs>',
    )
    const sheet = readXlsx(book)
    expect(sheet).toEqual([
      [{ text: 'Line one\r\nline two' }],
      [],
      [{ text: '' }, { text: 'A & B' }, { date: '2026-09-30' }, { number: -1234.5 }, { number: 6730172224342 }],
    ])
    expect(sheetRows(sheet, { decimalSeparator: ',', dateOrder: 'DMY' })[2]).toEqual(['', 'A & B', '30/09/2026', '-1234,50', '6730172224342'])
    expect(sheetRows(sheet, { decimalSeparator: '.', dateOrder: 'YMD' })[2]).toEqual(['', 'A & B', '2026-09-30', '-1234.50', '6730172224342'])
  })

  it('should say a broken workbook cannot be read', () => {
    expect(() => readXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow('IMPORT_FILE_UNREADABLE')
  })
})

// Shapes of the real exports (2026-10-30), with made-up rows
describe('Piraeus and Revolut layouts', () => {
  const account = (statementPreset: string) => ({ importProfile: null, importMapping: null, statementPreset, kind: 'CURRENT' as const, currency: 'EUR' })

  it('should read a Piraeus .xlsx below its preamble, the payee from the comments, newest first', () => {
    const s = ['Τράπεζα Πειραιώς', 'Κινήσεις Λογαριασμών', 'Κατηγορία', 'Περιγραφή Συναλλαγής', 'Ημ/νία Συναλλαγής', 'Σχόλια / Κωδικός Αναφοράς',
      'Ποσό', 'Νόμισμα', 'Προοδευτικό Λογιστικό Υπόλοιπο', 'Αγορές', 'ΑΓΟΡΑ ΚΑΡΤΑΣ', '30/09/2026', 'ΣΚΛΑΒΕΝΙΤΗΣ_x000D_\nWB / PX1', 'EUR',
      'Μισθοδοσία', 'ΜΙΣΘΟΔΟΣΙΑ', '25/09/2026', 'ACME ΑΕ']
    const c = (ref: string, i: number) => `<c r="${ref}" t="s"><v>${i}</v></c>`
    const n = (ref: string, v: string) => `<c r="${ref}"><v>${v}</v></c>`
    const book = workbook(
      `<row r="1">${c('A1', 0)}</row><row r="2">${c('A2', 1)}</row>`
        + `<row r="7">${c('A7', 2)}${c('B7', 3)}${c('C7', 4)}${c('D7', 5)}${c('E7', 6)}${c('F7', 7)}${c('G7', 8)}${c('H7', 7)}</row>`
        + `<row r="8">${c('A8', 9)}${c('B8', 10)}${c('C8', 11)}${c('D8', 12)}${n('E8', '-45.3')}${c('F8', 13)}${n('G8', '1154.7')}${c('H8', 13)}</row>`
        + `<row r="9">${c('A9', 14)}${c('B9', 15)}${c('C9', 16)}${c('D9', 17)}${n('E9', '1200')}${c('F9', 13)}${n('G9', '1200')}${c('H9', 13)}</row>`,
      s,
    )
    const result = readStatement(book, account('piraeus'))
    expect(result).toMatchObject({
      ok: true, profile: 'piraeus-account', source: { format: 'xlsx' },
      rows: [
        { line: 8, bookedAt: '2026-09-30', amountCents: -4530, balanceAfterCents: 115470, description: 'ΑΓΟΡΑ ΚΑΡΤΑΣ ΣΚΛΑΒΕΝΙΤΗΣ WB / PX1' },
        { line: 9, bookedAt: '2026-09-25', amountCents: 120000, description: 'ΜΙΣΘΟΔΟΣΙΑ ACME ΑΕ' },
      ],
    })
  })

  it('should read Revolut: completed payments only, fees taken off, other currencies and pockets apart', () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'Deposit,Current,2026-09-30 12:28:38,2026-09-30 12:29:21,Top-up by *1234,450.00,0.00,EUR,COMPLETED,450.00',
      'Card Payment,Current,2026-10-01 09:00:00,2026-10-02 10:56:41,Coffee Shop,-10.00,0.50,EUR,COMPLETED,439.50',
      'Card Payment,Current,2026-10-03 09:00:00,2026-10-03 09:30:00,Refunded Shop,-20.00,0.00,EUR,REVERTED,',
      'Card Payment,Current,2026-10-04 09:00:00,,Pending Shop,-5.00,0.00,EUR,PENDING,',
      'Transfer,Savings,2026-10-05 09:00:00,2026-10-05 09:00:01,To pocket,100.00,0.00,EUR,COMPLETED,100.00',
      'Card Payment,Current,2026-10-06 09:00:00,2026-10-06 09:30:00,US Store,-12.00,0.00,USD,COMPLETED,12.00',
    ].join('\n')
    const result = readStatement(utf8(csv), account('revolut'))
    expect(result).toMatchObject({
      ok: true, profile: 'revolut-account',
      rows: [
        { line: 2, bookedAt: '2026-09-30', amountCents: 45000, balanceAfterCents: 45000 },
        { line: 3, bookedAt: '2026-10-02', amountCents: -1050, balanceAfterCents: 43950, description: 'Coffee Shop' },
        { line: 7, problem: 'CURRENCY', balanceAfterCents: null },
      ],
    })
    expect(result.ok && result.rows).toHaveLength(3)
  })
})
