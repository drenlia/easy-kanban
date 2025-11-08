import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import commonEn from './locales/en/common.json';
import commonFr from './locales/fr/common.json';
import authEn from './locales/en/auth.json';
import authFr from './locales/fr/auth.json';
import tasksEn from './locales/en/tasks.json';
import tasksFr from './locales/fr/tasks.json';
import adminEn from './locales/en/admin.json';
import adminFr from './locales/fr/admin.json';

i18n
  .use(LanguageDetector) // Detects user language from browser
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources: {
      en: {
        common: commonEn,
        auth: authEn,
        tasks: tasksEn,
        admin: adminEn,
      },
      fr: {
        common: commonFr,
        auth: authFr,
        tasks: tasksFr,
        admin: adminFr,
      },
    },
    fallbackLng: 'en', // Default language
    defaultNS: 'common', // Default namespace
    ns: ['common', 'auth', 'tasks', 'admin'], // Available namespaces
    
    // Supported languages
    supportedLngs: ['en', 'fr'],
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    detection: {
      // Detection order: localStorage (user's explicit choice) -> browser language -> fallback to 'en'
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      // Only detect languages we support
      checkWhitelist: true,
      // Convert browser language codes to our supported languages
      convertDetectedLanguage: (lng: string) => {
        // Map browser language to supported languages
        if (lng.toLowerCase().startsWith('fr')) {
          return 'fr';
        }
        // Default to English for all other languages
        return 'en';
      },
    },
  });

export default i18n;

