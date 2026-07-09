// Theme state lives on <html class="dark"> (applied pre-paint in index.html to avoid
// a flash). This module reads/toggles it and persists the choice.

export type Theme = 'dark' | 'light'

const KEY = 'sibyl-theme'

// The theme in effect right now, per the class the pre-paint script set.
export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // private mode / storage blocked — the class still applies for this session
  }
}
