import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { sessionStore } from '@/lib/auth/session'
import { user } from '@/test/render'

import { emptyDraft } from './draft'
import { clearDraft, draftKey, loadDraft, saveDraft } from './storage'

const other = { ...user, id: '00000000-0000-4000-8000-000000000002', email: 'rui@example.pt' }
const draft = { ...emptyDraft(), name: 'Full body' }

const signIn = (account: typeof user | typeof other) =>
  sessionStore.set({ accessToken: 'access-1', user: account })

beforeEach(() => signIn(user))

afterEach(() => {
  localStorage.clear()
  sessionStore.set(null)
})

describe('the plan draft on this device', () => {
  it('is kept and found again by the account that wrote it', () => {
    saveDraft(draft)

    expect(loadDraft()?.name).toBe('Full body')
    expect(localStorage.getItem(draftKey(user.id))).not.toBeNull()
  })

  it('is not there for another account, and comes back for its own', () => {
    saveDraft(draft)

    signIn(other)
    expect(loadDraft()).toBeNull()
    clearDraft() // the other account discarding its own (none) leaves this one alone

    signIn(user)
    expect(loadDraft()?.name).toBe('Full body')
  })

  it('is nobody’s without a session', () => {
    saveDraft(draft)
    sessionStore.set(null)

    expect(loadDraft()).toBeNull()
    saveDraft({ ...draft, name: 'Sem sessão' })
    signIn(user)
    expect(loadDraft()?.name).toBe('Full body')
  })

  it('takes over the draft kept before each account had its own', () => {
    localStorage.setItem('mygymtracker-plan-draft', JSON.stringify(draft))

    expect(loadDraft()?.name).toBe('Full body')
    expect(localStorage.getItem('mygymtracker-plan-draft')).toBeNull()
    signIn(other)
    expect(loadDraft()).toBeNull()
  })
})
