import { useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/**
 * The active theme is the source of truth on <html data-theme>, set before
 * paint by the inline script in index.html. This hook reads it and lets the
 * user flip it, persisting the choice so it survives reloads.
 */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)
  }

  return { theme, toggle }
}
