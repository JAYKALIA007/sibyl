// In-app updates for the desktop build.
//
// Sibyl's promise is that your data and questions never leave the machine, so the
// update check — the one outbound request the app makes — is opt-in. Nothing here
// touches the network until the user has explicitly said yes; `autoCheckAllowed()`
// returns null on first run so the UI can ask.
//
// The Tauri plugins are dynamically imported. Static imports would pull IPC calls
// into the browser bundle, where there's no Tauri to answer them.

import { isDesktop } from './surface'

const PREF_KEY = 'sibyl-auto-update'

// The consent decision, as a pure function of the two inputs that drive it.
//
//   null  = never asked → show the opt-in
//   true  = check on launch
//   false = don't touch the network
//
// Only the desktop app can update itself, so the browser build is a hard false: it
// must never render the prompt, and must never check. Anything unreadable is also
// false — defaulting to "check anyway" would be consent we don't have.
export function decideAutoCheck(desktop: boolean, stored: string | null): boolean | null {
  if (!desktop) return false
  if (stored === null) return null
  return stored === 'true'
}

export function autoCheckAllowed(): boolean | null {
  try {
    return decideAutoCheck(isDesktop, localStorage.getItem(PREF_KEY))
  } catch {
    return false
  }
}

export function setAutoCheckAllowed(allowed: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, String(allowed))
  } catch {
    // storage unavailable — we'll just ask again next launch
  }
}

export type Available = {
  version: string
  notes?: string
  // Downloads the update, reporting 0-100 as bytes arrive. Resolves when it's staged.
  download: (onProgress: (percent: number) => void) => Promise<void>
}

// Returns null when the app is already current (or when anything at all goes wrong —
// a failed update check must never interrupt someone trying to query their database).
export async function checkForUpdate(): Promise<Available | null> {
  if (!isDesktop) return null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return null

    return {
      version: update.version,
      notes: update.body,
      download: async (onProgress) => {
        let total = 0
        let received = 0
        await update.download((event) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0
          } else if (event.event === 'Progress') {
            received += event.data.chunkLength
            if (total > 0) onProgress(Math.round((received / total) * 100))
          }
        })
        await update.install()
      },
    }
  } catch {
    return null
  }
}

// Quits and reopens the app so the staged update takes effect. The Rust exit handler
// kills the sidecar on the way out, so no orphaned Node process survives the restart.
export async function restart(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

// Lets the sidebar's "Check for updates" reach the toast, which owns the update state.
// Same shape as faultBus — the two components have no ancestor worth threading a prop
// through, and a manual check is the only way back for someone who declined the opt-in.
type Listener = () => void
const listeners = new Set<Listener>()

export const updateBus = {
  requestCheck(): void {
    for (const l of listeners) l()
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}
