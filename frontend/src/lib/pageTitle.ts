import { useContext, useEffect } from 'react'
import { PageTitleContext } from './pageTitleContext'

function usePageTitleContext() {
  const ctx = useContext(PageTitleContext)
  if (!ctx) {
    throw new Error('usePageTitle must be used within a PageTitleProvider')
  }
  return ctx
}

/**
 * Sets the current page's title, shown in the nav bar as "Prompt Vault - <title>".
 * Call unconditionally near the top of a page component (before any early
 * `return`) so it still runs when the page is loading or errored.
 */
export function usePageTitle(title: string) {
  const { setTitle } = usePageTitleContext()
  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
}

/** The active page's title, or null before any page has set one. */
export function useActivePageTitle() {
  return usePageTitleContext().title
}
