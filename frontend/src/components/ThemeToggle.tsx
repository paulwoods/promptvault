import { useTheme } from '../lib/useTheme'

/**
 * Title-bar button that flips between the dark and light themes. Shows the
 * icon of the theme it will switch *to*: a sun while dark, a moon while light.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const nextIsLight = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={
        nextIsLight ? 'Switch to light theme' : 'Switch to dark theme'
      }
      title={nextIsLight ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {nextIsLight ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
