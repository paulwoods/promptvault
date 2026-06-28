import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/useAuth'
import { useMe } from '../lib/useMe'
import { AppIcon } from './AppIcon'

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

        {isAuthenticated ? (
          <div className="nav-links">
            {me.data ? (
              <NavLink to="/profile" className="nav-user">
                {me.data.name}
              </NavLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  )
}
