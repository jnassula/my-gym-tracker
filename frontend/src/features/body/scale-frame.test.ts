import { describe, expect, it } from 'vitest'

import { parseFrame } from './scale-frame'

/** A frame as the scale sends it: unit, control, seven bytes of its clock, impedance, weight. */
function frame(unit: number, control: number, impedance: number, weight: number): DataView {
  const bytes = new Uint8Array([unit, control, 0xea, 0x07, 9, 28, 18, 30, 0, 0, 0, 0, 0])
  const view = new DataView(bytes.buffer)
  view.setUint16(9, impedance, true)
  view.setUint16(11, weight, true)
  return view
}

describe('parseFrame', () => {
  it('reads a settled weight in kg with its impedance', () => {
    // 78.45 kg × 200, 480 Ω, settled with an impedance.
    expect(parseFrame(frame(0x02, 0x26, 480, 15690))).toEqual({
      weightKg: 78.45,
      impedance: 480,
      stable: true,
      removed: false,
    })
  })

  it('reads the weight while it is still moving', () => {
    expect(parseFrame(frame(0x02, 0x04, 0, 15000))).toEqual({
      weightKg: 75,
      impedance: null,
      stable: false,
      removed: false,
    })
  })

  it('has no impedance when the scale measured none', () => {
    // Settled, but with shoes on: the bit is off, or the value is out of range.
    expect(parseFrame(frame(0x02, 0x24, 480, 15690))?.impedance).toBeNull()
    expect(parseFrame(frame(0x02, 0x26, 0, 15690))?.impedance).toBeNull()
    expect(parseFrame(frame(0x02, 0x26, 0xfffe, 15690))?.impedance).toBeNull()
  })

  it('turns a scale set to pounds or jin into kg', () => {
    // 172.95 lb × 100 and 156.9 jin × 100: both 78.45 kg.
    expect(parseFrame(frame(0x03, 0x26, 480, 17295))?.weightKg).toBe(78.45)
    expect(parseFrame(frame(0x12, 0x26, 480, 15690))?.weightKg).toBe(78.45)
  })

  it('says when the person stepped off', () => {
    expect(parseFrame(frame(0x02, 0xa6, 480, 15690))?.removed).toBe(true)
  })

  it('ignores anything shorter than the scale’s frame', () => {
    expect(parseFrame(new DataView(new ArrayBuffer(10)))).toBeNull()
  })

  it('reads a frame that sits inside a larger buffer', () => {
    const bytes = new Uint8Array(20)
    bytes.set(new Uint8Array(frame(0x02, 0x26, 480, 15690).buffer), 4)

    expect(parseFrame(new DataView(bytes.buffer, 4, 13))?.weightKg).toBe(78.45)
  })
})
