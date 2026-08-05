import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'

interface AppDrawerProps {
  userName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Hamburger-triggered slide-out panel holding primary navigation (Home,
 * Trash, Profile). Replaces the old always-visible nav links so the title
 * bar stays uncluttered on mobile, where it already wraps under the search
 * box. Open state is controlled by Layout, which also pushes <main> aside
 * while the drawer is open.
 */
export function AppDrawer({ userName, open, onOpenChange }: AppDrawerProps) {
  const location = useLocation()
  const [lastPathname, setLastPathname] = useState(location.pathname)

  // Close the drawer on navigation. Adjusting state during render (rather
  // than in an effect) avoids an extra post-navigation render pass.
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  return (
    <>
      <button
        type="button"
        className="menu-toggle"
        onClick={() => onOpenChange(!open)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="app-drawer"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div
        id="app-drawer"
        className="app-drawer"
        data-open={open}
        aria-hidden={!open}
      >
        {/* role="navigation" instead of <nav>: a literal <nav> element would
            pick up the title bar's sticky/frosted styling from the global
            `nav` selector. */}
        <div role="navigation" aria-label="App">
          <NavLink to="/" end tabIndex={open ? undefined : -1}>
            Home
          </NavLink>
          <NavLink to="/trash" tabIndex={open ? undefined : -1}>
            Trash
          </NavLink>
          <NavLink to="/profile" tabIndex={open ? undefined : -1}>
            {userName}
          </NavLink>
        </div>
      </div>
    </>
  )
}

function MenuIcon() {
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
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
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
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
