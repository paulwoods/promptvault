import { Link, NavLink } from 'react-router'
import { useAuth } from '../lib/useAuth'
import { LogoutButton } from './LogoutButton'

export function TopNav() {
  const isAuthenticated = useAuth()

  return (
    <nav aria-label="Main">
      <div>
        <Link to="/" className="nav-brand">
          Prompt Vault
        </Link>

        {isAuthenticated ? (
          <div className="nav-links">
            <NavLink to="/" end>
              Prompts
            </NavLink>
            <NavLink to="/settings/api-key">API key</NavLink>
            <LogoutButton />
          </div>
        ) : null}
      </div>
    </nav>
  )
}
