import { Link, NavLink, useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../lib/useAuth'
import { useMe } from '../lib/useMe'
import { AppIcon } from './AppIcon'
import { ThemeToggle } from './ThemeToggle'

export function TopNav() {
  const isAuthenticated = useAuth()
  const me = useMe(isAuthenticated)
  const isHome = useLocation().pathname === '/'
  const [searchParams, setSearchParams] = useSearchParams()

  return (
    <nav aria-label="Main">
      <div>
        <Link to="/" className="nav-brand">
          <AppIcon className="app-icon" />
          Prompt Vault
        </Link>

        {/*
          Uncontrolled on purpose: react-router applies `setSearchParams` inside
          a transition, so a value bound to `?q=` lags a keystroke behind and
          fast typing loses characters. The DOM owns the text; the URL follows.
          The input only renders on home, so it remounts (and re-reads `?q=`)
          whenever the user leaves and comes back.
        */}
        {isAuthenticated && isHome && (
          <input
            type="search"
            className="nav-search"
            aria-label="Search prompts"
            placeholder="Search prompts…"
            defaultValue={searchParams.get('q') ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev)
                  if (value) next.set('q', value)
                  else next.delete('q')
                  return next
                },
                { replace: true },
              )
            }}
          />
        )}

        <div className="nav-right">
          {isAuthenticated && me.data ? (
            <div className="nav-links">
              <NavLink to="/trash">Trash</NavLink>
              <NavLink to="/profile" className="nav-user">
                {me.data.name}
              </NavLink>
            </div>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
