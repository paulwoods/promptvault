import { Link, NavLink } from 'react-router'
import { getUserEmail } from '../lib/auth'
import { useAuth } from '../lib/useAuth'

export function TopNav() {
  const isAuthenticated = useAuth()
  const userEmail = getUserEmail()

  return (
    <nav aria-label="Main">
      <div>
        <Link to="/" className="nav-brand">
          Prompt Vault
        </Link>

        {isAuthenticated ? (
          <div className="nav-links">
            {userEmail ? (
              <NavLink to="/profile" className="nav-user">
                {userEmail}
              </NavLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  )
}
