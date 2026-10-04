// Runs before the first paint (a plain script in <head>, so the Content-Security-Policy's
// script-src 'self' allows it): puts the theme this device chose on <html>, so the app never
// flashes another one while it loads. The app's side is src/lib/theme/palette.ts and
// next-themes; the two keys below are theirs.
(function () {
  try {
    var root = document.documentElement
    var palette = localStorage.getItem('mygymtracker-palette')
    // Any name is safe to set: one the stylesheet doesn't know matches nothing (Nocturne stays).
    if (palette && /^[a-z]+$/.test(palette)) root.setAttribute('data-palette', palette)
    var mode = localStorage.getItem('mygymtracker-theme')
    if (mode === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    if (mode === 'light') {
      root.classList.remove('dark')
      root.classList.add('light')
    }
  } catch {
    // No storage (private mode): the default theme, as the page was served.
  }
})()
