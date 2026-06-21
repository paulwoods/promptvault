import type { ReactElement } from 'react'
import { Navigate } from 'react-router'
import { getToken } from '../lib/auth'

/** Route guard: no token -> /login. Complements the 401 interceptor for mid-session expiry. */
export function RequireAuth({ children }: { children: ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />
}
