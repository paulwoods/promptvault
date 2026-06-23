import { useNavigate } from 'react-router'
import { clearToken } from '../lib/auth'

interface LogoutButtonProps {
  className?: string
}

/** Logout is client-side only: discard the token and return to login (no server revocation). */
export function LogoutButton({ className }: LogoutButtonProps) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        clearToken()
        navigate('/login', { replace: true })
      }}
    >
      Log out
    </button>
  )
}
