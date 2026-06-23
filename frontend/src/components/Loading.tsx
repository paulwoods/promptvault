import type { ReactNode } from 'react'

interface LoadingProps {
  children?: ReactNode
}

/** Loading state placeholder (reuses the existing .loading class). */
export function Loading({ children = 'Loading…' }: LoadingProps) {
  return <p className="loading">{children}</p>
}
