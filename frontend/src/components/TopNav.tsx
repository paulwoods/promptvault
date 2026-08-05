import { Link, useLocation, useSearchParams } from 'react-router'
import { useActivePageTitle } from '../lib/pageTitle'
import { useAuth } from '../lib/useAuth'
import { useMe } from '../lib/useMe'
import { AppDrawer } from './AppDrawer'
import { AppIcon } from './AppIcon'
import { ThemeToggle } from './ThemeToggle'

interface TopNavProps {
  drawerOpen: boolean
  onDrawerOpenChange: (open: boolean) => void
}

export function TopNav({ drawerOpen, onDrawerOpenChange }: TopNavProps) {
  const isAuthenticated = useAuth()
  const me = useMe(isAuthenticated)
  const isHome = useLocation().pathname === '/'
  const [searchParams, setSearchParams] = useSearchParams()
  const pageTitle = useActivePageTitle()

  return (
    <nav aria-label="Main">
      <div>
        {isAuthenticated && me.data ? (
          <AppDrawer
            userName={me.data.name}
            open={drawerOpen}
            onOpenChange={onDrawerOpenChange}
          />
        ) : null}

        <Link to="/" className="nav-brand">
          <AppIcon className="app-icon" />
          {pageTitle ? `Prompt Vault - ${pageTitle}` : 'Prompt Vault'}
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
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
