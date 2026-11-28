import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationES from './locales/es/translation.json';
import translationEN from './locales/en/translation.json';

const resources = {
  es: {
    translation: translationES
  },
  en: {
    translation: translationEN
  }
};

const languagePreference = 'taller_language';

function getInitialLanguage() {
  try {
    return localStorage.getItem(languagePreference) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  try {
    localStorage.setItem(languagePreference, language);
  } catch {
    // The language still works when browser storage is unavailable.
  }
});

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    supportedLngs: ['es', 'en'],
    fallbackLng: "es",
    interpolation: {
      escapeValue: false // no es necesario para react ya que escapa por defecto
    }
  });

export default i18n;

export function displayLocale() {
  return i18n.resolvedLanguage === 'en' ? 'en-US' : 'es-CO';
}
