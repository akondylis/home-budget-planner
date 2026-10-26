import { prisma } from '../db/prisma'
import { isDateFormat, setDateFormat, setDateLanguage } from '../../shared/date-format'
import { setMoneyLanguage } from '../../shared/money'

export type AppLanguage = 'el' | 'en'

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'el' || value === 'en'
}

/** The single settings row (id 1); created on first launch. */
export async function ensureSettings() {
  return prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
}

/** Applies the stored language and date format to main-process formatting (exports, reports); returns the settings. */
export async function applyStoredFormatting() {
  const settings = await ensureSettings()
  setDateFormat(settings.dateFormat)
  setDateLanguage(settings.language)
  setMoneyLanguage(settings.language)
  return settings
}

export function getSettings() {
  return prisma.appSettings.findUnique({ where: { id: 1 } })
}

/** Throws: 'INVALID_LANGUAGE' */
export async function setLanguage(lang: unknown): Promise<void> {
  if (!isAppLanguage(lang)) throw new Error('INVALID_LANGUAGE')
  await prisma.appSettings.update({ where: { id: 1 }, data: { language: lang } })
  setDateLanguage(lang)
  setMoneyLanguage(lang)
}

/** Throws: 'INVALID_DATE_FORMAT' */
export async function saveDateFormat(format: unknown): Promise<void> {
  if (!isDateFormat(format)) throw new Error('INVALID_DATE_FORMAT')
  await prisma.appSettings.update({ where: { id: 1 }, data: { dateFormat: format } })
  setDateFormat(format)
}
