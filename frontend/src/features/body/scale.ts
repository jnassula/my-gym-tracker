/** The browser's part of a weighing: finding the scale over Web Bluetooth and listening to it. */
import { isIos } from '@/lib/platform'

import { parseFrame, type Frame } from './scale-frame'
import type { ScaleError } from './weighing'

/** The standard Body Composition service and its measurement characteristic. */
const SERVICE = 0x181b
const MEASUREMENT = 0x2a9c
/** How the Mi Body Composition Scale 2 and 1 name themselves, for when the service isn't in
 * what they advertise. */
const NAMES = ['MIBFS', 'MIBCS']

/** Web Bluetooth exists in Chrome and Edge (Android and computers). No browser on an iPhone has
 * it: there the scale's weighings come through the Health app. */
export type ScaleSupport = 'supported' | 'ios' | 'unsupported'

export function scaleSupport(): ScaleSupport {
  if (navigator.bluetooth) return 'supported'
  return isIos() ? 'ios' : 'unsupported'
}

/** Thrown by `connectScale`, with why. */
export class ScaleConnectionError extends Error {
  readonly reason: ScaleError

  constructor(reason: ScaleError) {
    super(reason)
    this.reason = reason
  }
}

type Listeners = {
  onFrame: (frame: Frame) => void
  /** The scale went away (it switches itself off a few seconds after a weighing). */
  onDisconnect: () => void
}

/**
 * Opens the browser's device chooser (it needs a tap), connects to the scale and reports every
 * frame it sends. Resolves to a function that lets the scale go.
 */
export async function connectScale({ onFrame, onDisconnect }: Listeners): Promise<() => void> {
  const bluetooth = navigator.bluetooth
  if (!bluetooth || !(await bluetooth.getAvailability())) throw new ScaleConnectionError('unavailable')
  let device: BluetoothDevice
  try {
    device = await bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }, ...NAMES.map((namePrefix) => ({ namePrefix }))],
      optionalServices: [SERVICE],
    })
  } catch (error) {
    // Closing the chooser without picking a device rejects with NotFoundError.
    throw new ScaleConnectionError(error instanceof DOMException && error.name === 'NotFoundError' ? 'cancelled' : 'failed')
  }
  if (!device.gatt) throw new ScaleConnectionError('failed')
  const { gatt } = device
  try {
    const server = await gatt.connect()
    const service = await server.getPrimaryService(SERVICE)
    const measurement = await service.getCharacteristic(MEASUREMENT)
    const read = () => {
      const frame = measurement.value && parseFrame(measurement.value)
      if (frame) onFrame(frame)
    }
    measurement.addEventListener('characteristicvaluechanged', read)
    device.addEventListener('gattserverdisconnected', onDisconnect)
    await measurement.startNotifications()
    return () => {
      measurement.removeEventListener('characteristicvaluechanged', read)
      device.removeEventListener('gattserverdisconnected', onDisconnect)
      if (gatt.connected) gatt.disconnect()
    }
  } catch {
    if (gatt.connected) gatt.disconnect()
    throw new ScaleConnectionError('failed')
  }
}
