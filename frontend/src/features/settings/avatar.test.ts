import { describe, expect, it } from 'vitest'

import { centredSquare } from './avatar'

describe('centredSquare', () => {
  it('takes the middle of a landscape picture', () => {
    expect(centredSquare(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 })
  })

  it('takes the middle of a portrait picture', () => {
    expect(centredSquare(1080, 1921)).toEqual({ x: 0, y: 420, side: 1080 })
  })

  it('keeps a square as it is', () => {
    expect(centredSquare(512, 512)).toEqual({ x: 0, y: 0, side: 512 })
  })
})
