import { describe, expect, it } from 'vitest'

import { platesPerSide } from './plates'

describe('plates per side', () => {
  it('loads the heaviest plates first', () => {
    // (95 − 20) / 2 = 37,5 per side.
    expect(platesPerSide(95, 20, 'kg')).toEqual({
      plates: [
        { weight: 25, count: 1 },
        { weight: 10, count: 1 },
        { weight: 2.5, count: 1 },
      ],
      remainder: 0,
      belowBar: false,
    })
    expect(platesPerSide(140, 20, 'kg').plates).toEqual([{ weight: 25, count: 2 }, { weight: 10, count: 1 }])
    expect(platesPerSide(22.5, 20, 'kg').plates).toEqual([{ weight: 1.25, count: 1 }])
  })

  it('uses the bar chosen and lb plates for lb users', () => {
    expect(platesPerSide(95, 15, 'kg').plates).toEqual([{ weight: 25, count: 1 }, { weight: 15, count: 1 }])
    expect(platesPerSide(225, 45, 'lb').plates).toEqual([{ weight: 45, count: 2 }])
  })

  it('says when the plates cannot make the weight or it is just the bar', () => {
    expect(platesPerSide(21, 20, 'kg')).toEqual({ plates: [], remainder: 0.5, belowBar: false })
    expect(platesPerSide(20, 20, 'kg')).toEqual({ plates: [], remainder: 0, belowBar: false })
    expect(platesPerSide(15, 20, 'kg').belowBar).toBe(true)
  })
})
