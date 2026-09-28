import 'i18next'

import type pt from './locales/pt.json'

// Typed translation keys: t('auth.login.titel') is a compile error.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof pt }
  }
}
