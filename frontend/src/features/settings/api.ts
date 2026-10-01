import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { applyLanguage } from '@/i18n'
import { api } from '@/lib/api'
import { sessionStore, type User } from '@/lib/auth'

import { toAvatar } from './avatar'

export type UserChanges = Partial<Pick<User, 'name' | 'language' | 'timezone' | 'unit' | 'auto_rest'>>

/** Only the fields a request changed: a slower, older response can't undo a newer change. */
function mergeUser(fields: Partial<User>) {
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

/**
 * The photo as an object URL an <img> can show (it needs the session, so it is fetched, not
 * linked). A new photo is a new file id, so a URL never goes stale; it is kept for as long as
 * the page lives and released when its photo is replaced or removed (`forgetAvatar`).
 */
export const avatarQuery = (fileId: string) =>
  queryOptions({
    queryKey: ['avatar', fileId] as const,
    queryFn: async () => URL.createObjectURL(await api<Blob>(`/api/files/${fileId}/content`, { responseType: 'blob' })),
    staleTime: Infinity,
    gcTime: Infinity,
  })

function forgetAvatar(queryClient: QueryClient, fileId: string | null | undefined) {
  if (!fileId) return
  const { queryKey } = avatarQuery(fileId)
  const url = queryClient.getQueryData(queryKey)
  queryClient.removeQueries({ queryKey })
  if (url) URL.revokeObjectURL(url)
}

/** PUT /api/users/me/avatar with the picture cropped and scaled down here (`toAvatar`). */
export function useSetAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: Blob) => {
      const photo = await toAvatar(file)
      const body = new FormData()
      body.append('file', photo, 'avatar.jpg')
      return { photo, user: await api<User>('/api/users/me/avatar', { method: 'PUT', body }) }
    },
    onSuccess: ({ photo, user }) => {
      const previous = sessionStore.get()?.user.avatar_file_id
      // What was just sent is what the server has: no need to download it again.
      if (user.avatar_file_id) {
        queryClient.setQueryData(avatarQuery(user.avatar_file_id).queryKey, URL.createObjectURL(photo))
      }
      mergeUser({ avatar_file_id: user.avatar_file_id })
      if (previous !== user.avatar_file_id) forgetAvatar(queryClient, previous)
    },
  })
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<User>('/api/users/me/avatar', { method: 'DELETE' }),
    onSuccess: (user) => {
      const previous = sessionStore.get()?.user.avatar_file_id
      mergeUser({ avatar_file_id: user.avatar_file_id })
      forgetAvatar(queryClient, previous)
    },
  })
}
