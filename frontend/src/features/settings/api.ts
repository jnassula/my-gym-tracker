import { useMutation, useQueryClient } from '@tanstack/react-query'

import { applyLanguage } from '@/i18n'
import { api } from '@/lib/api'
import { sessionStore, type User } from '@/lib/auth'

export type UserChanges = Partial<Pick<User, 'name' | 'language' | 'timezone' | 'unit' | 'auto_rest'>>

/** Only the fields a request changed: a slower, older response can't undo a newer change. */
function mergeUser(fields: UserChanges) {
  const current = sessionStore.get()
  if (current) sessionStore.set({ ...current, user: { ...current.user, ...fields } })
}

function pick(user: User, changes: UserChanges): UserChanges {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, user[key as keyof UserChanges]]))
}

/**
 * PATCH /api/users/me. The session's user changes at once (switches and toggles respond
 * immediately) and goes back if the server refuses.
 */
export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: UserChanges) => api<User>('/api/users/me', { method: 'PATCH', body: changes }),
    onMutate: (changes) => {
      const current = sessionStore.get()?.user
      const previous = current ? pick(current, changes) : undefined
      mergeUser(changes)
      if (changes.language) applyLanguage(changes.language)
      return { previous }
    },
    onError: (_error, changes, context) => {
      if (!context?.previous) return
      mergeUser(context.previous)
      if (changes.language && context.previous.language) applyLanguage(context.previous.language)
    },
    onSuccess: (user, changes) => {
      mergeUser(pick(user, changes))
      // "Today", the week and the calendar all move with the time zone.
      if (changes.timezone) return queryClient.invalidateQueries()
    },
  })
}
