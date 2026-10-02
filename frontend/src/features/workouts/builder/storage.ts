/**
 * The draft is saved on this device as it is edited ("Rascunho guardado automaticamente"),
 * so a closed tab or a phone call doesn't lose it. One draft at a time; saving the plan
 * clears it.
 */
import type { BuilderDraft } from './draft'

export const DRAFT_KEY = 'mygymtracker-plan-draft'

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
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return looksLikeDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(draft: BuilderDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Storage full or disabled: the draft lives on in memory for this visit.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}
