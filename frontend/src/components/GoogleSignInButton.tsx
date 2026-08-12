import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { apiClient } from '../lib/apiClient'
import { setToken } from '../lib/auth'
import { errorMessage } from '../lib/errorMessage'
import { renderGoogleButton } from '../lib/googleSignIn'
import { useAuthConfig } from '../lib/useAuthConfig'
import type { LoginResponse } from '../lib/types'
import { ErrorAlert } from './ErrorAlert'

/**
 * Google sign-in, on both the login and register screens. Google is a Login
 * Method, not a separate account, so this lands in the app either way: an
 * unknown Google account is provisioned, a known one logs in, and one whose
 * verified email matches an existing account is linked onto it (ADR-0011).
 *
 * Renders nothing at all when the deployment has no Google client id.
 */
export function GoogleSignInButton() {
  const { data: config } = useAuthConfig()
  const clientId = config?.googleClientId
  const container = useRef<HTMLDivElement>(null)
  const [unavailable, setUnavailable] = useState(false)
  const navigate = useNavigate()

  const { mutate, isError, error } = useMutation({
    mutationFn: (idToken: string) =>
      apiClient.post<LoginResponse>('/api/auth/google', { idToken }),
    onSuccess: (data) => {
      setToken(data.token)
      navigate('/', { replace: true })
    },
  })

  useEffect(() => {
    const parent = container.current
    if (!clientId || !parent) {
      return
    }
    let cancelled = false
    renderGoogleButton(parent, clientId, (idToken) => {
      if (!cancelled) {
        mutate(idToken)
      }
    }).catch(() => {
      if (!cancelled) {
        setUnavailable(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [clientId, mutate])

  if (!clientId) {
    return null
  }

  return (
    <div className="google-signin">
      <p className="auth-divider">or</p>
      <div ref={container} />
      {unavailable && <ErrorAlert>Google sign-in is unavailable</ErrorAlert>}
      {isError && <ErrorAlert>{errorMessage(error)}</ErrorAlert>}
    </div>
  )
}
