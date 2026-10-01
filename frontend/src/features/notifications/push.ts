/** This browser's side of Web Push: support, permission and the device's subscription. */

import { isIos } from '@/lib/platform'

const DEVICE_KEY = 'mygymtracker-push-endpoint'

export type PushSupport = 'supported' | 'unsupported' | 'ios-install' | 'denied'

function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!capable) return isIos() && !isInstalled() ? 'ios-install' : 'unsupported'
  return Notification.permission === 'denied' ? 'denied' : 'supported'
}

/** The applicationServerKey (base64url) as the bytes PushManager wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
  const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** Asks for permission and subscribes; returns what the backend needs, or null if refused. */
export async function subscribeDevice(publicKey: string): Promise<PushSubscriptionJSON | null> {
  if ((await Notification.requestPermission()) !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  })
  rememberDevice(subscription.endpoint)
  return subscription.toJSON()
}

/** Unsubscribes this browser; returns the endpoint to forget on the server. */
export async function unsubscribeDevice(): Promise<string | null> {
  const subscription = await currentSubscription()
  rememberDevice(null)
  if (!subscription) return null
  await subscription.unsubscribe()
  return subscription.endpoint
}

/** Whether this device receives push, known synchronously (for the rest-end timer). */
export function hasPushDevice(): boolean {
  try {
    return Boolean(localStorage.getItem(DEVICE_KEY))
  } catch {
    return false
  }
}

function rememberDevice(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(DEVICE_KEY, endpoint)
    else localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Only the rest-end push relies on it; it just won't be scheduled.
  }
}
