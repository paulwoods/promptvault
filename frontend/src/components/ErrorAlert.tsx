import type { ReactNode } from 'react'

interface ErrorAlertProps {
  children: ReactNode
}

/**
 * Inline error with role="alert" — for form/run validation and action errors.
 * Reserved for inline errors so getByRole('alert') tests stay unambiguous;
 * use LoadError for page-level fetch failures.
 */
export function ErrorAlert({ children }: ErrorAlertProps) {
  return <p role="alert">{children}</p>
}
