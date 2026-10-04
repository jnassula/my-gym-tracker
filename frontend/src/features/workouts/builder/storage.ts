/**
 * The draft is saved on this device as it is edited ("Rascunho guardado automaticamente"),
 * so a closed tab or a phone call doesn't lose it. One draft at a time per account (someone
 * else signing in on this device doesn't find it); saving the plan or signing out clears it.
 */
import { sessionStore } from '@/lib/auth/session'

import type { BuilderDraft } from './draft'

/** Where the draft was kept before it was each account's own. */
const SHARED_KEY = 'mygymtracker-plan-draft'

export const draftKey = (userId: string) => `${SHARED_KEY}:${userId}`

function ownKey(): string | null {
  const user = sessionStore.get()?.user
  return user ? draftKey(user.id) : null
}

function looksLikeDraft(value: unknown): value is BuilderDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as Partial<BuilderDraft>
  return (
    draft.version === 1 &&
    typeof draft.name === 'string' &&
    Array.isArray(draft.days) &&
    draft.days.every((day) => Array.isArray(day.groups) && Array.isArray(day.exercises))
  )
}

export function loadDraft(): BuilderDraft | null {
  try {
    const key = ownKey()
    if (!key) return null
    // A draft from before the update is taken by whoever opens the app first after it.
    const shared = localStorage.getItem(SHARED_KEY)
    if (shared !== null) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, shared)
      localStorage.removeItem(SHARED_KEY)
    }
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return looksLikeDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(draft: BuilderDraft) {
  try {
    const key = ownKey()
    if (key) localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage full or disabled: the draft lives on in memory for this visit.
  }
}

export function clearDraft() {
  try {
    const key = ownKey()
    if (key) localStorage.removeItem(key)
  } catch {
    // Nothing to clear.
  }
}
