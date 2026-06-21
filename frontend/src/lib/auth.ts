const TOKEN_KEY = 'promptvault.token'

/** The JWT lives in localStorage (Phase-7 decision); XSS persistence is the accepted trade. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
