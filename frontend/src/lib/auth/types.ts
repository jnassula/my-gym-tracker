import type { Language } from '@/i18n'

export type User = {
  id: string
  email: string
  name: string
  language: Language
  timezone: string
  unit: 'kg' | 'lb'
  created_at: string
}

export type AuthResponse = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export type AccessTokenResponse = Omit<AuthResponse, 'user'>
