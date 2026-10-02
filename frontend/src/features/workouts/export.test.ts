import { describe, expect, it } from 'vitest'

import { exportUrl, fileNameOf } from './export'

describe('export', () => {
  it('asks for the weights only when wanted', () => {
    expect(exportUrl('p1', false)).toBe('/api/workouts/p1/export.pdf')
    expect(exportUrl('p1', true)).toBe('/api/workouts/p1/export.pdf?weights=true')
  })

  it('names the file like the server does', () => {
    expect(fileNameOf('Full body 3× semana')).toBe('Full body 3 semana.pdf')
    expect(fileNameOf('Treino 01 / fase A')).toBe('Treino 01  fase A.pdf')
    expect(fileNameOf('***')).toBe('treino.pdf')
  })
})
