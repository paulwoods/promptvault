import type { ReactNode } from 'react'

interface SimpleListProps {
  children: ReactNode
}

/**
 * A <ul> whose <li> are plain rows (not cards) — for name:value listings.
 * Keeps <ul>/<li> semantics so ARIA role=list and text queries still match;
 * children should keep single-text-node content.
 */
export function SimpleList({ children }: SimpleListProps) {
  return <ul className="simple-list">{children}</ul>
}
