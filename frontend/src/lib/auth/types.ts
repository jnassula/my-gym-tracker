import type { Language } from '@/i18n'

export type User = {
  id: string
  email: string
  name: string
  language: Language
  timezone: string
  unit: 'kg' | 'lb'
  /** "Descanso automático": logging a set starts the rest timer. */
  auto_rest: boolean
  /** The profile photo's file (its bytes: /api/files/{id}/content); a new photo is a new id. */
  avatar_file_id: string | null
  created_at: string
  /** May open the backoffice (/admin); the API checks again on every call. */
  is_admin: boolean
  /** Optional, for the body composition of a scale's weighing (features/body). */
  height_cm: number | null
  birth_date: string | null
  sex: 'male' | 'female' | null
}

export type AuthResponse = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export type AccessTokenResponse = Omit<AuthResponse, 'user'>
