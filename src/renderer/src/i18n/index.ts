import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import el from './el.json'
import en from './en.json'
import { setDateLanguage } from '../lib/date-format'
import { setMoneyLanguage } from '../../../shared/money'

// Month names in formatted dates and the money format follow the app language;
// registered before init so they run ahead of the components re-rendering on a language change.
i18next.on('languageChanged', lang => {
  setDateLanguage(lang)
  setMoneyLanguage(lang)
})

function storedLanguage(): string {
  try {
    return localStorage.getItem('lang') ?? 'el'
  } catch {
    return 'el'
  }
}

i18next.use(initReactI18next).init({
  resources: {
    el: { translation: el },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: 'el',
  interpolation: { escapeValue: false },
})

export default i18next
