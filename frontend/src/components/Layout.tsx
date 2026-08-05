import { Outlet } from 'react-router'
import { PageTitleProvider } from './PageTitleProvider'
import { TopNav } from './TopNav'

/**
 * App shell: sticky top nav + a full-width <main>. Every route renders inside
 * <main> via the outlet, so loading/error early-returns inherit padding
 * instead of rendering flush under the nav. PageTitleProvider lets pages push
 * their title up into the nav bar, which sits outside the outlet.
 */
export function Layout() {
  return (
    <PageTitleProvider>
      <div className="glass-backdrop" aria-hidden="true" />
      <TopNav />
      <main>
        <Outlet />
      </main>
    </PageTitleProvider>
  )
}
