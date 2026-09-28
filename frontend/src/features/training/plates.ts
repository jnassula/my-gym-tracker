/** Plate maths for a barbell (pure). Weights are in the unit on screen. */
import type { Unit } from './weight'

/** Common gym plates, heaviest first. */
export const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

/** Olympic, women's and technique bars. */
export const BARS: Record<Unit, number[]> = { kg: [20, 15, 10], lb: [45, 35, 25] }

export type PlateLoad = {
  /** Per side, heaviest first. */
  plates: Array<{ weight: number; count: number }>
  /** Per side, what these plates can't make (0 when exact). */
  remainder: number
  belowBar: boolean
}

/** Plates per side to load `total` on `bar`: heaviest first, as done at the rack. */
export function platesPerSide(total: number, bar: number, unit: Unit): PlateLoad {
  if (total < bar) return { plates: [], remainder: 0, belowBar: true }
  // Hundredths keep 2.5 + 1.25 sums exact.
  let left = Math.round(((total - bar) / 2) * 100)
  const plates = []
  for (const plate of PLATES[unit]) {
    const size = Math.round(plate * 100)
    const count = Math.floor(left / size)
    if (count > 0) {
      plates.push({ weight: plate, count })
      left -= count * size
    }
  }
  return { plates, remainder: left / 100, belowBar: false }
}
