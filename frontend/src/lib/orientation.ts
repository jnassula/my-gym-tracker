/**
 * The app is a portrait app. The manifest says so for the installed app on Android; this asks
 * the browser too, where it listens (an installed app, or a full-screen page: a plain tab
 * refuses). The iPhone listens to neither: there the landscape overlay (`RotateOverlay`) asks
 * the user to turn the phone back.
 */
export async function lockPortrait(): Promise<boolean> {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (kind: string) => Promise<void> }
  if (typeof orientation?.lock !== 'function') return false
  try {
    await orientation.lock('portrait')
    return true
  } catch {
    return false
  }
}
