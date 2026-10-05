import { describe, expect, it } from 'vitest'

import { completeWeek } from '@/features/training/plan'

import { avoided, isOn } from './rules'
import type { PlanDayRegions } from './types'

const planDays: PlanDayRegions[] = [
  { day_id: 'a', label: 'Treino A', weekday: null, regions: ['upper'] },
  { day_id: 'b', label: 'Treino B', weekday: null, regions: ['lower'] },
  { day_id: 'c', label: 'Treino C', weekday: null, regions: ['core'] },
  { day_id: 'd', label: 'Full body', weekday: null, regions: ['upper', 'lower'] },
  { day_id: 'e', label: 'Mobilidade', weekday: null, regions: [] },
]

describe('avoided', () => {
  const labels = (avoid: Parameters<typeof avoided>[1]) => avoided(planDays, avoid).map((day) => day.label)

  it('is the plan’s days that work a region the activity avoids', () => {
    expect(labels(['lower'])).toEqual(['Treino B', 'Full body']) // footvolley
    expect(labels(['upper'])).toEqual(['Treino A', 'Full body']) // surf
    expect(labels(['upper', 'core'])).toEqual(['Treino A', 'Treino C', 'Full body'])
  })

  it('is none for an activity that avoids nothing', () => {
    expect(labels([])).toEqual([])
  })
})

describe('the week’s activities', () => {
  const week = completeWeek({
    today: '2026-09-30',
    week_start: '2026-09-28',
    days: [],
    activities: [
      { activity_id: 'surf', name: 'Surf', date: '2026-09-28', fixed: false },
      { activity_id: 'footvolley', name: 'Futevôlei', date: '2026-09-30', fixed: true },
      { activity_id: 'surf', name: 'Surf', date: '2026-09-30', fixed: false },
    ],
  })

  it('says whether an activity is on a date', () => {
    expect(isOn(week, 'surf', '2026-09-28')).toBe(true)
    expect(isOn(week, 'footvolley', '2026-09-28')).toBe(false)
    expect(isOn(week, 'surf', '2026-09-29')).toBe(false)
  })
})
