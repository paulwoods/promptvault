import { useState, type ReactNode } from 'react'
import { PageTitleContext } from '../lib/pageTitleContext'

/** Wraps the routed app so pages can push their title up to the nav bar. */
export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  )
}
