import { Link } from 'react-router'
import type { ReactNode } from 'react'

interface BackLinkProps {
  to: string
  children: ReactNode
}

/** A back-link rendered above a page header (replaces hand-rolled <p><Link>…</Link></p>). */
export function BackLink({ to, children }: BackLinkProps) {
  return (
    <div className="back-link">
      <Link to={to}>{children}</Link>
    </div>
  )
}
