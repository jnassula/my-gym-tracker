import { describe, expect, it } from 'vitest'

import { filterOrder, fold, isNewName, search, type LibraryEntry } from './library'

const entry = (name: string, group: LibraryEntry['muscle_group'], source: LibraryEntry['source'] = 'base'): LibraryEntry => ({
  name,
  muscle_group: group,
  source,
  plan_name: source === 'plan' ? 'Treino 01' : null,
  last_weight: null,
})

const entries = [
  entry('Remada Curvada Livre', 'back', 'plan'),
  entry('Remada Baixa', 'back'),
  entry('Remada Alta com Barra', 'shoulders'),
  entry('Gémeos em Pé', 'calves'),
  entry('Supino Reto com Barra', 'chest'),
]

describe('library search', () => {
  it('ignores accents and case', () => {
    expect(fold('Gémeos em Pé')).toBe('gemeos em pe')
    expect(search(entries, 'GEMEOS', 'all').map((e) => e.name)).toEqual(['Gémeos em Pé'])
  })

  it('needs every word, in any order', () => {
    expect(search(entries, 'barra remada', 'all').map((e) => e.name)).toEqual(['Remada Alta com Barra'])
  })

  it('shows the chosen group alone without a query, and first with one', () => {
    expect(search(entries, '', 'back').map((e) => e.name)).toEqual(['Remada Curvada Livre', 'Remada Baixa'])
    expect(search(entries, 'rem', 'back').map((e) => e.name)).toEqual([
      'Remada Curvada Livre',
      'Remada Baixa',
      'Remada Alta com Barra',
    ])
  })

  it('"mine" is what came from the user’s plans', () => {
    expect(search(entries, '', 'mine').map((e) => e.name)).toEqual(['Remada Curvada Livre'])
  })

  it('offers a custom exercise only for a name not in the list', () => {
    expect(isNewName(entries, 'remada baixa')).toBe(false)
    expect(isNewName(entries, 'Remada Unilateral')).toBe(true)
    expect(isNewName(entries, '  ')).toBe(false)
  })

  it('orders the chips: chosen group, all, the others, mine', () => {
    expect(filterOrder(['chest', 'back', 'calves'], 'back')).toEqual(['back', 'all', 'chest', 'calves', 'mine'])
    expect(filterOrder(['chest', 'back'], null)).toEqual(['all', 'chest', 'back', 'mine'])
  })
})
