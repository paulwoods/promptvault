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

export { TOKEN_CHANGE_EVENT }
