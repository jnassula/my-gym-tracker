/**
 * One notification from a Xiaomi Mi Body Composition Scale (pure).
 *
 * The scale uses the standard Body Composition service (0x181B, characteristic 0x2A9C) but fills
 * it with its own 13 bytes, as openScale, lolouk44/xiaomi_mi_scale and others have worked out:
 *
 *   0      unit: bit 0 = lb, bit 4 = jin (catty), otherwise kg
 *   1      control: bit 1 = an impedance was measured, bit 5 = the weight has settled,
 *          bit 7 = the person stepped off
 *   2–8    the scale's own date and time (often wrong, not used)
 *   9–10   impedance in ohms, little-endian
 *   11–12  weight, little-endian: kg × 200, or lb or jin × 100
 */

export type Frame = {
  /** Always kg, to the 2 decimals the API stores. */
  weightKg: number
  /** Ohms, when the scale measured one (bare feet on the electrodes). */
  impedance: number | null
  /** The weight has settled: this is the reading. */
  stable: boolean
  /** The person stepped off the scale. */
  removed: boolean
}

const LENGTH = 13
const KG_PER_LB = 0.45359237
const KG_PER_JIN = 0.5
/** The scale sends this, or zero, when it could not measure (shoes, socks). */
const MAX_IMPEDANCE = 3000

export function parseFrame(data: DataView): Frame | null {
  if (data.byteLength < LENGTH) return null
  const unit = data.getUint8(0)
  const control = data.getUint8(1)
  const raw = data.getUint16(11, true)
  const kg = unit & 0x01 ? (raw / 100) * KG_PER_LB : unit & 0x10 ? (raw / 100) * KG_PER_JIN : raw / 200
  const impedance = data.getUint16(9, true)
  const measured = (control & 0x02) !== 0 && impedance > 0 && impedance < MAX_IMPEDANCE
  return {
    weightKg: Math.round(kg * 100) / 100,
    impedance: measured ? impedance : null,
    stable: (control & 0x20) !== 0,
    removed: (control & 0x80) !== 0,
  }
}
