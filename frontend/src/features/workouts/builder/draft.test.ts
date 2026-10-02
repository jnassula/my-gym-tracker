import { describe, expect, it } from 'vitest'

import type { Plan } from '../types'
import {
  averageMinutes,
  builderReducer,
  canSave,
  draftFromPlan,
  emptyDraft,
  estimateMinutes,
  groupsOf,
  labelOf,
  newExercise,
  notesOf,
  structureOf,
  toPlanCreate,
  type BuilderAction,
  type BuilderDraft,
} from './draft'
import { STRUCTURES } from './templates'

const wording = {
  group: (group: string) => `g:${group}`,
  technique: (technique: string) => `t:${technique}`,
}

function run(draft: BuilderDraft, ...actions: BuilderAction[]) {
  return actions.reduce(builderReducer, draft)
}

/** Monday and Wednesday, Monday with a warm-up and a chest exercise. */
function seeded() {
  const base = run(emptyDraft('Full body'), { type: 'toggle-weekday', weekday: 2 }, { type: 'toggle-weekday', weekday: 0 })
  const monday = base.days[0]
  return run(
    base,
    { type: 'add-exercise', day: monday.key, exercise: { ...newExercise('Esteira', 'warmup'), key: 'warm' } },
    { type: 'add-exercise', day: monday.key, exercise: { ...newExercise('Supino Reto', 'chest'), key: 'bench' } },
  )
}

describe('builderReducer', () => {
  it('toggles training days and keeps them in weekday order', () => {
    const draft = seeded()
    expect(draft.days.map((day) => day.weekday)).toEqual([0, 2])
    const without = builderReducer(draft, { type: 'toggle-weekday', weekday: 0 })
    expect(without.days.map((day) => day.weekday)).toEqual([2])
  })

  it('adding an exercise creates its group card; the card survives the exercise', () => {
    const draft = seeded()
    const monday = draft.days[0]
    expect(monday.groups).toEqual(['warmup', 'chest'])
    const deleted = builderReducer(draft, { type: 'delete-exercise', day: monday.key, exercise: 'bench' })
    expect(deleted.days[0].groups).toEqual(['warmup', 'chest'])
    expect(groupsOf(deleted.days[0])).toEqual([
      { group: 'warmup', exercises: [expect.objectContaining({ key: 'warm' })] },
      { group: 'chest', exercises: [] },
    ])
  })

  it('removing a group removes its exercises too', () => {
    const draft = seeded()
    const monday = draft.days[0]
    const next = builderReducer(draft, { type: 'remove-group', day: monday.key, group: 'chest' })
    expect(next.days[0].groups).toEqual(['warmup'])
    expect(next.days[0].exercises.map((e) => e.key)).toEqual(['warm'])
  })

  it('moving an exercise to another day appends it there under its new group', () => {
    const draft = seeded()
    const [monday, wednesday] = draft.days
    const next = builderReducer(draft, {
      type: 'move-exercise',
      day: monday.key,
      exercise: 'bench',
      toDay: wednesday.key,
      toGroup: 'shoulders',
    })
    expect(next.days[0].exercises.map((e) => e.key)).toEqual(['warm'])
    expect(next.days[1].groups).toEqual(['shoulders'])
    expect(next.days[1].exercises[0]).toMatchObject({ key: 'bench', muscle_group: 'shoulders' })
  })

  it('copies a day over another, with fresh keys', () => {
    const draft = seeded()
    const [monday, wednesday] = draft.days
    const next = builderReducer(draft, { type: 'copy-day', day: monday.key, toDay: wednesday.key })
    expect(next.days[1].groups).toEqual(['warmup', 'chest'])
    expect(next.days[1].exercises.map((e) => e.name)).toEqual(['Esteira', 'Supino Reto'])
    expect(next.days[1].exercises.map((e) => e.key)).not.toContain('bench')
  })

  it('lays a template over the days, cycling when it is shorter', () => {
    const fourDays = run(
      emptyDraft(),
      ...([0, 1, 3, 4] as const).map((weekday) => ({ type: 'toggle-weekday', weekday }) as const),
    )
    const next = builderReducer(fourDays, { type: 'apply-structure', structure: STRUCTURES.ppl })
    expect(next.days.map((day) => day.groups[1])).toEqual(['chest', 'back', 'quads', 'chest'])
  })

  it('a structure never drops a group an exercise already uses', () => {
    const draft = seeded()
    const next = builderReducer(draft, { type: 'apply-structure', structure: [{ groups: ['back'] }] })
    expect(next.days[0].groups).toEqual(['back', 'warmup', 'chest'])
  })

  it('shifts an exercise within its group only', () => {
    const start = seeded()
    const monday = start.days[0]
    const draft = builderReducer(start, {
      type: 'add-exercise',
      day: monday.key,
      exercise: { ...newExercise('Crucifixo', 'chest'), key: 'fly' },
    })
    const next = builderReducer(draft, { type: 'shift-exercise', day: monday.key, exercise: 'fly', direction: -1 })
    expect(next.days[0].exercises.map((e) => e.key)).toEqual(['warm', 'fly', 'bench'])
  })
})

