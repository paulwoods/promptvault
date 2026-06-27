const TOKEN_KEY = 'promptvault.token'
const TOKEN_CHANGE_EVENT = 'promptvault:token-change'

/** The JWT lives in localStorage (Phase-7 decision); XSS persistence is the accepted trade. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT))
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT))
}

/** Read the `email` claim out of the stored JWT payload, or null if absent/unparseable. */
export function getUserEmail(): string | null {
  const token = getToken()
  if (token == null) return null
  const payload = token.split('.')[1]
  if (payload == null) return null
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.email === 'string' ? claims.email : null
  } catch {
    return null
  }
}

export { TOKEN_CHANGE_EVENT }
