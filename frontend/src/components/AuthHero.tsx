import { AppIcon } from './AppIcon'

interface AuthHeroProps {
  title: string
  subtitle: string
}

/**
 * Hero header for the login and register screens: the brand mark above a
 * heading and one line of context. Elsewhere the page title lives in the nav
 * bar, but the auth screens are the app's front door and carry the fuller
 * treatment. Shared so the two screens stay in step.
 */
export function AuthHero({ title, subtitle }: AuthHeroProps) {
  return (
    <header className="auth-hero">
      <AppIcon className="app-icon" />
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  )
}