describe('toPlanCreate', () => {
  it('sends exercises in card order, labels the day by its groups and leaves empty days out', () => {
    const start = seeded()
    const draft = builderReducer(start, {
      type: 'update-exercise',
      day: start.days[0].key,
      exercise: { ...newExercise('Supino Reto', 'chest'), key: 'bench', techniques: ['drop_set'], notes: 'pegada larga' },
    })
    const body = toPlanCreate(draft, wording, true)
    expect(body).toMatchObject({ name: 'Full body', source_file_id: null, valid_until: null, activate: true })
    expect(body.days).toHaveLength(1)
    expect(body.days[0]).toMatchObject({ weekday: 0, label: 'g:chest' })
    expect(body.days[0].exercises.map((e) => e.name)).toEqual(['Esteira', 'Supino Reto'])
    expect(body.days[0].exercises[1]).toMatchObject({
      sets: 3,
      reps: '12',
      rest_seconds: 90,
      notes: 't:drop_set · pegada larga',
    })
    expect(body.days[0].exercises[1]).not.toHaveProperty('key')
  })

  it('needs a name and at least one exercise', () => {
    expect(canSave(seeded())).toBe(true)
    expect(canSave({ ...seeded(), name: ' ' })).toBe(false)
    expect(canSave(emptyDraft('x'))).toBe(false)
  })

  it('notes are null without techniques or text', () => {
    expect(notesOf(newExercise('a', 'abs'), wording)).toBeNull()
    expect(labelOf(seeded().days[1], wording)).toBe('')
  })
})

describe('estimates', () => {
  it('rounds a session to 5 minutes: each set is 45 s of work plus its rest', () => {
    const day = seeded().days[0]
    // Two exercises × 3 sets × (45 + 90) s = 810 s ≈ 13.5 min → 15.
    expect(estimateMinutes(day)).toBe(15)
    expect(averageMinutes(seeded())).toBe(15)
    expect(averageMinutes(emptyDraft())).toBeNull()
  })
})

const plan: Plan = {
  id: 'plan-1',
  name: 'Treino 01',
  is_active: true,
  valid_until: '2026-12-15',
  source_file_id: 'file-1',
  created_at: '2026-09-28T10:00:00Z',
  days: [
    {
      id: 'day-a',
      weekday: null,
      label: 'A',
      position: 0,
      exercises: [
        { id: 'e1', position: 0, name: 'Agachamento', muscle_group: 'quads', sets: 4, reps: '10', rest_seconds: 120, rest_max_seconds: null, notes: null },
        { id: 'e2', position: 1, name: 'Stiff', muscle_group: 'hamstrings', sets: 3, reps: '12', rest_seconds: 90, rest_max_seconds: null, notes: '3x12 Rm' },
      ],
    },
    {
      id: 'day-b',
      weekday: null,
      label: 'B',
      position: 1,
      exercises: [
        { id: 'e3', position: 0, name: 'Supino', muscle_group: null, sets: null, reps: null, rest_seconds: null, rest_max_seconds: null, notes: null },
      ],
    },
  ],
}

describe('from an existing plan', () => {
  it('duplicates a rotating plan onto Monday onwards, without ids', () => {
    const draft = draftFromPlan(plan, 'Treino 01 (cópia)')
    expect(draft.name).toBe('Treino 01 (cópia)')
    expect(draft.validUntil).toBeNull()
    expect(draft.days.map((day) => day.weekday)).toEqual([0, 1])
    expect(draft.days[0].groups).toEqual(['quads', 'hamstrings'])
    expect(draft.days[0].exercises[0]).toMatchObject({ name: 'Agachamento', sets: 4, reps: '10', techniques: [] })
    expect(draft.days[0].exercises[0]).not.toHaveProperty('id')
    // No group becomes "other", so it has a card to live under.
    expect(draft.days[1].exercises[0].muscle_group).toBe('other')
  })

  it('takes the structure of a plan: its groups per day, no exercises', () => {
    expect(structureOf(plan)).toEqual([{ groups: ['quads', 'hamstrings'] }, { groups: ['other'] }])
  })
})
