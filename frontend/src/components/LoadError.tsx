import type { ReactNode } from 'react'

interface LoadErrorProps {
  children: ReactNode
}

/**
 * Page-level fetch failure (e.g. "Could not load prompts."). NOT role="alert" —
 * that role is reserved for inline form/run errors (ErrorAlert).
 */
export function LoadError({ children }: LoadErrorProps) {
  return <p className="load-error">{children}</p>
}
