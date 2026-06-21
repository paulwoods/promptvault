import { useNavigate } from 'react-router'
import { clearToken } from '../lib/auth'

/** Logout is client-side only: discard the token and return to login (no server revocation). */
export function LogoutButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        clearToken()
        navigate('/login', { replace: true })
      }}
    >
      Log out
    </button>
  )
}
