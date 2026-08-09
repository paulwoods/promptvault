import { ApiError } from './ApiError'

/**
 * Human-readable message from an unknown error, preferring the API envelope's
 * message. Validation envelopes carry the actual reason in {@code details}
 * (e.g. "Validation failed" + {model: "..."}), so those are appended --
 * the message alone tells the user nothing actionable.
 */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong',
): string {
  if (!(error instanceof ApiError)) {
    return fallback
  }
  const detail = detailText(error.details)
  return detail === null ? error.message : `${error.message}: ${detail}`
}

/** The envelope's details is a field -> message map; joins its messages, or null if there are none. */
function detailText(details: unknown): string | null {
  if (details === null || typeof details !== 'object') {
    return null
  }
  const messages = Object.values(details).filter(
    (value) => typeof value === 'string',
  )
  return messages.length === 0 ? null : messages.join('; ')
}
