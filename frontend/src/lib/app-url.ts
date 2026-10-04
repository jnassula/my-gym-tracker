/**
 * Where a tap on a notification goes: an address of this app, whatever the push carried.
 * The service worker opens it, so anything else would let a push open any site.
 */
export function appUrl(url: unknown, origin: string): string {
  if (typeof url !== 'string') return '/'
  try {
    const target = new URL(url, origin)
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : '/'
  } catch {
    return '/'
  }
}
