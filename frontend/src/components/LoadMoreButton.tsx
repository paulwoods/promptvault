interface LoadMoreButtonProps {
  hasMore: boolean
  isLoading: boolean
  onClick: () => void
}

/** Append-style "Load more" control (9.2.3) — hidden once `hasMore` is false. */
export function LoadMoreButton({
  hasMore,
  isLoading,
  onClick,
}: LoadMoreButtonProps) {
  if (!hasMore) return null
  return (
    <button
      type="button"
      className="button-sm"
      disabled={isLoading}
      onClick={onClick}
    >
      {isLoading ? 'Loading…' : 'Load more'}
    </button>
  )
}
