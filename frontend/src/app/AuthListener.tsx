import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { UNAUTHORIZED_EVENT } from '../lib/apiClient'

/** Centralized 401 handling: navigate to /login when the api client reports an unauthorized response. */
export function AuthListener() {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = () => navigate('/login', { replace: true })
    window.addEventListener(UNAUTHORIZED_EVENT, handler)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
  }, [navigate])
  return null
}
