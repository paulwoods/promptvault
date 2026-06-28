/**
 * The Prompt Vault mark: a vault door and dial enclosing a `>` command
 * prompt. Strokes use currentColor so it inherits its size and colour from
 * surrounding text; size it by setting font-size (it renders at 1em). Kept in
 * sync with public/favicon.svg.
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="5" width="22" height="22" rx="5.5" />
      <circle cx="16" cy="16" r="7.5" />
      <path d="M13.5 11.5 L18 16 L13.5 20.5" />
    </svg>
  )
}
