import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

import i18n from '@/i18n'

// Recharts' ResponsiveContainer watches its size; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Tests assert on the Portuguese copy regardless of jsdom's navigator.language.
beforeAll(async () => {
  await i18n.changeLanguage('pt')
})

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
})
