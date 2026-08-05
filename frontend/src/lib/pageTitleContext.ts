import { createContext } from 'react'

export const PageTitleContext = createContext<{
  title: string | null
  setTitle: (title: string | null) => void
} | null>(null)
