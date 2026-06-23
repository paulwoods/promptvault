import type { ReactNode } from 'react'
import { BackLink } from './BackLink'

interface PageHeaderProps {
  title: ReactNode
  back?: { to: string; label: string }
  subtitle?: ReactNode
  actions?: ReactNode
}

/**
 * Standard page header: optional back link, title, optional muted subtitle,
 * optional actions slot. Replaces the per-page <h1> + ad-hoc back-link/action
 * markup.
 */
export function PageHeader({
  title,
  back,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {back && <BackLink to={back.to}>{back.label}</BackLink>}
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}
