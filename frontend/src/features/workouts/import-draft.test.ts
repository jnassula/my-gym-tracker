import { describe, expect, it } from 'vitest'

import { draftFromPreview, draftReducer, toPlanCreate, type Draft } from './import-draft'
import type { ExercisePreview, ImportPreview } from './types'

function exercise(name: string, overrides: Partial<ExercisePreview> = {}): ExercisePreview {
  return {
    name,
    muscle_group: 'chest',
    sets: 3,
    reps: '12',
    rest_seconds: 90,
    rest_max_seconds: null,
    notes: '3x12 Rm',
    warnings: [],
    ...overrides,
  }
}

const preview: ImportPreview = {
  file_id: 'file-1',
  filename: 'Treino 07.pdf',
  name: 'Treino 07',
  valid_until: '2026-04-15',
  rest_days: [2],
  days: [
    {
      weekday: 1,
      label: 'Peitoral e Ombros',
      exercises: [
        exercise('Esteira', { muscle_group: 'warmup', sets: null, reps: '30 min' }),
        exercise('Supino'),
        exercise('Elevação Lateral', { muscle_group: 'shoulders' }),
        exercise('Crucifixo', { warnings: ['technique_sets'] }),
        exercise('Graviton', { muscle_group: null, warnings: ['unknown_muscle_group'] }),
      ],
    },
    { weekday: 4, label: 'Costas', exercises: [exercise('Remada', { muscle_group: 'back' })] },
  ],
}

const names = (draft: Draft, day = 0) => draft.days[day].exercises.map((e) => e.name)
const key = (draft: Draft, day: number, name: string) =>
  draft.days[day].exercises.find((e) => e.name === name)!.key

describe('import draft', () => {
  it('starts from the preview with every day unreviewed', () => {
    const draft = draftFromPreview(preview)

    expect(draft.days.map((d) => [d.weekday, d.reviewed])).toEqual([
      [1, false],
      [4, false],
    ])
    expect(new Set(draft.days.flatMap((d) => d.exercises.map((e) => e.key))).size).toBe(6)
  })

  it('editing an exercise resolves its warnings', () => {
    const draft = draftFromPreview(preview)
    const day = draft.days[0].key
    const crucifixo = key(draft, 0, 'Crucifixo')

    const next = draftReducer(draft, {
      type: 'update-exercise',
      day,
      exercise: crucifixo,
      fields: { ...exercise('Crucifixo Polia Alta'), sets: 4 },
    })

    const updated = next.days[0].exercises[3]
    expect([updated.name, updated.sets, updated.warnings, updated.key]).toEqual([
      'Crucifixo Polia Alta',
      4,
      [],
      crucifixo,
    ])
  })

  it('moves an exercise to another day and group', () => {
    const draft = draftFromPreview(preview)

    const next = draftReducer(draft, {
      type: 'move-exercise',
      day: draft.days[0].key,
      exercise: key(draft, 0, 'Graviton'),
      toDay: draft.days[1].key,
      toGroup: 'back',
    })

    expect(names(next, 0)).not.toContain('Graviton')
    expect(next.days[1].exercises.map((e) => [e.name, e.muscle_group, e.warnings])).toEqual([
      ['Remada', 'back', []],
      ['Graviton', 'back', []],
    ])
  })

  it('changing group within the same day keeps the position', () => {
    const draft = draftFromPreview(preview)
    const day = draft.days[0].key

    const next = draftReducer(draft, {
      type: 'move-exercise',
      day,
      exercise: key(draft, 0, 'Supino'),
      toDay: day,
      toGroup: 'shoulders',
    })

    expect(names(next)).toEqual(names(draft))
    expect(next.days[0].exercises[1].muscle_group).toBe('shoulders')
  })

  it('shifts within the muscle group, skipping other groups', () => {
    const draft = draftFromPreview(preview)
    const day = draft.days[0].key

    const down = draftReducer(draft, {
      type: 'shift-exercise',
      day,
      exercise: key(draft, 0, 'Supino'),
      direction: 1,
    })
    const stuck = draftReducer(draft, {
      type: 'shift-exercise',
      day,
      exercise: key(draft, 0, 'Supino'),
      direction: -1,
    })

    // Supino swaps with Crucifixo (next chest exercise), jumping over Elevação Lateral.
    expect(names(down)).toEqual(['Esteira', 'Crucifixo', 'Elevação Lateral', 'Supino', 'Graviton'])
    expect(names(stuck)).toEqual(names(draft))
  })

  it('adds and deletes exercises', () => {
    const draft = draftFromPreview(preview)
    const day = draft.days[1].key

    const added = draftReducer(draft, { type: 'add-exercise', day, fields: exercise('Pullover') })
    const removed = draftReducer(added, {
      type: 'delete-exercise',
      day,
      exercise: key(added, 1, 'Remada'),
    })

    expect(names(added, 1)).toEqual(['Remada', 'Pullover'])
    expect(names(removed, 1)).toEqual(['Pullover'])
  })

  it('builds the create body, dropping emptied days and client-only fields', () => {
    let draft = draftFromPreview(preview)
    draft = draftReducer(draft, { type: 'rename-plan', name: '  Setembro  ' })
    draft = draftReducer(draft, {
      type: 'delete-exercise',
      day: draft.days[1].key,
      exercise: key(draft, 1, 'Remada'),
    })

    const body = toPlanCreate(draft)

    expect(body.name).toBe('Setembro')
    expect(body.source_file_id).toBe('file-1')
    expect(body.activate).toBe(true)
    expect(body.days).toHaveLength(1)
    expect(Object.keys(body.days[0].exercises[0]).sort()).toEqual([
      'muscle_group',
      'name',
      'notes',
      'reps',
      'rest_max_seconds',
      'rest_seconds',
      'sets',
    ])
  })
})
