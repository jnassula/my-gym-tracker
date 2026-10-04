import { describe, expect, it } from 'vitest'

import { appUrl } from './app-url'

const ORIGIN = 'https://gym.example.com'

describe('appUrl', () => {
  it('keeps a path of the app', () => {
    expect(appUrl('/settings/notifications', ORIGIN)).toBe('/settings/notifications')
    expect(appUrl('/progress?range=4w#chart', ORIGIN)).toBe('/progress?range=4w#chart')
    expect(appUrl(`${ORIGIN}/workouts`, ORIGIN)).toBe('/workouts')
  })

  it.each([
    'https://attacker.example/login',
    '//attacker.example',
    '/\\attacker.example',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://gym.example.com.attacker.example/',
  ])('opens the app itself instead of %s', (url) => {
    expect(appUrl(url, ORIGIN)).toBe('/')
  })

  it('opens the app itself when the push says nothing usable', () => {
    expect(appUrl(undefined, ORIGIN)).toBe('/')
    expect(appUrl(42, ORIGIN)).toBe('/')
    expect(appUrl('http://[', ORIGIN)).toBe('/')
  })
})
