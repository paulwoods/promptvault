import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/useAuth'
import { useMe } from '../lib/useMe'
import { AppIcon } from './AppIcon'
import { ThemeToggle } from './ThemeToggle'

export function TopNav() {
  const isAuthenticated = useAuth()
  const me = useMe(isAuthenticated)

  return (
    <nav aria-label="Main">
      <div>
        <Link to="/" className="nav-brand">
          <AppIcon className="app-icon" />
          Prompt Vault
        </Link>

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
