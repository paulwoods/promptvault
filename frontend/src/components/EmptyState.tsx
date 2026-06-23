import type { ReactNode } from 'react'

interface EmptyStateProps {
  children: ReactNode
}

/** Empty-collection placeholder (reuses the existing .empty class). */
export function EmptyState({ children }: EmptyStateProps) {
  return <p className="empty">{children}</p>
}
