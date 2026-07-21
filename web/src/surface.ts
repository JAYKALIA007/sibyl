// Which shell the client is running in. The desktop app picks a free port for its
// sidecar at launch and injects the API base before any page script runs; the browser
// build has no such global and talks to its own origin.
//
// Split out from api.ts so modules that only need the surface (and the tests that
// exercise them) don't have to pull in Vite's import.meta.env.

declare global {
  interface Window {
    __SIBYL_API__?: string
  }
}

export const desktopApiBase: string | undefined =
  typeof window === 'undefined' ? undefined : window.__SIBYL_API__

export const isDesktop = desktopApiBase !== undefined
