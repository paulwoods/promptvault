import { ApiError } from './ApiError'

/** Human-readable message from an unknown error, preferring the API envelope's message. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong',
): string {
  return error instanceof ApiError ? error.message : fallback
}
