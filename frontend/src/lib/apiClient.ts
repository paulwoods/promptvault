import { ApiError } from './ApiError'
import { clearToken, getToken } from './auth'

/** Dispatched on a 401 so the app can clear state and route to /login. */
export const UNAUTHORIZED_EVENT = 'promptvault:unauthorized'

interface ErrorEnvelope {
  error?: string
  message?: string
  details?: unknown
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorEnvelope = {}
  try {
    body = (await response.json()) as ErrorEnvelope
  } catch {
    // non-JSON error body; fall back to status text
  }
  return new ApiError(
    response.status,
    body.error ?? 'error',
    body.message ?? response.statusText,
    body.details,
  )
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw await toApiError(response)
  }
  if (!response.ok) {
    throw await toApiError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
